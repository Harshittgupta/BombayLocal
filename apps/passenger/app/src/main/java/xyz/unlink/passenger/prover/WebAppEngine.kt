package xyz.unlink.passenger.prover

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Owns the single WebView that runs snarkjs and the protocol/ JS bundle. Every proof, verification, Poseidon/tree
 * computation, signature recovery and QR encoding on the phone goes through here, so the device runs the exact
 * JavaScript the protocol/ tests run (CLAUDE.md invariant 5). One instance per process (see [shared]).
 *
 * No network: assets are served locally by WebViewAssetLoader over a virtual https origin.
 *
 * Secret handling (invariant 2): a call that needs the pass secret registers it under the call id; the JS side
 * fetches it exactly once via `AndroidBridge.takeSecret(id)`. It never appears in the evaluated script text, in a
 * result, in an error message or in a log line.
 */
class WebAppEngine private constructor(private val webView: WebView) {

    private val pending = ConcurrentHashMap<String, CompletableDeferred<String>>()
    private val secrets = ConcurrentHashMap<String, String>()
    private val ready = CompletableDeferred<Unit>()
    private val main = Handler(Looper.getMainLooper())

    private inner class Bridge {
        @JavascriptInterface
        fun onReady() {
            ready.complete(Unit)
        }

        @JavascriptInterface
        fun onResult(id: String, json: String) {
            pending.remove(id)?.complete(json)
        }

        @JavascriptInterface
        fun onError(id: String, message: String) {
            pending.remove(id)?.completeExceptionally(EngineException(message))
        }

        /** One-shot: returns the secret registered for this call id and forgets it. */
        @JavascriptInterface
        fun takeSecret(id: String): String = secrets.remove(id) ?: ""
    }

    /**
     * Calls a method defined in bridge.js with a JSON-object argument and awaits its JSON result. `secret` (decimal) is
     * made available to that one call only. Times out after [timeoutMs].
     */
    suspend fun call(method: String, argsJson: String, secret: String? = null, timeoutMs: Long = DEFAULT_TIMEOUT_MS): String {
        ready.await()
        val id = UUID.randomUUID().toString()
        val deferred = CompletableDeferred<String>()
        pending[id] = deferred
        if (secret != null) secrets[id] = secret
        val js = "window.dispatch(${JSONObject.quote(id)},${JSONObject.quote(method)},${JSONObject.quote(argsJson)})"
        try {
            main.post { webView.evaluateJavascript(js, null) }
            return withTimeout(timeoutMs) { deferred.await() }
        } finally {
            pending.remove(id)
            secrets.remove(id)
        }
    }

    class EngineException(message: String) : RuntimeException(message)

    companion object {
        private const val ORIGIN = "https://appassets.androidplatform.net"
        const val DEFAULT_TIMEOUT_MS = 60_000L

        private val lock = Mutex()
        @Volatile private var instance: WebAppEngine? = null

        /** The process-wide engine (created on first use; one WebView for the whole app). */
        suspend fun shared(context: Context): WebAppEngine =
            instance ?: lock.withLock { instance ?: create(context).also { instance = it } }

        @SuppressLint("SetJavaScriptEnabled")
        private suspend fun create(context: Context): WebAppEngine {
            val appContext = context.applicationContext
            val built = CompletableDeferred<WebAppEngine>()
            Handler(Looper.getMainLooper()).post {
                val assetLoader = WebViewAssetLoader.Builder()
                    .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(appContext))
                    .build()
                val wv = WebView(appContext)
                wv.settings.javaScriptEnabled = true
                wv.settings.allowFileAccess = false
                wv.settings.allowContentAccess = false
                wv.webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                        assetLoader.shouldInterceptRequest(request.url)
                }
                val engine = WebAppEngine(wv)
                wv.addJavascriptInterface(engine.Bridge(), "AndroidBridge")
                wv.loadUrl("$ORIGIN/assets/www/index.html")
                built.complete(engine)
            }
            val engine = built.await()
            withTimeout(DEFAULT_TIMEOUT_MS) { engine.ready.await() }
            return engine
        }
    }
}
