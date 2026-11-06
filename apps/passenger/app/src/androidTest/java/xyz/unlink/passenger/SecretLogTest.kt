package xyz.unlink.passenger

import android.os.Process
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith
import xyz.unlink.passenger.pass.KeystoreSecretStore
import xyz.unlink.passenger.pass.SignedRoot
import xyz.unlink.passenger.pass.StoredPath
import xyz.unlink.passenger.prover.ProtocolEngine
import xyz.unlink.passenger.prover.WebAppEngine
import java.math.BigInteger

/**
 * Invariant 2 on the device: a Keystore-wrapped secret goes through idCommitment and a real proveEpoch, and then this
 * app's logcat contains neither the secret (decimal or hex) nor the leaf.
 */
@RunWith(AndroidJUnit4::class)
class SecretLogTest {
    // Keeps the test process in the foreground: some OEM builds (vivo) freeze a process with no visible activity
    // about 10 s after start, which would stall long on-device proofs.
    @get:org.junit.Rule val foreground = androidx.test.ext.junit.rules.ActivityScenarioRule(xyz.unlink.passenger.ui.QrActivity::class.java)

    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext

    /** Review fix: a failed purchase (pending secret discarded) leaves the current secret usable; a commit swaps it. */
    @Test
    fun failedPurchaseKeepsTheCurrentSecret() {
        val store = KeystoreSecretStore(ctx, "test-staging.bin", "unlink-test-staging")
        val current = store.createSecret()
        val staged = store.createPending()
        store.discardPending()
        assertEquals(current, store.readSecret())
        val next = store.createPending()
        store.commitPending()
        assertEquals(next, store.readSecret())
        assertFalse(staged == next)
        store.clear()
    }

    @Test
    fun secretNeverReachesLogcat() = runBlocking {
        val store = KeystoreSecretStore(ctx, "test-secret.bin", "unlink-test-secret")
        val secret = store.createSecret()
        assertEquals(secret, store.readSecret()) // Keystore wrap / unwrap round trip

        val protocol = ProtocolEngine(WebAppEngine.shared(ctx))
        val idc = protocol.idCommitment(secret)
        val epoch = System.currentTimeMillis() / 1000 / 600
        val today = ((epoch * 600 + 19_800) / 86_400).toInt()
        val leaf = protocol.passLeaf(idc, today + 1, 0)
        val mp = protocol.merkleProof(listOf(leaf, "1"), 0)
        val v = JSONObject(ctx.assets.open("qr-vectors.json").bufferedReader().use { it.readText() }).getJSONObject("signedRoot")
        val f = v.getJSONObject("fields")
        val sr = SignedRoot(
            f.getLong("chainId"), f.getString("registry"), f.getString("issuer"), f.getLong("rootId"),
            "0x" + BigInteger(mp.root).toString(16).padStart(64, '0'), f.getLong("issuedAt"), f.getLong("expiresAt"),
            2, 0, v.getString("signature"),
        )
        val qr = protocol.proveEpoch(store.readSecret(), epoch, today + 1, 0, leaf, StoredPath(mp.depth, mp.pathIndex, mp.siblings), sr)
        assertEquals(641, qr.length)
        store.clear()

        val log = Runtime.getRuntime().exec(arrayOf("logcat", "-d", "--pid=${Process.myPid()}")).inputStream.bufferedReader().readText()
        assertFalse("secret (decimal) in logcat", log.contains(secret))
        assertFalse("secret (hex) in logcat", log.contains(BigInteger(secret).toString(16)))
        assertFalse("leaf in logcat", log.contains(leaf))
    }
}
