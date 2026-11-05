package xyz.unlink.passenger.prover

import org.json.JSONArray
import org.json.JSONObject

/** A real Groth16 proof and its public signals (SPEC §4 order: root, nullifier, epochId, currentDay, zoneClass). */
data class ProofResult(val proof: JSONObject, val publicSignals: JSONArray)

/**
 * Real on-device Groth16 proving and verification via snarkjs running in the WebAppEngine. This is the start of the
 * passenger app's ProverService, not throwaway spike code.
 */
class ProverService(private val engine: WebAppEngine) {

    /** circuitInput is the object protocol/ buildCircuitInput produces (see the `circuitInput` field in fixtures). */
    suspend fun prove(circuitInput: JSONObject): ProofResult {
        val res = JSONObject(engine.call("prove", JSONObject().put("input", circuitInput).toString()))
        return ProofResult(res.getJSONObject("proof"), res.getJSONArray("publicSignals"))
    }

    /** Verifies a proof on-device against the bundled verification key. */
    suspend fun verify(proof: JSONObject, publicSignals: JSONArray): Boolean {
        val args = JSONObject().put("proof", proof).put("publicSignals", publicSignals)
        return JSONObject(engine.call("verify", args.toString())).getBoolean("ok")
    }
}
