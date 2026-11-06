package xyz.unlink.scanner

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.util.Size
import android.view.HapticFeedbackConstants
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size as GSize
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import xyz.unlink.scanner.engine.WebViewGroth16Engine
import xyz.unlink.scanner.scan.QrAnalyzer
import xyz.unlink.scanner.ui.theme.Ink
import xyz.unlink.scanner.ui.theme.Type
import xyz.unlink.scanner.ui.theme.BombayLocalScanTheme
import xyz.unlink.scanner.verifier.OfflineVerifier
import xyz.unlink.scanner.verifier.Reason
import xyz.unlink.scanner.verifier.Result
import xyz.unlink.scanner.verifier.Status
import java.util.concurrent.Executors

/**
 * The TC's scanner: camera → ZXing → OfflineVerifier (no network) → a full-screen Green / Amber / Red result.
 * The camera keeps decoding while a result is shown (SPEC §5 step 8: a code held in view is the same showing);
 * the screen returns to scanning 2 s after the code was last seen. A long-press on the status chip or on the result
 * shows decode and verify time (also a switch in Settings).
 */
class MainActivity : ComponentActivity() {

    private val analyzerThread = Executors.newSingleThreadExecutor() // decode + verify (never the main thread)
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val store by lazy { ScannerApp.store(this) }
    private val settings by lazy { Settings(this) }
    private val verifier by lazy { OfflineVerifier(WebViewGroth16Engine.Rebuilding(applicationContext)) }

    private lateinit var preview: PreviewView

    /** What the result screen shows; null while scanning. */
    private data class Verdict(val status: Status, val title: String, val details: List<String>)

    private var verdict by mutableStateOf<Verdict?>(null)
    private var latencyText by mutableStateOf("")
    private var showLatency by mutableStateOf(false)
    private var chipText by mutableStateOf("")
    private var chipLevel by mutableStateOf(SyncLevel.NEUTRAL)
    private var lastSeen = 0L

