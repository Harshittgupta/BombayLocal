package xyz.unlink.passenger.net

import org.json.JSONArray
import org.json.JSONObject
import xyz.unlink.passenger.pass.IssuerState
import java.math.BigInteger

/**
 * The one Sepolia read the phone makes (SPEC §3.1 step 1): `eth_call Registry.issuerState(issuer)`. Public state
 * only; every passenger of an issuer sends exactly the same call (SPEC §8, network observers).
 */
class RegistryReader(
    private val rpcUrl: String,
    private val registry: String,
    private val rpc: suspend (method: String, params: JSONArray) -> Any = { m, p -> jsonRpc(rpcUrl, m, p) },
) {

    suspend fun issuerState(issuer: String): IssuerState {
        val data = ISSUER_STATE_SELECTOR + issuer.removePrefix("0x").lowercase().padStart(64, '0')
        val call = JSONObject().put("to", registry).put("data", data)
        val hex = (rpc("eth_call", JSONArray().put(call).put("latest")) as String).removePrefix("0x")
        require(hex.length == 5 * 64) { "issuerState: unexpected return length" }
        fun word(i: Int) = hex.substring(i * 64, (i + 1) * 64)
        fun uint(i: Int) = BigInteger(word(i), 16)
        return IssuerState(
            active = uint(0).signum() != 0,
            floor = uint(1).toLong(),
            latestRoot = "0x" + word(2),
            latestRootId = uint(3).toLong(),
            latestPostedAt = uint(4).toLong(),
        )
    }

    companion object {
        /** First 4 bytes of keccak256("issuerState(address)"); an instrumented test re-derives it with protocol/. */
        const val ISSUER_STATE_SELECTOR = "0x038ab50a"
    }
}
