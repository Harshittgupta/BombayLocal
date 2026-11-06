package xyz.unlink.scanner.sync

import org.json.JSONArray
import org.json.JSONObject
import org.web3j.crypto.Hash
import java.math.BigInteger

/** Registry.issuerState(issuer) (SPEC §7.1). */
data class ChainIssuer(val address: String, val active: Boolean, val floor: Long, val latestRootId: Long)

/**
 * Reads the Sepolia Registry over raw JSON-RPC `eth_call` (no web3j networking). Selectors are computed from the
 * SPEC §7.1 signatures at runtime, and the RPC's chainId must equal the deployment's before anything is trusted.
 */
class RegistryClient(
    private val registry: String,
    private val chainId: Long,
    private val rpc: (method: String, params: JSONArray) -> Any,
) {
    private fun selector(sig: String) = Hash.sha3String(sig).substring(0, 10)

    private fun call(data: String): String {
        val tx = JSONObject().put("to", registry).put("data", data)
        return (rpc("eth_call", JSONArray().put(tx).put("latest")) as String).removePrefix("0x")
    }

    private fun word(hex: String, i: Int): BigInteger {
        if (hex.length < (i + 1) * 64) throw SyncException("short eth_call result")
        return BigInteger(hex.substring(i * 64, (i + 1) * 64), 16)
    }

    fun checkChain() {
        val id = java.lang.Long.decode(rpc("eth_chainId", JSONArray()) as String)
        if (id != chainId) throw SyncException("RPC is on chain $id, expected $chainId")
    }

    /** issuers() → address[] (ABI: offset, length, items). */
    fun issuers(): List<String> {
        val hex = call(selector("issuers()"))
        val offset = word(hex, 0).toInt() / 32
        val n = word(hex, offset).toInt()
        if (n > 10_000) throw SyncException("implausible issuer count")
        return (0 until n).map { k -> "0x" + word(hex, offset + 1 + k).toString(16).padStart(40, '0') }
    }

    /** issuerState(address) → (bool active, uint64 floor, bytes32 latestRoot, uint64 latestRootId, uint64 latestPostedAt). */
    fun issuerState(issuer: String): ChainIssuer {
        val arg = issuer.lowercase().removePrefix("0x").padStart(64, '0')
        val hex = call(selector("issuerState(address)") + arg)
        return ChainIssuer(issuer.lowercase(), word(hex, 0).signum() != 0, word(hex, 1).toLong(), word(hex, 3).toLong())
    }
}
