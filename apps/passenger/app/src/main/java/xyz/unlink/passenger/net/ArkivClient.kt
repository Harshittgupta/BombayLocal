package xyz.unlink.passenger.net

import org.json.JSONArray
import org.json.JSONObject
import xyz.unlink.passenger.pass.ArkivBatch
import xyz.unlink.passenger.pass.ArkivRevocation
import xyz.unlink.passenger.pass.SignedRoot

/**
 * Reads Unlink entities from Arkiv over plain JSON-RPC (`arkiv_query`), the same read path as issuer/src/arkiv/reader.ts
 * (schema: arkiv/schema.md). Every query filters on type + issuer AND `$creator = $owner = issuer`, and every row's
 * creator/owner is checked again here: anyone can write entities with any attributes (SPEC §3.1 step 2, §8).
 *
 * Raw response shapes (verified live, docs/HANDOFF.md M6): u64 = hex quantity, bytes = 0x hex, addr = lowercase,
 * attributes = [{name, type, value}]. Paging is keyset (`$key > key(..) ORDER BY $key ASC`), 100 per page.
 */
/** `rpc` defaults to a real JSON-RPC POST to `rpcUrl`; tests replay recorded responses through the same parsing. */
class ArkivClient(
    private val rpcUrl: String,
    private val rpc: suspend (method: String, params: JSONArray) -> Any = { m, p -> jsonRpc(rpcUrl, m, p) },
) {

    private fun base(type: String, issuer: String): String {
        val i = issuer.lowercase()
        return "app = str('unlink') AND type = str('$type') AND issuer = addr($i) AND \$creator = addr($i) AND \$owner = addr($i)"
    }

    /** Every matching row (keyset paging), keeping only rows whose creator and owner are the issuer. */
    private suspend fun queryAll(filter: String, issuer: String): List<Map<String, String>> {
        val out = mutableListOf<Map<String, String>>()
        var after = "0x" + "0".repeat(64)
        while (true) {
            val q = "$filter AND \$key > key($after) ORDER BY \$key ASC"
            val opts = JSONObject()
                .put("select", JSONObject().put("key", true).put("owner", true).put("creator", true).put("attributes", true))
                .put("limit", "0x64")
            val result = rpc("arkiv_query", JSONArray().put(q).put(opts)) as JSONObject
            val data = result.getJSONArray("data")
            for (k in 0 until data.length()) {
                val row = data.getJSONObject(k)
                after = row.getString("key")
                if (!row.optString("creator").equals(issuer, true) || !row.optString("owner").equals(issuer, true)) continue
                out += parseAttributes(row)
            }
            if (data.length() < PAGE) return out
        }
    }

    suspend fun signedRoots(issuer: String, rootId: Long): List<SignedRoot> =
        queryAll("${base("unlink.signedRoot", issuer)} AND rootId = u64($rootId)", issuer).map { a ->
            SignedRoot(
                chainId = a.u64("chainId"), registry = a.str("registry"), issuer = a.str("issuer"), rootId = a.u64("rootId"),
                root = a.str("root"), issuedAt = a.u64("issuedAt"), expiresAt = a.u64("expiresAt"),
                leafCount = a.u64("leafCount").toInt(), revSeq = a.u64("revSeq").toInt(), signature = a.str("signature"),
            )
        }

    suspend fun leafBatches(issuer: String): List<ArkivBatch> =
        queryAll(base("unlink.leafBatch", issuer), issuer).map { a ->
            ArkivBatch(a.u64("batchNo").toInt(), a.u64("fromIndex").toInt(), a.str("leaves"))
        }

    suspend fun revocations(issuer: String): List<ArkivRevocation> =
        queryAll(base("unlink.revocation", issuer), issuer).map { a ->
            ArkivRevocation(a.u64("seq").toInt(), a.u64("fromIndex").toInt(), a.u64("count").toInt())
        }

    companion object {
        private const val PAGE = 100

        /** Flattens `attributes: [{name, type, value}]` into name -> value (values kept as the node sends them). */
        fun parseAttributes(row: JSONObject): Map<String, String> {
            val attrs = row.getJSONArray("attributes")
            return (0 until attrs.length()).associate { attrs.getJSONObject(it).let { a -> a.getString("name") to a.getString("value") } }
        }

        private fun Map<String, String>.str(name: String): String = this[name] ?: throw IllegalStateException("missing $name")

        /** u64 attributes arrive as hex quantities ("0x1f"). */
        private fun Map<String, String>.u64(name: String): Long = java.lang.Long.parseUnsignedLong(str(name).removePrefix("0x"), 16)
    }
}
