package xyz.unlink.passenger.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Minimal HTTPS JSON POST (no SDK, no third-party HTTP library). Bodies are never logged. */
internal suspend fun postJson(url: String, body: JSONObject, timeoutMs: Int = 20_000): JSONObject = withContext(Dispatchers.IO) {
    val conn = URL(url).openConnection() as HttpURLConnection
    try {
        conn.requestMethod = "POST"
        conn.connectTimeout = timeoutMs
        conn.readTimeout = timeoutMs
        conn.doOutput = true
        conn.setRequestProperty("content-type", "application/json")
        conn.outputStream.use { it.write(body.toString().toByteArray()) }
        val code = conn.responseCode
        val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        if (code !in 200..299) throw IOException("HTTP $code")
        JSONObject(text)
    } finally {
        conn.disconnect()
    }
}

/** One JSON-RPC 2.0 call; returns `result` or throws with the RPC error message. */
internal suspend fun jsonRpc(url: String, method: String, params: JSONArray): Any {
    val res = postJson(url, JSONObject().put("jsonrpc", "2.0").put("id", 1).put("method", method).put("params", params))
    res.optJSONObject("error")?.let { throw IOException("rpc ${it.optInt("code")}: ${it.optString("message")}") }
    return res.get("result")
}
