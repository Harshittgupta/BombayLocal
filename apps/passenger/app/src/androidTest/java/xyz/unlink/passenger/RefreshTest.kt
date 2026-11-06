package xyz.unlink.passenger

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import xyz.unlink.passenger.net.ArkivClient
import xyz.unlink.passenger.net.RegistryReader
import xyz.unlink.passenger.pass.ArkivBatch
import xyz.unlink.passenger.pass.ArkivRevocation
import xyz.unlink.passenger.pass.NetworkPublicData
import xyz.unlink.passenger.pass.Pass
import xyz.unlink.passenger.pass.PassRepository
import xyz.unlink.passenger.pass.PassStatus
import xyz.unlink.passenger.pass.PublicData
import xyz.unlink.passenger.pass.Refresher
import xyz.unlink.passenger.pass.RootState
import xyz.unlink.passenger.prover.ProtocolEngine
import xyz.unlink.passenger.prover.WebAppEngine
import java.io.File

/**
 * SPEC §3.1 refresh on the device. Replays REAL recorded responses (apps/passenger/record-arkiv.mjs: Sepolia
 * issuerState + Arkiv SignedRoot / LeafBatches / Revocations) through the app's real ArkivClient / RegistryReader
 * parsing and the real Refresher checks. Untampered data must be accepted; a tampered leaf, signature or root must be
 * rejected with the previous root kept. A last test runs against the live network.
 */
@RunWith(AndroidJUnit4::class)
class RefreshTest {
    // Keeps the test process in the foreground: some OEM builds (vivo) freeze a process with no visible activity
    // about 10 s after start, which would stall long on-device proofs.
    @get:org.junit.Rule val foreground = androidx.test.ext.junit.rules.ActivityScenarioRule(xyz.unlink.passenger.ui.QrActivity::class.java)

    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var dir: File

    @Before
    fun freshDir() {
        dir = File(ctx.cacheDir, "refresh-test").apply { deleteRecursively(); mkdirs() }
    }

    private fun recorded(): JSONObject = JSONObject(
        InstrumentationRegistry.getInstrumentation().context.assets.open("recorded/recorded.json").bufferedReader().use { it.readText() },
    )

    /** Serves the recorded result for each request, exactly as the node returned it. */
    private class Replay(rec: JSONObject) : PublicData {
        private val rpc: suspend (String, JSONArray) -> Any = { method, params ->
            when (method) {
                "eth_call" -> rec.getString("issuerState")
                "arkiv_query" -> {
                    val q = params.getString(0)
                    when {
                        "unlink.signedRoot" in q -> rec.getJSONObject("signedRoot")
                        "unlink.leafBatch" in q -> rec.getJSONObject("leafBatch")
                        "unlink.revocation" in q -> rec.getJSONObject("revocation")
                        else -> error("unexpected query")
                    }
                }
                else -> error("unexpected method $method")
            }
        }
        private val registry = RegistryReader("replay", BuildConfig.REGISTRY, rpc)
        private val arkiv = ArkivClient("replay", rpc)
        override suspend fun issuerState(issuer: String) = registry.issuerState(issuer)
        override suspend fun signedRoots(issuer: String, rootId: Long) = arkiv.signedRoots(issuer, rootId)
        override suspend fun leafBatches(issuer: String): List<ArkivBatch> = arkiv.leafBatches(issuer)
        override suspend fun revocations(issuer: String): List<ArkivRevocation> = arkiv.revocations(issuer)
    }

    /** A pass whose leaf is a live (non-zero) leaf of the recorded tree, found with the app's own rebuild. */
    private suspend fun livePass(protocol: ProtocolEngine, data: PublicData): Pass {
        val st = data.issuerState(BuildConfig.ISSUER)
        val sr = data.signedRoots(BuildConfig.ISSUER, st.latestRootId).single()
        val batches = data.leafBatches(BuildConfig.ISSUER)
        val revs = data.revocations(BuildConfig.ISSUER)
        for (i in 0 until sr.leafCount) {
            val rb = protocol.rebuildAndPath(sr.leafCount, sr.revSeq, batches, revs, i)
            if (rb.leaf != null && rb.leaf != "0") return Pass("day-pass", i, 30000, 0, rb.leaf, 0)
        }
        error("no live leaf in the recorded tree")
    }

    private fun tamper(rec: JSONObject, entity: String, attr: String): JSONObject {
        val attrs = rec.getJSONObject(entity).getJSONArray("data").getJSONObject(0).getJSONArray("attributes")
        for (k in 0 until attrs.length()) {
            val a = attrs.getJSONObject(k)
            if (a.getString("name") == attr) {
                val v = a.getString("value")
                val i = v.length - 3
                a.put("value", v.substring(0, i) + (if (v[i] == '0') '1' else '0') + v.substring(i + 1))
            }
        }
        return rec
    }

    @Test
    fun untamperedRecordedDataIsAccepted() = runBlocking {
        val protocol = ProtocolEngine(WebAppEngine.shared(ctx))
        val data = Replay(recorded())
        val repo = PassRepository(dir).apply { savePass(livePass(protocol, data)) }
        val r = Refresher(repo, protocol, data).refresh()
        assertTrue(r.message, r.ok)
        assertEquals(PassStatus.READY, r.status)
        val root = repo.rootState()
        assertNotNull(root)
        assertEquals(recorded().getJSONObject("meta").getLong("latestRootId"), root!!.signedRoot.rootId)
        assertEquals(20, root.path.siblings.size)
    }