    private val askCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) startCamera() else { chipText = "Camera permission is needed to scan"; chipLevel = SyncLevel.RED }
    }

    private val hideWhenGone = object : Runnable {
        override fun run() {
            if (SystemClock.uptimeMillis() - lastSeen >= RESULT_HOLD_MS) verdict = null
            else main.postDelayed(this, 200)
        }
    }

    private val refreshChip = object : Runnable {
        override fun run() {
            io.execute {
                val last = store.lastSyncMs()
                val now = store.nowMs()
                val text = ResultText.syncAge(last, now)
                val level = SyncLevel.of(last, now)
                main.post { chipText = text; chipLevel = level }
            }
            main.postDelayed(this, 30_000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(SystemBarStyle.dark(android.graphics.Color.TRANSPARENT), SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        preview = PreviewView(this)
        setContent { BombayLocalScanTheme { ScanScreen() } }
        analyzerThread.execute { runCatching { WebViewGroth16Engine.shared(applicationContext) } } // warm up snarkjs
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startCamera()
        else askCamera.launch(Manifest.permission.CAMERA)
    }

    override fun onResume() {
        super.onResume()
        showLatency = settings.showLatency
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
        val r = verifier.verify(text, store.nowMs(), store) // device clock + sync-time correction (SPEC §8)
        val verifyMs = (System.nanoTime() - t0) / 1e6
        if (!r.sameShowing) Log.i(TAG, "scan ${r.status} ${r.reason}") // result and reason code only
        main.post { show(r, decodeMs, verifyMs) }
    }

    private fun show(r: Result, decodeMs: Double, verifyMs: Double) {
        lastSeen = SystemClock.uptimeMillis()
        if (!r.sameShowing || verdict == null) {
            verdict = Verdict(r.status, ResultText.title(r.reason), r.warnings.drop(1).map { ResultText.title(it) })
            if (!r.sameShowing) {
                window.decorView.performHapticFeedback(
                    if (r.status == Status.GREEN) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.REJECT,
                )
            }
        }
        latencyText = "decode %.0f ms · verify %.0f ms".format(decodeMs, verifyMs)
        main.removeCallbacks(hideWhenGone)
        main.postDelayed(hideWhenGone, RESULT_HOLD_MS)
        if (r.reason == Reason.SCANNER_STALE) main.post(refreshChip)
    }

    private fun toggleLatency() {
        showLatency = !showLatency
        settings.showLatency = showLatency
    }

    @Composable
    private fun ScanScreen() {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AndroidView(factory = { preview }, modifier = Modifier.fillMaxSize())
            Reticle(Modifier.fillMaxSize())

            Row(
                Modifier.fillMaxWidth().statusBarsPadding().padding(start = 16.dp, end = 4.dp, top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SyncChip(chipText, chipLevel, Modifier.weight(1f, fill = false))
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { startActivity(Intent(this@MainActivity, SettingsActivity::class.java)) }) {
                    Icon(Icons.Filled.Settings, contentDescription = "Settings", tint = Ink.text)
                }
            }

            Text(
                "Point the camera at the passenger's pass",
                style = Type.body, color = Ink.text, textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(horizontal = 24.dp, vertical = 28.dp),
            )

            verdict?.let { VerdictScreen(it) }
        }
    }

    @Composable
    private fun SyncChip(text: String, level: SyncLevel, modifier: Modifier) {
        val (bg, fg) = when (level) {
            SyncLevel.NEUTRAL -> Ink.raised.copy(alpha = 0.92f) to Ink.text
            SyncLevel.AMBER -> Color(ResultText.color(Status.AMBER)) to Color(ResultText.textColor(Status.AMBER))
            SyncLevel.RED -> Color(ResultText.color(Status.RED)) to Color(ResultText.textColor(Status.RED))
        }
        Box(
            modifier
                .clip(CircleShape)
                .background(bg)
                .pointerInput(Unit) { detectTapGestures(onLongPress = { toggleLatency() }) }
                .heightIn(min = 40.dp)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(text, style = Type.label.copy(fontSize = 14.sp), color = fg)
        }
    }

    @Composable
    private fun VerdictScreen(v: Verdict) {
        val bg = Color(ResultText.color(v.status))
        val fg = Color(ResultText.textColor(v.status))
        Column(
            Modifier
                .fillMaxSize()
                .background(bg)
                .pointerInput(Unit) { detectTapGestures(onLongPress = { toggleLatency() }) }
                .semantics { contentDescription = v.title }
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            VerdictGlyph(v.status, fg, Modifier.size(96.dp))
            Text(v.title, color = fg, fontSize = 40.sp, lineHeight = 46.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
            v.details.forEach { Text(it, color = fg, fontSize = 20.sp, lineHeight = 26.sp, textAlign = TextAlign.Center) }
            if (showLatency && latencyText.isNotEmpty()) {
                Text(latencyText, color = fg, style = Type.label.copy(fontSize = 14.sp), modifier = Modifier.padding(top = 8.dp))
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        analyzerThread.shutdown()
        io.shutdown()
    }

    companion object {
        private const val TAG = "BombayLocalScan"
        private const val RESULT_HOLD_MS = 2_000L
    }
}

/** Sync chip colour: neutral under 24 h, amber after (SPEC §9 STALE_WARN), red after 48 h (STALE_MAX) or never. */
enum class SyncLevel {
    NEUTRAL, AMBER, RED;

    companion object {
        fun of(lastSyncMs: Long, nowMs: Long): SyncLevel {
            if (lastSyncMs <= 0) return RED
            val age = nowMs - lastSyncMs
            return when {
                age < 0 -> AMBER // clock changed since the last sync
                age > 48 * 3_600_000L -> RED
                age > 24 * 3_600_000L -> AMBER
                else -> NEUTRAL
            }
        }
    }
}

/** A dimmed scrim with a clear square cut-out and corner ticks: where to aim. About 72% of the width. */
@Composable
private fun Reticle(modifier: Modifier) {
    Canvas(modifier.graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }) {
        val side = size.width * 0.72f
        val left = (size.width - side) / 2
        val top = (size.height - side) / 2 - size.height * 0.04f
        val radius = 20.dp.toPx()
        drawRect(Color.Black.copy(alpha = 0.55f))
        drawRoundRect(Color.Black, Offset(left, top), GSize(side, side), CornerRadius(radius), blendMode = BlendMode.Clear)
        corners(left, top, side, radius)
    }
}

private fun DrawScope.corners(left: Float, top: Float, side: Float, radius: Float) {
    val len = 32.dp.toPx()
    val w = 4.dp.toPx()
    val c = Color.White
    val right = left + side
    val bottom = top + side
    val stroke = Stroke(w, cap = StrokeCap.Round)
    // Each tick: a straight run along both edges into the rounded corner.
    listOf(
        Triple(Offset(left, top), 1f, 1f), Triple(Offset(right, top), -1f, 1f),
        Triple(Offset(left, bottom), 1f, -1f), Triple(Offset(right, bottom), -1f, -1f),
    ).forEach { (o, dx, dy) ->
        val path = androidx.compose.ui.graphics.Path().apply {
            moveTo(o.x, o.y + dy * len)
            lineTo(o.x, o.y + dy * radius)
            quadraticTo(o.x, o.y, o.x + dx * radius, o.y)
            lineTo(o.x + dx * len, o.y)
        }
        drawPath(path, c, style = stroke)
    }
}

/** Check, exclamation or cross in a ring, drawn in the verdict's text colour. */
@Composable
private fun VerdictGlyph(status: Status, color: Color, modifier: Modifier) {
    Canvas(modifier) {
        val w = size.minDimension
        val stroke = w * 0.075f
        drawCircle(color, radius = w / 2 - stroke / 2, style = Stroke(stroke))
        when (status) {
            Status.GREEN -> {
                val p = androidx.compose.ui.graphics.Path().apply {
                    moveTo(w * 0.29f, w * 0.52f); lineTo(w * 0.44f, w * 0.67f); lineTo(w * 0.72f, w * 0.37f)
                }
                drawPath(p, color, style = Stroke(stroke, cap = StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
            }
            Status.AMBER -> {
                drawLine(color, Offset(w / 2, w * 0.27f), Offset(w / 2, w * 0.58f), stroke, StrokeCap.Round)
                drawCircle(color, radius = stroke * 0.7f, center = Offset(w / 2, w * 0.73f))
            }
            Status.RED -> {
                drawLine(color, Offset(w * 0.34f, w * 0.34f), Offset(w * 0.66f, w * 0.66f), stroke, StrokeCap.Round)
                drawLine(color, Offset(w * 0.66f, w * 0.34f), Offset(w * 0.34f, w * 0.66f), stroke, StrokeCap.Round)
            }
        }
    }
}
