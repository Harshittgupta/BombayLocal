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

    private fun tag(block: Long) = "0x" + java.lang.Long.toHexString(block)

    /** eth_call at a fixed block, so two providers can be compared on exactly the same state. */
    private fun call(data: String, block: Long): String {
        val tx = JSONObject().put("to", registry).put("data", data)
        return (rpc("eth_call", JSONArray().put(tx).put(tag(block))) as String).removePrefix("0x")
    }

    fun blockNumber(): Long = java.lang.Long.decode(rpc("eth_blockNumber", JSONArray()) as String)

    /** Block timestamp in unix seconds. */
    fun blockTimestamp(block: Long): Long {
        val b = rpc("eth_getBlockByNumber", JSONArray().put(tag(block)).put(false)) as? JSONObject
            ?: throw SyncException("block $block not found")
        return java.lang.Long.decode(b.getString("timestamp"))
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
    fun issuers(block: Long): List<String> {
        val hex = call(selector("issuers()"), block)
        val offset = word(hex, 0).toInt() / 32
        val n = word(hex, offset).toInt()
        if (n > 10_000) throw SyncException("implausible issuer count")
        return (0 until n).map { k -> "0x" + word(hex, offset + 1 + k).toString(16).padStart(40, '0') }
    }

    /** issuerState(address) → (bool active, uint64 floor, bytes32 latestRoot, uint64 latestRootId, uint64 latestPostedAt). */
    fun issuerState(issuer: String, block: Long): ChainIssuer {
        val arg = issuer.lowercase().removePrefix("0x").padStart(64, '0')
        val hex = call(selector("issuerState(address)") + arg, block)
        return ChainIssuer(issuer.lowercase(), word(hex, 0).signum() != 0, word(hex, 1).toLong(), word(hex, 3).toLong())
    }
}
