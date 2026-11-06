package xyz.unlink.passenger.ui

import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import kotlinx.coroutines.delay
import xyz.unlink.passenger.pass.PassRepository
import xyz.unlink.passenger.pass.PreProver
import xyz.unlink.passenger.ui.components.ClassSwatch
import xyz.unlink.passenger.ui.components.className
import xyz.unlink.passenger.ui.theme.Corners
import xyz.unlink.passenger.ui.theme.Ink
import xyz.unlink.passenger.ui.theme.Type
import xyz.unlink.passenger.ui.theme.BombayLocalTheme
import xyz.unlink.passenger.ui.theme.animationsEnabled
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The pass, shown over the lock screen: the cached QR for the current epoch on a pure-white card, full brightness.
 * It never proves and never reads the secret (that needs an unlocked phone); it only displays what the pre-prover
 * cached (SPEC §6), and never a code from a past epoch. Works offline.
 */
class QrActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.attributes = window.attributes.apply { screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL }
        val repo = PassRepository(this)
        val animate = animationsEnabled(this)

        setContent {
            BombayLocalTheme {
                var now by remember { mutableLongStateOf(System.currentTimeMillis() / 1000) }
                LaunchedEffect(Unit) {
                    while (true) {
                        delay(1000)
                        now = System.currentTimeMillis() / 1000
                    }
                }
                val epoch = now / PreProver.EPOCH
                val qrText = remember(epoch) { repo.anyCachedProof(epoch) }
                val bitmap = remember(qrText) { qrText?.let { renderQr(it) } }
                val pass = remember { repo.pass() }

                // The one orchestrated motion: the code's card settles in when the pass opens.
                val settle = remember { Animatable(if (animate) 0f else 1f) }
                LaunchedEffect(bitmap != null) {
                    if (bitmap != null && animate) settle.animateTo(1f, tween(320, easing = FastOutSlowInEasing))
                }

                Column(
                    Modifier.fillMaxSize().background(Ink.ground).safeDrawingPadding().padding(horizontal = 24.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterVertically),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    if (bitmap != null) {
                        Box(
                            Modifier
                                .widthIn(max = 480.dp)
                                .fillMaxWidth()
                                .aspectRatio(1f)
                                .graphicsLayer {
                                    alpha = settle.value
                                    val s = 0.94f + 0.06f * settle.value
                                    scaleX = s; scaleY = s
                                }
                                .clip(Corners.card)
                                .background(Ink.paper)
                                .padding(16.dp),
                        ) {
                            Image(
                                bitmap = bitmap.asImageBitmap(),
                                contentDescription = "Your pass code. Hold it up to the ticket checker's scanner.",
                                filterQuality = FilterQuality.None,
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                        if (pass != null) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("Valid until ${formatDay(pass.validUntilDay)}", style = Type.title, color = Ink.text, textAlign = TextAlign.Center)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    ClassSwatch(pass.zoneClass, Modifier.padding(end = 10.dp))
                                    Text(className(pass.zoneClass), style = Type.body, color = Ink.muted)
                                }
                            }
                        }
                        val left = ((epoch + 1) * PreProver.EPOCH - now).coerceIn(0, PreProver.EPOCH)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                progress = { left.toFloat() / PreProver.EPOCH },
                                modifier = Modifier.size(18.dp),
                                color = Ink.text,
                                trackColor = Ink.line,
                                strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.width(10.dp))
                            Text("New code in %d:%02d".format(left / 60, left % 60), style = Type.body, color = Ink.muted)
                        }
                    } else {
                        Text(
                            "Pass not ready — unlock your phone and open BombayLocal Pass once",
                            style = Type.title, color = Ink.text, textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }

    companion object {
        /** SPEC §3.4: Base45 text, QR alphanumeric mode, error correction M (version 16 for 641 chars). */
        fun renderQr(text: String, size: Int = 900, margin: Int = 2): Bitmap {
            val hints = mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to margin)
            val m = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, hints)
            val px = IntArray(m.width * m.height) { i -> if (m.get(i % m.width, i / m.width)) Color.BLACK else Color.WHITE }
            return Bitmap.createBitmap(px, m.width, m.height, Bitmap.Config.ARGB_8888)
        }

        /** IST day number (SPEC §9: day(t) = floor((t + 19800) / 86400)) → "12 Dec 2026", the last valid day. */
        fun formatDay(day: Int): String =
            SimpleDateFormat("d MMM yyyy", Locale.getDefault()).apply { timeZone = TimeZone.getTimeZone("UTC") }
                .format(Date(day.toLong() * 86_400_000L))
    }
}
