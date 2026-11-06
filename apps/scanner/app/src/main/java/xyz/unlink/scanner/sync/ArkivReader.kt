package xyz.unlink.scanner.sync

import org.json.JSONArray
import org.json.JSONObject

/**
 * The scanner's Arkiv reads over raw `arkiv_query` (schema: arkiv/schema.md). Every query filters on app + type +
 * writer AND `$creator = $owner = writer`, and every returned row's creator/owner is checked again here: anyone can
 * create entities with any attributes (SPEC §9). Raw shapes: u64 = hex quantity, bytes = 0x hex, addr = lowercase.
 */
class ArkivReader(private val rpc: (method: String, params: JSONArray) -> Any) {

    private fun base(type: String, writer: String): String {
        val w = writer.lowercase()
        return "app = str('unlink') AND type = str('$type') AND issuer = addr($w) AND \$creator = addr($w) AND \$owner = addr($w)"
    }

    /** The first row of `query` written by `writer` (creator and owner re-checked), as name → value. */
    private fun first(query: String, writer: String): Map<String, String>? {
        val opts = JSONObject()
            .put("select", JSONObject().put("key", true).put("owner", true).put("creator", true).put("attributes", true))
            .put("limit", "0xa")
        val data = (rpc("arkiv_query", JSONArray().put(query).put(opts)) as JSONObject).getJSONArray("data")
        for (k in 0 until data.length()) {
            val row = data.getJSONObject(k)
            if (!row.optString("creator").equals(writer, true) || !row.optString("owner").equals(writer, true)) continue
            val attrs = row.getJSONArray("attributes")
            return (0 until attrs.length()).associate { attrs.getJSONObject(it).let { a -> a.getString("name") to a.getString("value") } }
        }
        return null
    }

    /** The authority's VerifyKey whose vkSha256 is `vkSha256`: the exact verification_key.json bytes, or null. */
    fun verifyKey(authority: String, vkSha256: String): ByteArray? =
        first("${base("unlink.verifyKey", authority)} AND vkSha256 = str('$vkSha256')", authority)?.get("vk")?.let(::hexBytes)

    /** The issuer's newest ScannerList: lowercase 0x scanner addresses (20 B each, concatenated). */
    fun scannerList(issuer: String): List<String>? =
        first("${base("unlink.scannerList", issuer)} ORDER BY listNo:u64 DESC", issuer)?.get("keys")?.let { hex ->
            val b = hexBytes(hex)
            if (b.size % 20 != 0) throw SyncException("bad ScannerList length")
            (0 until b.size / 20).map { i -> "0x" + b.copyOfRange(i * 20, i * 20 + 20).joinToString("") { "%02x".format(it) } }
        }

    /** The rootId of the issuer's newest SignedRoot on Arkiv (status only), or null. */
    fun latestSignedRootId(issuer: String): Long? =
        first("${base("unlink.signedRoot", issuer)} ORDER BY rootId:u64 DESC", issuer)?.get("rootId")?.let {
            java.lang.Long.parseUnsignedLong(it.removePrefix("0x"), 16)
        }

    companion object {
        fun hexBytes(hex: String): ByteArray {
            val h = hex.removePrefix("0x")
            if (h.length % 2 != 0) throw SyncException("odd hex")
            return ByteArray(h.length / 2) { i -> h.substring(2 * i, 2 * i + 2).toInt(16).toByte() }
        }
    }
}
