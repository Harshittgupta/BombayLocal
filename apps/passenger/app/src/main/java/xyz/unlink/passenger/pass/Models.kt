package xyz.unlink.passenger.pass

import org.json.JSONArray
import org.json.JSONObject

/** A purchased pass (SPEC §3.1). The leaf and leafIndex stay on this phone: never logged, never sent after purchase. */
data class Pass(
    val product: String,
    val leafIndex: Int,
    val validUntilDay: Int,
    val zoneClass: Int,
    val leaf: String,
    val boughtAt: Long,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("product", product).put("leafIndex", leafIndex).put("validUntilDay", validUntilDay)
        .put("zoneClass", zoneClass).put("leaf", leaf).put("boughtAt", boughtAt)

    companion object {
        fun fromJson(o: JSONObject) = Pass(
            o.getString("product"), o.getInt("leafIndex"), o.getInt("validUntilDay"), o.getInt("zoneClass"),
            o.getString("leaf"), o.getLong("boughtAt"),
        )
    }
}

/** A SignedRoot as published on Arkiv (SPEC §3.3 fields + unsigned leafCount / revSeq). */
data class SignedRoot(
    val chainId: Long,
    val registry: String,
    val issuer: String,
    val rootId: Long,
    val root: String,
    val issuedAt: Long,
    val expiresAt: Long,
    val leafCount: Int,
    val revSeq: Int,
    val signature: String,
) {
    /** Exactly the signed fields, for protocol/ recoverRootSigner. */
    fun signedFieldsJson(): JSONObject = JSONObject()
        .put("chainId", chainId).put("registry", registry).put("issuer", issuer).put("rootId", rootId)
        .put("root", root).put("issuedAt", issuedAt).put("expiresAt", expiresAt)

    fun toJson(): JSONObject = signedFieldsJson().put("leafCount", leafCount).put("revSeq", revSeq).put("signature", signature)

    companion object {
        fun fromJson(o: JSONObject) = SignedRoot(
            o.getLong("chainId"), o.getString("registry"), o.getString("issuer"), o.getLong("rootId"), o.getString("root"),
            o.getLong("issuedAt"), o.getLong("expiresAt"), o.getInt("leafCount"), o.getInt("revSeq"), o.getString("signature"),
        )
    }
}

/** Our circuit Merkle inputs (SPEC §3.2): real depth, compressed pathIndex, siblings padded to 20. */
data class StoredPath(val depth: Int, val pathIndex: Int, val siblings: List<String>) {
    fun toJson(): JSONObject = JSONObject().put("depth", depth).put("pathIndex", pathIndex).put("siblings", JSONArray(siblings))

    companion object {
        fun fromJson(o: JSONObject): StoredPath {
            val s = o.getJSONArray("siblings")
            return StoredPath(o.getInt("depth"), o.getInt("pathIndex"), (0 until s.length()).map { s.getString(it) })
        }
    }
}

/** The root the phone currently proves against, with our path in it. Replaced only by a fully verified newer root. */
data class RootState(val signedRoot: SignedRoot, val path: StoredPath) {
    fun toJson(): JSONObject = JSONObject().put("signedRoot", signedRoot.toJson()).put("path", path.toJson())

    companion object {
        fun fromJson(o: JSONObject) = RootState(SignedRoot.fromJson(o.getJSONObject("signedRoot")), StoredPath.fromJson(o.getJSONObject("path")))
    }
}

/** Registry.issuerState(issuer) (SPEC §7.1). latestRoot is 0x bytes32. */
data class IssuerState(val active: Boolean, val floor: Long, val latestRoot: String, val latestRootId: Long, val latestPostedAt: Long)

data class ArkivBatch(val batchNo: Int, val fromIndex: Int, val leavesHex: String)

data class ArkivRevocation(val seq: Int, val fromIndex: Int, val count: Int)

/** What the pass screen says after the last refresh attempt. */
enum class PassStatus { NO_PASS, WAITING, READY, REVOKED, MISMATCH }

data class RefreshRecord(val at: Long, val ok: Boolean, val status: PassStatus, val message: String) {
    fun toJson(): JSONObject = JSONObject().put("at", at).put("ok", ok).put("status", status.name).put("message", message)

    companion object {
        fun fromJson(o: JSONObject) = RefreshRecord(o.getLong("at"), o.getBoolean("ok"), PassStatus.valueOf(o.getString("status")), o.getString("message"))
    }
}
