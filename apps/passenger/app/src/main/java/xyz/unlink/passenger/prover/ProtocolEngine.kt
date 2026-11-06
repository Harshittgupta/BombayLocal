package xyz.unlink.passenger.prover

import org.json.JSONArray
import org.json.JSONObject
import xyz.unlink.passenger.pass.ArkivBatch
import xyz.unlink.passenger.pass.ArkivRevocation
import xyz.unlink.passenger.pass.SignedRoot
import xyz.unlink.passenger.pass.StoredPath

/** Circuit Merkle inputs as protocol/ produces them (SPEC §3.2): compressed pathIndex, real depth, padded siblings. */
data class MerkleProof(
    val root: String,
    val leaf: String,
    val depth: Int,
    val pathIndex: Int,
    val siblings: List<String>,
)

/** Result of rebuilding the tree from Arkiv data (SPEC §3.1 step 4) and deriving our own path (step 6). */
data class Rebuild(val root: String, val covered: Boolean, val leaf: String?, val path: StoredPath?)

/**
 * Poseidon, the LeanIMT tree, the Arkiv rebuild, SPEC §3.3 signature recovery and the SPEC §3.4 QR codec, all
 * computed by the same protocol/ JS bundle the issuer and circuit use (invariant 5).
 */
class ProtocolEngine(private val engine: WebAppEngine) {

    /** Poseidon with n in {1,2,3}; inputs and output are decimal field-element strings. */
    suspend fun poseidon(n: Int, inputs: List<String>): String {
        val args = JSONObject().put("n", n).put("args", JSONArray(inputs))
        return JSONObject(engine.call("poseidon", args.toString())).getString("out")
    }

    /** Rebuilds the LeanIMT over `leaves` and returns the circuit proof for `index`. */
    suspend fun merkleProof(leaves: List<String>, index: Int): MerkleProof {
        val args = JSONObject().put("leaves", JSONArray(leaves)).put("index", index)
        val o = JSONObject(engine.call("treeProof", args.toString()))
        val sib = o.getJSONArray("siblings")
        return MerkleProof(o.getString("root"), o.getString("leaf"), o.getInt("depth"), o.getInt("pathIndex"),
            (0 until sib.length()).map { sib.getString(it) })
    }

    /** idCommitment = Poseidon1(secret); the secret goes to this one call only. */
    suspend fun idCommitment(secretDecimal: String): String =
        JSONObject(engine.call("idCommitment", "{}", secret = secretDecimal)).getString("idCommitment")

    /** leaf = Poseidon3(idCommitment, validUntilDay, zoneClass) (SPEC §3.1). */
    suspend fun passLeaf(idCommitment: String, validUntilDay: Int, zoneClass: Int): String {
        val a = JSONObject().put("idCommitment", idCommitment).put("validUntilDay", validUntilDay).put("zoneClass", zoneClass)
        return JSONObject(engine.call("passLeaf", a.toString())).getString("leaf")
    }

    /** The lowercase address that signed this root (SPEC §3.3), or an exception for a malformed signature. */
    suspend fun recoverRootSigner(sr: SignedRoot): String {
        val a = JSONObject().put("fields", sr.signedFieldsJson()).put("signature", sr.signature)
        return JSONObject(engine.call("recoverRootSigner", a.toString())).getString("signer")
    }

    suspend fun keccakUtf8(text: String): String =
        JSONObject(engine.call("keccakUtf8", JSONObject().put("text", text).toString())).getString("hash")

    /** SPEC §3.1 step 4 + 6 in protocol/ (shared with the issuer's round trip). */
    suspend fun rebuildAndPath(
        leafCount: Int,
        revSeq: Int,
        batches: List<ArkivBatch>,
        revocations: List<ArkivRevocation>,
        leafIndex: Int,
    ): Rebuild {
        val a = JSONObject()
            .put("leafCount", leafCount)
            .put("revSeq", revSeq)
            .put("leafIndex", leafIndex)
            .put("batches", JSONArray(batches.map {
                JSONObject().put("batchNo", it.batchNo).put("fromIndex", it.fromIndex).put("leavesHex", it.leavesHex)
            }))
            .put("revocations", JSONArray(revocations.map {
                JSONObject().put("seq", it.seq).put("fromIndex", it.fromIndex).put("count", it.count)
            }))
        val o = JSONObject(engine.call("rebuildAndPath", a.toString(), timeoutMs = 120_000))
        val path = o.optJSONObject("path")?.let { StoredPath.fromJson(it) }
        return Rebuild(o.getString("root"), o.getBoolean("covered"), o.optString("leaf").ifEmpty { null }, path)
    }

    /** Real Groth16 proof for one epoch, encoded as the SPEC §3.4 QR text (Base45). */
    suspend fun proveEpoch(
        secretDecimal: String,
        epochId: Long,
        validUntilDay: Int,
        zoneClass: Int,
        leaf: String,
        path: StoredPath,
        signedRoot: SignedRoot,
    ): String {
        val a = JSONObject()
            .put("epochId", epochId)
            .put("validUntilDay", validUntilDay)
            .put("zoneClass", zoneClass)
            .put("leaf", leaf)
            .put("path", path.toJson())
            .put("signedRoot", signedRoot.toJson())
        return JSONObject(engine.call("proveEpoch", a.toString(), secret = secretDecimal, timeoutMs = 120_000)).getString("qr")
    }

    /** Decodes a QR text into its fields (+ the public signals a scanner would verify). */
    suspend fun qrDecode(text: String): JSONObject =
        JSONObject(engine.call("qrDecode", JSONObject().put("text", text).toString()))

    suspend fun qrEncode(payload: JSONObject): String =
        JSONObject(engine.call("qrEncode", JSONObject().put("payload", payload).toString())).getString("text")
}
