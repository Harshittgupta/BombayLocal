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
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Owns a single WebView that runs snarkjs and the protocol/ JS bundle. Every proof, verification and Poseidon/tree
 * computation on the phone goes through here, so the device uses the exact same JavaScript as the protocol/ package
 * (CLAUDE.md invariant 5: circuit <-> JS <-> phone hashing must agree).
 *
 * No network: assets (snarkjs, the protocol bundle, pass.wasm, the zkey, the vk) are served locally by
 * WebViewAssetLoader over a virtual https origin and intercepted before any request leaves the device.
 */
class WebAppEngine private constructor(private val webView: WebView) {

    private val pending = ConcurrentHashMap<String, CompletableDeferred<String>>()
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
            pending.remove(id)?.completeExceptionally(RuntimeException(message))
        }
    }

    /** Calls a method defined in bridge.js with a JSON-object argument and awaits its JSON result. */
    suspend fun call(method: String, argsJson: String): String {
        ready.await()
        val id = UUID.randomUUID().toString()
        val deferred = CompletableDeferred<String>()
        pending[id] = deferred
        val js = "window.dispatch(${JSONObject.quote(id)}," +
            "${JSONObject.quote(method)},${JSONObject.quote(argsJson)})"
        main.post { webView.evaluateJavascript(js, null) }
        return deferred.await()
    }

    companion object {
        private const val ORIGIN = "https://appassets.androidplatform.net"

        @SuppressLint("SetJavaScriptEnabled")
        suspend fun create(context: Context): WebAppEngine {
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
                    override fun shouldInterceptRequest(
                        view: WebView,
                        request: WebResourceRequest,
                    ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
                }
                val engine = WebAppEngine(wv)
                wv.addJavascriptInterface(engine.Bridge(), "AndroidBridge")
                wv.loadUrl("$ORIGIN/assets/www/index.html")
                built.complete(engine)
            }
            val engine = built.await()
            engine.ready.await()
            return engine
        }
    }
}
