package xyz.unlink.scanner.sync

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Plain HTTP JSON for sync. This package is the scanner's ONLY networking code; OfflineVerifier never calls it
 * (invariant 3). Errors carry no request body, so nothing from the nullifier log ends up in an exception message.
 */
object Http {
    private const val TIMEOUT_MS = 15_000

    fun postJson(url: String, body: String): Pair<Int, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = TIMEOUT_MS
            c.readTimeout = TIMEOUT_MS
            c.doOutput = true
            c.setRequestProperty("content-type", "application/json")
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            return code to text
        } finally {
            c.disconnect()
        }
    }

    /** One JSON-RPC 2.0 call; returns `result` (JSONObject, JSONArray or String). */
    fun jsonRpc(url: String, method: String, params: JSONArray): Any {
        val req = JSONObject().put("jsonrpc", "2.0").put("id", 1).put("method", method).put("params", params)
        val (code, text) = postJson(url, req.toString())
        if (code !in 200..299) throw SyncException("$method: HTTP $code")
        val res = JSONObject(text)
        if (res.has("error")) throw SyncException("$method: ${res.getJSONObject("error").optString("message")}")
        return res.get("result")
    }
}

class SyncException(message: String) : Exception(message)
