package xyz.unlink.scanner.verifier

import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.OutputStreamWriter
import java.math.BigInteger

object Repo {
    val root = File(System.getProperty("unlink.repoRoot") ?: "../../..").canonicalFile
    fun file(rel: String) = File(root, rel)
    val vkJson: String by lazy { file("circuits/artifacts/verification_key.json").readText() }
}

/**
 * Real Groth16 for the JVM tests: one long-lived `node` process running snarkjs 0.7.6 `groth16.verify` (the same
 * library and version the app's WebView engine runs). Needs `cd circuits && npm ci`.
 */
object NodeSnarkjsEngine : Groth16Engine {
    private val proc: Process by lazy {
        val script = File(NodeSnarkjsEngine::class.java.getResource("/snarkjs-verify.mjs")!!.toURI())
        ProcessBuilder("node", script.path, Repo.file("circuits/package.json").path)
            .redirectError(ProcessBuilder.Redirect.INHERIT)
            .start()
    }
    private val out by lazy { OutputStreamWriter(proc.outputStream, Charsets.UTF_8) }
    private val inp: BufferedReader by lazy { proc.inputStream.bufferedReader() }

    @Synchronized
    override fun verify(vkJson: String, proof: Groth16Proof, publicSignals: List<BigInteger>): Boolean {
        val req = JSONObject()
            .put("vk", vkJson)
            .put("publicSignals", publicSignals.map { it.toString() })
            .put("proof", JSONObject(proof.toSnarkjsJson()))
        out.write(req.toString() + "\n")
        out.flush()
        val line = inp.readLine() ?: error("snarkjs engine exited")
        return when (line) {
            "true" -> true
            "false" -> false
            else -> error("snarkjs engine: $line")
        }
    }
}

/** A fixture case from fixtures/qr/<name>.json (written by scripts/make-qr-fixtures.ts). */
class QrFixture(val name: String, private val j: JSONObject) {
    val note: String = j.getString("note")
    val qrText: String = j.getString("qrText")
    val nowMs: Long = j.getLong("nowMs")
    val expected: JSONObject = j.getJSONObject("expected")

    fun store(): MemoryStore {
        val s = j.getJSONObject("storeState")
        val issuers = s.getJSONArray("issuers").let { a ->
            (0 until a.length()).associate { i ->
                val o = a.getJSONObject(i)
                o.getString("address").lowercase() to IssuerRecord(o.getBoolean("active"), o.getLong("floor"), o.getLong("latestRootId"))
            }
        }
        val st = MemoryStore(
            chainId = s.getLong("chainId"),
            registry = Hex.bytes(s.getString("registry"), 20),
            lastSync = s.getLong("lastSyncMs"),
            issuers = issuers,
            vk = if (s.isNull("vk")) null else Repo.file(s.getString("vk")).readText(),
            required = if (s.isNull("requiredClass")) null else s.getInt("requiredClass"),
        )
        val ns = s.getJSONArray("nullifiers")
        for (i in 0 until ns.length()) {
            val o = ns.getJSONObject(i)
            st.putNullifier(
                NullifierRecord(BigInteger(o.getString("nullifier")), o.getLong("epochId"), o.getInt("count"), o.getLong("firstSeenMs"), o.getLong("lastReadMs")),
            )
        }
        return st
    }

    companion object {
        fun all(): List<QrFixture> =
            Repo.file("fixtures/qr").listFiles { f -> f.name.endsWith(".json") }!!.sortedBy { it.name }
                .map { QrFixture(it.name.removeSuffix(".json"), JSONObject(it.readText())) }

        fun named(n: String) = all().single { it.name == n }
    }
}
