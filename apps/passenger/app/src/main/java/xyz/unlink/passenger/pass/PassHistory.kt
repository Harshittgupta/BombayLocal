package xyz.unlink.passenger.pass

import android.content.Context
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Passes this phone held before the current one, for the "Previous passes" list only. Each entry is the product, its
 * last valid day and when it was bought and replaced: no secret, leaf, leafIndex or root. A replaced pass can never be
 * shown again (its secret is gone), so the list is labelled as no longer usable. App-private, excluded from backup.
 */
class PassHistory(private val file: AtomicFile) {

    constructor(context: Context) : this(AtomicFile(File(File(context.filesDir, "unlink").apply { mkdirs() }, "history.json")))

    data class Entry(val product: String, val validUntilDay: Int, val boughtAt: Long, val replacedAt: Long)

    fun entries(): List<Entry> {
        if (!file.baseFile.exists()) return emptyList()
        val a = runCatching { JSONArray(String(file.readFully())) }.getOrElse { return emptyList() }
        return (0 until a.length()).map { i ->
            val o = a.getJSONObject(i)
            Entry(o.getString("product"), o.getInt("validUntilDay"), o.getLong("boughtAt"), o.getLong("replacedAt"))
        }
    }

    /** Records [old] as replaced now (unix seconds, like [Pass.boughtAt]). Newest first, at most [MAX] entries. */
    fun recordReplaced(old: Pass, nowSec: Long = System.currentTimeMillis() / 1000) {
        val list = listOf(Entry(old.product, old.validUntilDay, old.boughtAt, nowSec)) + entries()
        val a = JSONArray()
        list.take(MAX).forEach {
            a.put(JSONObject().put("product", it.product).put("validUntilDay", it.validUntilDay).put("boughtAt", it.boughtAt).put("replacedAt", it.replacedAt))
        }
        val out = file.startWrite()
        try {
            out.write(a.toString().toByteArray())
            file.finishWrite(out)
        } catch (e: Exception) {
            file.failWrite(out)
            throw e
        }
    }

    private companion object {
        const val MAX = 10
    }
}
