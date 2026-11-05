package xyz.unlink.passenger.prover

import org.json.JSONArray
import org.json.JSONObject

/** Circuit Merkle inputs as protocol/ produces them (SPEC §3.2): compressed pathIndex, real depth, padded siblings. */
data class MerkleProof(
    val root: String,
    val leaf: String,
    val depth: Int,
    val pathIndex: Int,
    val siblings: List<String>,
)

/**
 * Poseidon and the LeanIMT tree on the phone, computed by the same protocol/ JS bundle the issuer and circuit use.
 * Running the identical code is what keeps hashing byte-for-byte consistent (invariant 5).
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
        return MerkleProof(
            root = o.getString("root"),
            leaf = o.getString("leaf"),
            depth = o.getInt("depth"),
            pathIndex = o.getInt("pathIndex"),
            siblings = (0 until sib.length()).map { sib.getString(it) },
        )
    }
}
