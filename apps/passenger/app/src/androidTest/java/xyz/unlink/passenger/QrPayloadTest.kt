package xyz.unlink.passenger

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import com.google.zxing.qrcode.decoder.Mode
import com.google.zxing.qrcode.encoder.Encoder
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import xyz.unlink.passenger.net.RegistryReader
import xyz.unlink.passenger.prover.ProtocolEngine
import xyz.unlink.passenger.prover.ProverService
import xyz.unlink.passenger.prover.WebAppEngine
import xyz.unlink.passenger.ui.QrActivity

/** SPEC §3.4 on the device: fixture case 0 → real proof → 427-byte payload → Base45 → QR, and back. */
@RunWith(AndroidJUnit4::class)
class QrPayloadTest {
    // Keeps the test process in the foreground: some OEM builds (vivo) freeze a process with no visible activity
    // about 10 s after start, which would stall long on-device proofs.
    @get:org.junit.Rule val foreground = androidx.test.ext.junit.rules.ActivityScenarioRule(xyz.unlink.passenger.ui.QrActivity::class.java)

    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private fun asset(name: String) = JSONObject(ctx.assets.open(name).bufferedReader().use { it.readText() })
    private fun JSONArray.strings() = (0 until length()).map { get(it).toString() }

    @Test
    fun committedVectorDecodesOnThePhone() = runBlocking {
        val v = asset("qr-vectors.json")
        val p = ProtocolEngine(WebAppEngine.shared(ctx)).qrDecode(v.getString("base45"))
        assertEquals(v.getInt("zoneClass"), p.getInt("zoneClass"))
        assertEquals(v.getLong("epochId"), p.getLong("epochId"))
        assertEquals(v.getString("nullifier"), p.getString("nullifier"))
        assertEquals(v.getJSONArray("publicSignals").strings(), p.getJSONArray("publicSignals").strings())
        assertEquals(v.getJSONObject("signedRoot").getString("signature").lowercase(), p.getString("signature"))
    }

    @Test
    fun case0ProvesEncodesAndDecodesBackToTheSameFields() = runBlocking {
        val engine = WebAppEngine.shared(ctx)
        val protocol = ProtocolEngine(engine)
        val prover = ProverService(engine)
        val case0 = asset("vectors.json").getJSONArray("cases").getJSONObject(0)
        val sr = asset("qr-vectors.json").getJSONObject("signedRoot")
        val f = sr.getJSONObject("fields")

        val proof = prover.prove(case0.getJSONObject("circuitInput"))
        val payload = JSONObject()
            .put("zoneClass", case0.getInt("zoneClass")).put("epochId", case0.getLong("epochId"))
            .put("nullifier", case0.getString("nullifier")).put("proof", proof.proof)
            .put("issuer", f.getString("issuer")).put("rootId", f.getLong("rootId")).put("root", f.getString("root"))
            .put("issuedAt", f.getLong("issuedAt")).put("expiresAt", f.getLong("expiresAt"))
            .put("signature", sr.getString("signature"))
        val text = protocol.qrEncode(payload)
        assertEquals(641, text.length)

        val back = protocol.qrDecode(text)
        assertEquals(case0.getInt("zoneClass"), back.getInt("zoneClass"))
        assertEquals(case0.getLong("epochId"), back.getLong("epochId"))
        assertEquals(case0.getString("nullifier"), back.getString("nullifier"))
        assertEquals(f.getString("root").lowercase(), back.getString("root"))
        assertEquals(case0.getJSONArray("publicSignals").strings(), back.getJSONArray("publicSignals").strings())
        // The decoded proof is the fresh one, and it verifies against the public signals a scanner would derive.
        assertEquals(proof.proof.getJSONArray("pi_a").strings(), back.getJSONObject("proof").getJSONArray("pi_a").strings())
        assertTrue(prover.verify(back.getJSONObject("proof"), back.getJSONArray("publicSignals")))

        // SPEC §3.4: alphanumeric mode, error correction M, version 16.
        val qr = Encoder.encode(text, ErrorCorrectionLevel.M)
        assertEquals(Mode.ALPHANUMERIC, qr.mode)
        assertEquals(16, qr.version.versionNumber)
        assertTrue(QrActivity.renderQr(text).width > 0)
    }

    @Test
    fun issuerStateSelectorMatchesKeccak() = runBlocking {
        val h = ProtocolEngine(WebAppEngine.shared(ctx)).keccakUtf8("issuerState(address)")
        assertEquals(RegistryReader.ISSUER_STATE_SELECTOR, h.take(10))
    }
}
