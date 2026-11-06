package xyz.unlink.passenger.pass

import android.content.Context
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File

/**
 * App-private storage for the pass, the verified root + path, the last refresh result and the cached QR proofs.
 * Everything lives in filesDir (credential-encrypted, excluded from backup). Nothing here is the secret.
 */
class PassRepository(private val dir: File) {

    constructor(context: Context) : this(File(context.filesDir, "unlink"))

    init {
        dir.mkdirs()
    }


    private val proofsDir = File(dir, "proofs").apply { mkdirs() }

    private fun read(name: String): JSONObject? {
        val f = AtomicFile(File(dir, name))
        if (!f.baseFile.exists()) return null
        return JSONObject(String(f.readFully()))
    }

    private fun write(name: String, o: JSONObject) {
        val f = AtomicFile(File(dir, name))
        val out = f.startWrite()
        try {
            out.write(o.toString().toByteArray())
            f.finishWrite(out)
        } catch (e: Exception) {
            f.failWrite(out)
            throw e
        }
    }

    fun pass(): Pass? = read("pass.json")?.let { Pass.fromJson(it) }

    /** A new pass replaces the old one entirely: its root, path and cached proofs belong to the old secret. */
    fun savePass(p: Pass) {
        File(dir, "root.json").delete()
        File(dir, "refresh.json").delete()
        clearProofs()
        write("pass.json", p.toJson())
    }

    fun rootState(): RootState? = read("root.json")?.let { RootState.fromJson(it) }

    fun saveRootState(r: RootState) = write("root.json", r.toJson())

    /** Forget the current root (e.g. it fell below the issuer's floor) and its proofs. */
    fun dropRoot() {
        File(dir, "root.json").delete()
        clearProofs()
    }

    fun lastRefresh(): RefreshRecord? = read("refresh.json")?.let { RefreshRecord.fromJson(it) }

    fun saveRefresh(r: RefreshRecord) = write("refresh.json", r.toJson())

    // Cached QR texts, one file per epoch, tagged with the rootId they prove against.

    fun cachedProof(epochId: Long, rootId: Long): String? {
        val f = File(proofsDir, "$epochId.txt")
        if (!f.exists()) return null
        val (id, qr) = f.readText().split('\n', limit = 2).let { it[0] to it.getOrElse(1) { "" } }
        return if (id == rootId.toString() && qr.isNotEmpty()) qr else null
    }

    /**
     * The cached QR for this epoch, whatever root it was proved against. A proof on the previous root stays valid at
     * scanners until that root expires, so the lock screen keeps showing it until the new root's proof replaces it.
     */
    fun anyCachedProof(epochId: Long): String? {
        val f = File(proofsDir, "$epochId.txt")
        if (!f.exists()) return null
        return f.readText().split('\n', limit = 2).getOrNull(1)?.ifEmpty { null }
    }

    fun cacheProof(epochId: Long, rootId: Long, qr: String) {
        val tmp = File(proofsDir, "$epochId.tmp")
        tmp.writeText("$rootId\n$qr")
        tmp.renameTo(File(proofsDir, "$epochId.txt"))
    }

    /** Never keep proofs for past epochs (SPEC §6). */
    fun pruneProofsBefore(epochId: Long) {
        proofsDir.listFiles()?.forEach { f ->
            val e = f.nameWithoutExtension.toLongOrNull()
            if (e == null || e < epochId) f.delete()
        }
    }

    fun cachedEpochs(rootId: Long): List<Long> =
        proofsDir.listFiles()?.mapNotNull { f ->
            val e = f.nameWithoutExtension.toLongOrNull() ?: return@mapNotNull null
            if (f.extension == "txt" && cachedProof(e, rootId) != null) e else null
        }?.sorted() ?: emptyList()

    fun clearProofs() {
        proofsDir.listFiles()?.forEach { it.delete() }
    }
}
