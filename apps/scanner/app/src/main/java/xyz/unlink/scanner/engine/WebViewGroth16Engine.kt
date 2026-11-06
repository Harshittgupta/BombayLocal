package xyz.unlink.scanner.engine

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import xyz.unlink.scanner.verifier.Groth16Engine
import xyz.unlink.scanner.verifier.Groth16Proof
import java.math.BigInteger
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * The scanner's Groth16 engine (the M3 choice): snarkjs 0.7.6 `groth16.verify` in a WebView. Offline: the page and
 * snarkjs are served from the APK's assets by WebViewAssetLoader over a virtual https origin, and the WebView loads
 * nothing else. `verify` blocks the calling thread (never the main thread) until snarkjs answers or times out.
 */
class WebViewGroth16Engine private constructor() : Groth16Engine {

    private lateinit var webView: WebView
    private val pending = ConcurrentHashMap<String, CompletableFuture<Boolean>>()
    private val ready = CompletableFuture<Unit>()
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var dead = false

    private inner class Bridge {
        @JavascriptInterface
        fun onReady() {
            ready.complete(Unit)
        }

        @JavascriptInterface
        fun onResult(id: String, ok: Boolean) {
            pending.remove(id)?.complete(ok)
        }

        @JavascriptInterface
        fun onError(id: String, message: String) {
            pending.remove(id)?.completeExceptionally(IllegalStateException(message))
        }
    }

    override fun verify(vkJson: String, proof: Groth16Proof, publicSignals: List<BigInteger>): Boolean {
        check(Looper.myLooper() != Looper.getMainLooper()) { "verify must not run on the main thread" }
        check(!dead) { "renderer gone" }
        ready.get(TIMEOUT_MS, TimeUnit.MILLISECONDS)
        val id = UUID.randomUUID().toString()
        val result = CompletableFuture<Boolean>()
        pending[id] = result
        val signals = JSONArray(publicSignals.map { it.toString() }).toString()
        val js = "window.verifyProof(${JSONObject.quote(id)},${JSONObject.quote(vkJson)},${JSONObject.quote(signals)},${JSONObject.quote(proof.toSnarkjsJson())})"
        try {
            main.post { webView.evaluateJavascript(js, null) }
            return result.get(TIMEOUT_MS, TimeUnit.MILLISECONDS)
        } finally {
            pending.remove(id)
        }
    }

    companion object {
        private const val ORIGIN = "https://appassets.androidplatform.net"
        const val TIMEOUT_MS = 20_000L

        @Volatile private var instance: WebViewGroth16Engine? = null

        /** The process-wide engine (rebuilt after a renderer crash). Call off the main thread; blocks until snarkjs is loaded. */
        fun shared(context: Context): WebViewGroth16Engine = synchronized(this) {
            instance?.let { return it }
            val engine = WebViewGroth16Engine()
            val appContext = context.applicationContext
            Handler(Looper.getMainLooper()).post { engine.attach(appContext) }
            engine.ready.get(TIMEOUT_MS, TimeUnit.MILLISECONDS)
            instance = engine
            engine
        }
    }

    /**
     * Calls [shared] per verify, so a renderer crash costs one VERIFIER_ERROR and the next scan uses a fresh WebView.
     */
    class Rebuilding(private val context: Context) : Groth16Engine {
        override fun verify(vkJson: String, proof: Groth16Proof, publicSignals: List<BigInteger>): Boolean =
            shared(context).verify(vkJson, proof, publicSignals)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun attach(context: Context) {
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
            .build()
        val wv = WebView(context)
        wv.settings.javaScriptEnabled = true
        wv.settings.allowFileAccess = false
        wv.settings.allowContentAccess = false
        wv.settings.blockNetworkLoads = true
        wv.webViewClient = object : WebViewClient() {
            // Only the app's own assets are served; any other URL gets an empty 404.
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse =
                assetLoader.shouldInterceptRequest(request.url) ?: WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), null)

            // The renderer died (OOM kill or crash): fail every pending verify (→ VERIFIER_ERROR, fail closed),
            // drop this engine and let the next scan build a fresh one, instead of crashing the app.
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                dead = true
                ready.completeExceptionally(IllegalStateException("renderer gone"))
                pending.values.forEach { it.completeExceptionally(IllegalStateException("renderer gone")) }
                pending.clear()
                synchronized(Companion) { if (instance === this@WebViewGroth16Engine) instance = null }
                view.destroy()
                return true
            }
        }
        wv.addJavascriptInterface(Bridge(), "ScannerBridge")
        webView = wv
        wv.loadUrl("$ORIGIN/assets/www/index.html")
    }
}
