package xyz.unlink.scanner

import android.os.Process
import android.util.Log
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import xyz.unlink.scanner.engine.WebViewGroth16Engine
import xyz.unlink.scanner.store.IssuerRow
import xyz.unlink.scanner.store.KvRow
import xyz.unlink.scanner.store.NullifierRow
import xyz.unlink.scanner.store.RoomVerifierStore
import xyz.unlink.scanner.store.ScannerDb
import xyz.unlink.scanner.verifier.Hex
import xyz.unlink.scanner.verifier.OfflineVerifier
import xyz.unlink.scanner.verifier.QrPayload
import xyz.unlink.scanner.verifier.Status
import java.math.BigInteger
import java.security.MessageDigest

/**
 * The verifier on the phone with the app's real engine (snarkjs in a WebView) and the app's real Room store: every
 * fixtures/qr case must give the same result as on the JVM. Also measures verify() latency (SPEC §10, < 1 s).
 */
@RunWith(AndroidJUnit4::class)
class OnDeviceVerifierTest {
    private val target = InstrumentationRegistry.getInstrumentation().targetContext
    private val testAssets = InstrumentationRegistry.getInstrumentation().context.assets
    private val vk: String = target.assets.open("verification_key.json").bufferedReader().use { it.readText() }

    private fun fixtures(): List<Pair<String, JSONObject>> =
        testAssets.list("qr")!!.sorted().map { it to JSONObject(testAssets.open("qr/$it").bufferedReader().use { r -> r.readText() }) }

    /** A fresh in-memory Room database seeded with the fixture's storeState, behind the app's RoomVerifierStore. */
    private fun store(j: JSONObject): Pair<RoomVerifierStore, ScannerDb> {
        val db = Room.inMemoryDatabaseBuilder(target, ScannerDb::class.java).build()
        val dao = db.dao()
        val s = j.getJSONObject("storeState")
        val iss = s.getJSONArray("issuers")
        for (i in 0 until iss.length()) {
            val o = iss.getJSONObject(i)
            dao.upsertIssuer(IssuerRow(o.getString("address").lowercase(), o.getBoolean("active"), o.getLong("floor"), o.getLong("latestRootId"), 0, false))
        }
        dao.put(KvRow(RoomVerifierStore.K_LAST_SYNC, s.getLong("lastSyncMs").toString()))
        if (!s.isNull("vk")) dao.put(KvRow(RoomVerifierStore.K_VK, vk))
        val ns = s.getJSONArray("nullifiers")
        for (i in 0 until ns.length()) {
            val o = ns.getJSONObject(i)
            dao.upsertNullifier(NullifierRow(o.getString("nullifier"), o.getLong("epochId"), o.getInt("count"), o.getLong("firstSeenMs"), o.getLong("lastReadMs")))
        }
        val required = if (s.isNull("requiredClass")) null else s.getInt("requiredClass")
        return RoomVerifierStore(dao, s.getLong("chainId"), Hex.bytes(s.getString("registry"), 20)) { required } to db
    }

    @Test
    fun bundledVkMatchesPinnedHash() {
        val h = MessageDigest.getInstance("SHA-256").digest(vk.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        assertEquals(BuildConfig.VK_HASH, h)
    }

    @Test
    fun everyFixtureMatchesOnDeviceWithRoomStore() {
        val v = OfflineVerifier(WebViewGroth16Engine.Rebuilding(target))
        val all = fixtures()
        assertTrue("fixtures bundled", all.size >= 70)
        val failures = mutableListOf<String>()
        val nullifiers = mutableSetOf<String>()
        for ((name, j) in all) {
            val (st, db) = store(j)
            val hadPrior = QrPayload.parse(j.getString("qrText"))?.let { st.nullifier(it.nullifier) != null } ?: false
            val r = v.verify(j.getString("qrText"), j.getLong("nowMs"), st)
            val ex = j.getJSONObject("expected")
            if (r.status.name != ex.getString("result") || r.reason.name != ex.getString("reason")) {
                failures += "$name: got ${r.status}/${r.reason}, expected ${ex.getString("result")}/${ex.getString("reason")}"
            }
            val q = QrPayload.parse(j.getString("qrText"))
            if (q != null) nullifiers += q.nullifier.toString()
            if (ex.has("nullifierCount")) {
                val n = q!!.nullifier
                if (st.nullifier(n)?.count != ex.getInt("nullifierCount")) failures += "$name: count ${st.nullifier(n)?.count}"
            }
            if (ex.has("absent")) {
                val a = ex.getJSONArray("absent")
                for (i in 0 until a.length()) if (st.nullifier(BigInteger(a.getString(i))) != null) failures += "$name: not purged"
            }
            // Only a nullifier's first sighting is queued for the scan-batch upload (review fix: no re-uploads).
            val reachedStep8 = r.status != Status.RED || r.reason.name == "DUPLICATE"
            val queued = db.dao().pendingEpochs().flatMap { db.dao().pending(it) }
            if ((reachedStep8 && !hadPrior) != queued.isNotEmpty()) failures += "$name: queue ${queued.size} after ${r.status}/${r.reason}"
            db.close()
        }
        assertTrue(failures.joinToString("\n"), failures.isEmpty())

        // Invariant 1: nothing about a scan reaches this process's log.
        val log = Runtime.getRuntime().exec(arrayOf("logcat", "-d", "--pid=${Process.myPid()}")).inputStream.bufferedReader().readText()
        for (n in nullifiers) assertFalse("nullifier in logcat", log.contains(n))
    }

    @Test
    fun measureVerifyLatencyOnDevice() {
        val v = OfflineVerifier(WebViewGroth16Engine.Rebuilding(target))
        val (_, j) = fixtures().single { it.first == "valid.json" }
        repeat(3) { val (st, db) = store(j); v.verify(j.getString("qrText"), j.getLong("nowMs"), st); db.close() }
        val times = (1..20).map {
            val (st, db) = store(j)
            val t0 = System.nanoTime()
            val r = v.verify(j.getString("qrText"), j.getLong("nowMs"), st)
            val dt = (System.nanoTime() - t0) / 1e6
            assertEquals(Status.GREEN, r.status)
            db.close()
            dt
        }.sorted()
        Log.i("UnlinkLatency", "verify() on device with Room store: median %.1f ms, min %.1f, max %.1f (n=20)".format(times[10], times.first(), times.last()))
        assertTrue("SPEC §10 target < 1 s, median ${times[10]} ms", times[10] < 1000.0)
    }
}
