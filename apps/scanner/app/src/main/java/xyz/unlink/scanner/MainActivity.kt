package xyz.unlink.scanner

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.util.Size
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import xyz.unlink.scanner.engine.WebViewGroth16Engine
import xyz.unlink.scanner.scan.QrAnalyzer
import xyz.unlink.scanner.verifier.OfflineVerifier
import xyz.unlink.scanner.verifier.Reason
import xyz.unlink.scanner.verifier.Result
import xyz.unlink.scanner.verifier.Status
import java.util.concurrent.Executors

/**
 * The TC's scanner: camera → ZXing → OfflineVerifier (no network) → a full-screen Green / Amber / Red result.
 * The camera keeps decoding while a result is shown (SPEC §5 step 8: a code held in view is the same showing);
 * the screen returns to scanning 2 s after the code was last seen. A long-press on the status line shows latency.
 */
class MainActivity : ComponentActivity() {

    private val analyzerThread = Executors.newSingleThreadExecutor() // decode + verify (never the main thread)
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val store by lazy { ScannerApp.store(this) }
    private val verifier by lazy { OfflineVerifier(WebViewGroth16Engine.Rebuilding(applicationContext)) }

    private lateinit var preview: PreviewView
    private lateinit var chip: TextView
    private lateinit var overlay: LinearLayout
    private lateinit var title: TextView
    private lateinit var detail: TextView
    private lateinit var latency: TextView
    private var showLatency = false
    private var lastSeen = 0L

    private val askCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) startCamera() else chip.text = "Camera permission is needed to scan"
    }

    private val hideWhenGone = object : Runnable {
        override fun run() {
            if (SystemClock.uptimeMillis() - lastSeen >= RESULT_HOLD_MS) overlay.visibility = View.GONE
            else main.postDelayed(this, 200)
        }
    }

    private val refreshChip = object : Runnable {
        override fun run() {
            io.execute {
                val text = ResultText.syncAge(store.lastSyncMs(), System.currentTimeMillis())
                main.post { chip.text = text }
            }
            main.postDelayed(this, 30_000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildUi())
        analyzerThread.execute { runCatching { WebViewGroth16Engine.shared(applicationContext) } } // warm up snarkjs
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startCamera()
        else askCamera.launch(Manifest.permission.CAMERA)
    }

    override fun onResume() {
        super.onResume()
        main.post(refreshChip)
    }

    override fun onPause() {
        super.onPause()
        main.removeCallbacks(refreshChip)
    }

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            val provider = future.get()
            val p = Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }
            val analysis = ImageAnalysis.Builder()
                .setResolutionSelector(
                    ResolutionSelector.Builder().setResolutionStrategy(
                        ResolutionStrategy(Size(1280, 720), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER),
                    ).build(),
                )
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(analyzerThread, QrAnalyzer(::onText))
            provider.unbindAll()
            provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, p, analysis)
        }, ContextCompat.getMainExecutor(this))
    }

    /** Analyzer thread. */
    private fun onText(text: String, decodeMs: Double) {
        val t0 = System.nanoTime()
        val r = verifier.verify(text, System.currentTimeMillis(), store)
        val verifyMs = (System.nanoTime() - t0) / 1e6
        if (!r.sameShowing) Log.i(TAG, "scan ${r.status} ${r.reason}") // result and reason code only
        main.post { show(r, decodeMs, verifyMs) }
    }

    private fun show(r: Result, decodeMs: Double, verifyMs: Double) {
        lastSeen = SystemClock.uptimeMillis()
        if (!r.sameShowing || overlay.visibility != View.VISIBLE) {
            overlay.setBackgroundColor(ResultText.color(r.status))
            title.text = ResultText.title(r.reason)
            detail.text = r.warnings.drop(1).joinToString("\n") { ResultText.title(it) }
            if (!r.sameShowing) {
                overlay.performHapticFeedback(if (r.status == Status.GREEN) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.REJECT)
            }
        }
        latency.text = "decode %.0f ms · verify %.0f ms".format(decodeMs, verifyMs)
        latency.visibility = if (showLatency) View.VISIBLE else View.GONE
        overlay.visibility = View.VISIBLE
        main.removeCallbacks(hideWhenGone)
        main.postDelayed(hideWhenGone, RESULT_HOLD_MS)
        if (r.reason == Reason.SCANNER_STALE) main.post(refreshChip)
    }

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun buildUi(): View {
        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        preview = PreviewView(this)
        root.addView(preview, FrameLayout.LayoutParams(-1, -1))

        val top = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.argb(170, 0, 0, 0))
            setPadding(dp(16), dp(36), dp(16), dp(12))
            gravity = Gravity.CENTER_VERTICAL
        }
        chip = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 16f
            setOnLongClickListener {
                showLatency = !showLatency
                latency.visibility = if (showLatency) View.VISIBLE else View.GONE
                true
            }
        }
        top.addView(chip, LinearLayout.LayoutParams(0, -2, 1f))
        top.addView(TextView(this).apply {
            text = "Settings"
            setTextColor(Color.WHITE)
            textSize = 16f
            setPadding(dp(12), dp(8), 0, dp(8))
            setOnClickListener { startActivity(Intent(this@MainActivity, SettingsActivity::class.java)) }
        })
        root.addView(top, FrameLayout.LayoutParams(-1, -2, Gravity.TOP))

        root.addView(TextView(this).apply {
            text = "Point the camera at the passenger's pass"
            setTextColor(Color.WHITE)
            textSize = 16f
            gravity = Gravity.CENTER
            setBackgroundColor(Color.argb(170, 0, 0, 0))
            setPadding(dp(16), dp(14), dp(16), dp(28))
        }, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))

        overlay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(24), dp(24), dp(24))
            visibility = View.GONE
            isClickable = true
        }
        title = TextView(this).apply { setTextColor(Color.WHITE); textSize = 38f; gravity = Gravity.CENTER }
        detail = TextView(this).apply { setTextColor(Color.WHITE); textSize = 20f; gravity = Gravity.CENTER; setPadding(0, dp(16), 0, 0) }
        latency = TextView(this).apply { setTextColor(Color.WHITE); textSize = 14f; gravity = Gravity.CENTER; setPadding(0, dp(24), 0, 0); visibility = View.GONE }
        overlay.addView(title)
        overlay.addView(detail)
        overlay.addView(latency)
        overlay.setOnLongClickListener {
            showLatency = !showLatency
            latency.visibility = if (showLatency) View.VISIBLE else View.GONE
            true
        }
        root.addView(overlay, FrameLayout.LayoutParams(-1, -1))
        return root
    }

    override fun onDestroy() {
        super.onDestroy()
        analyzerThread.shutdown()
        io.shutdown()
    }

    companion object {
        private const val TAG = "UnlinkScanner"
        private const val RESULT_HOLD_MS = 2_000L
    }
}
