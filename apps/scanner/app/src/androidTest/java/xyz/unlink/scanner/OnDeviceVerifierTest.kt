package xyz.unlink.scanner

import android.util.Log
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import xyz.unlink.scanner.engine.WebViewGroth16Engine
import xyz.unlink.scanner.verifier.Hex
import xyz.unlink.scanner.verifier.IssuerRecord
import xyz.unlink.scanner.verifier.MemoryStore
import xyz.unlink.scanner.verifier.NullifierRecord
import xyz.unlink.scanner.verifier.OfflineVerifier
import xyz.unlink.scanner.verifier.QrPayload
import xyz.unlink.scanner.verifier.Status
import java.math.BigInteger
import java.security.MessageDigest

/**
 * The verifier on the phone with the app's real engine (snarkjs in a WebView): every fixtures/qr case must give the
 * same result as on the JVM, and verify() latency (SPEC §10, target < 1 s) is measured on the device.
 */
@RunWith(AndroidJUnit4::class)
class OnDeviceVerifierTest {
    // Keeps the process in the foreground (some OEM builds freeze background processes during long tests).
    @get:Rule val foreground = ActivityScenarioRule(MainActivity::class.java)

    private val target = InstrumentationRegistry.getInstrumentation().targetContext
    private val testAssets = InstrumentationRegistry.getInstrumentation().context.assets
    private val vk: String = target.assets.open("verification_key.json").bufferedReader().use { it.readText() }

    private fun fixtures(): List<Pair<String, JSONObject>> =
        testAssets.list("qr")!!.sorted().map { it to JSONObject(testAssets.open("qr/$it").bufferedReader().use { r -> r.readText() }) }

    private fun store(j: JSONObject): MemoryStore {
        val s = j.getJSONObject("storeState")
        val iss = s.getJSONArray("issuers")
        val issuers = (0 until iss.length()).associate { i ->
            val o = iss.getJSONObject(i)
            o.getString("address").lowercase() to IssuerRecord(o.getBoolean("active"), o.getLong("floor"))
        }
        val st = MemoryStore(
            s.getLong("chainId"), Hex.bytes(s.getString("registry"), 20), s.getLong("lastSyncMs"), issuers, vk,
            if (s.isNull("requiredClass")) null else s.getInt("requiredClass"),
        )
        val ns = s.getJSONArray("nullifiers")
        for (i in 0 until ns.length()) {
            val o = ns.getJSONObject(i)
            st.putNullifier(NullifierRecord(BigInteger(o.getString("nullifier")), o.getLong("epochId"), o.getInt("count"), o.getLong("firstSeenMs"), o.getLong("lastReadMs")))
        }
        return st
    }

    @Test
    fun bundledVkMatchesPinnedHash() {
        val h = MessageDigest.getInstance("SHA-256").digest(vk.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        assertEquals(BuildConfig.VK_HASH, h)
    }

    @Test
    fun everyFixtureMatchesOnDevice() {
        val v = OfflineVerifier(WebViewGroth16Engine.shared(target))
        val all = fixtures()
        assertTrue("fixtures bundled", all.size >= 60)
        val failures = mutableListOf<String>()
        for ((name, j) in all) {
            val st = store(j)
            val r = v.verify(j.getString("qrText"), j.getLong("nowMs"), st)
            val ex = j.getJSONObject("expected")
            if (r.status.name != ex.getString("result") || r.reason.name != ex.getString("reason")) {
                failures += "$name: got ${r.status}/${r.reason}, expected ${ex.getString("result")}/${ex.getString("reason")}"
            }
            if (ex.has("nullifierCount")) {
                val n = QrPayload.parse(j.getString("qrText"))!!.nullifier
                if (st.nullifier(n)?.count != ex.getInt("nullifierCount")) failures += "$name: count ${st.nullifier(n)?.count}"
            }
        }
        assertTrue(failures.joinToString("\n"), failures.isEmpty())
    }

    @Test
    fun measureVerifyLatencyOnDevice() {
        val v = OfflineVerifier(WebViewGroth16Engine.shared(target))
        val (_, j) = fixtures().single { it.first == "valid.json" }
        repeat(3) { v.verify(j.getString("qrText"), j.getLong("nowMs"), store(j)) }
        val times = (1..20).map {
            val st = store(j)
            val t0 = System.nanoTime()
            val r = v.verify(j.getString("qrText"), j.getLong("nowMs"), st)
            val dt = (System.nanoTime() - t0) / 1e6
            assertEquals(Status.GREEN, r.status)
            dt
        }.sorted()
        val cold = run {
            val t0 = System.nanoTime()
            QrPayload.parse(j.getString("qrText"))
            (System.nanoTime() - t0) / 1e6
        }
        Log.i("UnlinkLatency", "verify() on device: median %.1f ms, min %.1f, max %.1f (n=20); parse+curve checks %.1f ms".format(times[10], times.first(), times.last(), cold))
        assertTrue("SPEC §10 target < 1 s, median ${times[10]} ms", times[10] < 1000.0)
    }
}