    private suspend fun assertRejectedKeepingOldRoot(rec: JSONObject) {
        val protocol = ProtocolEngine(WebAppEngine.shared(ctx))
        val good = Replay(recorded())
        val repo = PassRepository(dir).apply { savePass(livePass(protocol, good)) }
        // An older verified root the phone already holds (rootId lowered so the recorded one counts as newer).
        Refresher(repo, protocol, good).refresh()
        val older = repo.rootState()!!.let { RootState(it.signedRoot.copy(rootId = it.signedRoot.rootId - 1), it.path) }
        repo.saveRootState(older)

        val r = Refresher(repo, protocol, Replay(rec)).refresh()
        assertFalse("tampered data must be rejected", r.ok)
        assertTrue(r.message, r.message.startsWith("Couldn't update; your pass still works until"))
        assertEquals(older, repo.rootState())
    }

    /** Changes the low nibble of every leaf in every batch (stays < r), so some live leaf certainly changes. */
    private fun tamperLeaves(rec: JSONObject): JSONObject {
        val data = rec.getJSONObject("leafBatch").getJSONArray("data")
        for (d in 0 until data.length()) {
            val attrs = data.getJSONObject(d).getJSONArray("attributes")
            for (k in 0 until attrs.length()) {
                val a = attrs.getJSONObject(k)
                if (a.getString("name") != "leaves") continue
                val hex = StringBuilder(a.getString("value"))
                var i = 2 + 63
                while (i < hex.length) {
                    hex.setCharAt(i, if (hex[i] == '0') '1' else '0')
                    i += 64
                }
                a.put("value", hex.toString())
            }
        }
        return rec
    }

    @Test
    fun tamperedLeafIsRejected() = runBlocking { assertRejectedKeepingOldRoot(tamperLeaves(recorded())) }

    @Test
    fun tamperedSignatureIsRejected() = runBlocking { assertRejectedKeepingOldRoot(tamper(recorded(), "signedRoot", "signature")) }

    @Test
    fun tamperedRootIsRejected() = runBlocking { assertRejectedKeepingOldRoot(tamper(recorded(), "signedRoot", "root")) }

    /** Review fix (SPEC §8 tagging): a SignedRoot whose rootId is not the chain's latestRootId is refused. */
    @Test
    fun signedRootWithAnotherRootIdIsRejected() = runBlocking {
        val rec = recorded()
        val attrs = rec.getJSONObject("signedRoot").getJSONArray("data").getJSONObject(0).getJSONArray("attributes")
        for (k in 0 until attrs.length()) {
            val a = attrs.getJSONObject(k)
            if (a.getString("name") == "rootId") a.put("value", "0x" + (java.lang.Long.decode(a.getString("value")) + 1000).toString(16))
        }
        assertRejectedKeepingOldRoot(rec)
    }

    /** Review fix (SPEC §3.1 step 1): after a floor raise above our root, our root is dropped even before a new one exists. */
    @Test
    fun rootBelowRaisedFloorIsDropped() = runBlocking {
        val protocol = ProtocolEngine(WebAppEngine.shared(ctx))
        val good = Replay(recorded())
        val repo = PassRepository(dir).apply { savePass(livePass(protocol, good)) }
        Refresher(repo, protocol, good).refresh()
        assertNotNull(repo.rootState())
        val rec = recorded()
        val hex = rec.getString("issuerState").removePrefix("0x")
        val latest = java.math.BigInteger(hex.substring(192, 256), 16)
        val floor = (latest + java.math.BigInteger.ONE).toString(16).padStart(64, '0') // authority: newFloor = rootCount + 1
        rec.put("issuerState", "0x" + hex.substring(0, 64) + floor + hex.substring(128))
        val r = Refresher(repo, protocol, Replay(rec)).refresh()
        assertFalse(r.ok)
        assertNull("a root below the floor must be dropped with its proofs", repo.rootState())
    }

    @Test
    fun foreignCreatorIsIgnored() = runBlocking {
        val rec = recorded()
        rec.getJSONObject("signedRoot").getJSONArray("data").getJSONObject(0).put("creator", "0x" + "11".repeat(20))
        val protocol = ProtocolEngine(WebAppEngine.shared(ctx))
        val repo = PassRepository(dir).apply { savePass(livePass(protocol, Replay(recorded()))) }
        val r = Refresher(repo, protocol, Replay(rec)).refresh()
        assertFalse(r.ok) // the only SignedRoot was not created by the issuer: nothing to move to
        assertNull(repo.rootState())
    }

    /** Live: the real Sepolia Registry + real Arkiv. The latest root must verify and rebuild (any live leaf). */
    @Test
    fun liveNetworkRefreshVerifies() = runBlocking {
        val protocol = ProtocolEngine(WebAppEngine.shared(ctx))
        val data = NetworkPublicData(BuildConfig.SEPOLIA_RPC_DEFAULT, BuildConfig.ARKIV_RPC_DEFAULT)
        val repo = PassRepository(dir).apply { savePass(livePass(protocol, data)) }
        val r = Refresher(repo, protocol, data).refresh()
        assertTrue(r.message, r.ok)
        assertEquals(PassStatus.READY, r.status)
    }
}
