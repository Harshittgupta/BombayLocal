package xyz.unlink.passenger.prover

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class SelfTestResult(
    val proveMs: Long,
    val verified: Boolean,
    val publicSignalsMatch: Boolean,
    val publicSignals: List<String>,
)

private fun Context.readAsset(name: String): String =
    assets.open(name).bufferedReader().use { it.readText() }

private fun JSONArray.toStringList(): List<String> = (0 until length()).map { getString(it) }

/**
 * The module-3 spike, shared by the instrumented test and the demo screen: take fixture case 0, prove it on this
 * device, verify the proof on-device, and check the public signals equal the committed fixture. No secrets are
 * logged or returned (the input's secret stays inside the engine).
 */
suspend fun runProveSelfTest(context: Context, prover: ProverService): SelfTestResult {
    val vectors = JSONObject(context.readAsset("vectors.json"))
    val case0 = vectors.getJSONArray("cases").getJSONObject(0)
    val input = case0.getJSONObject("circuitInput")
    val expected = case0.getJSONArray("publicSignals").toStringList()

    val start = System.nanoTime()
    val result = prover.prove(input)
    val proveMs = (System.nanoTime() - start) / 1_000_000

    val verified = prover.verify(result.proof, result.publicSignals)
    val actual = result.publicSignals.toStringList()
    return SelfTestResult(proveMs, verified, actual == expected, actual)
}
