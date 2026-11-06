package xyz.unlink.passenger.ui

import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import kotlinx.coroutines.delay
import xyz.unlink.passenger.pass.PassRepository
import xyz.unlink.passenger.pass.PreProver
import java.text.DateFormat
import java.util.Date

/**
 * The pass, shown over the lock screen: the cached QR for the current epoch, full brightness. It never proves and never
 * reads the secret (that needs an unlocked phone); it only displays what the pre-prover cached (SPEC §6). Works offline.
 */
class QrActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.attributes = window.attributes.apply { screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL }
        val repo = PassRepository(this)

        setContent {
            MaterialTheme {
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

                Column(
                    Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color.White).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    if (bitmap != null) {
                        Image(
                            bitmap = bitmap.asImageBitmap(),
                            contentDescription = "Pass QR code",
                            filterQuality = FilterQuality.None,
                            modifier = Modifier.fillMaxWidth().aspectRatio(1f),
                        )
                        if (pass != null) Text("Valid until ${formatDay(pass.validUntilDay)}", style = MaterialTheme.typography.titleMedium)
                        Text("Changes in ${(epoch + 1) * PreProver.EPOCH - now} s", style = MaterialTheme.typography.bodyMedium)
                    } else {
                        Text("Pass not ready", style = MaterialTheme.typography.titleLarge)
                        Text("Unlock your phone and open Unlink Pass once to prepare it.")
                    }
                }
            }
        }
    }

    companion object {
        /** SPEC §3.4: Base45 text, QR alphanumeric mode, error correction M (version 16 for 641 chars). */
        fun renderQr(text: String, size: Int = 900): Bitmap {
            val hints = mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to 2)
            val m = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, hints)
            val px = IntArray(m.width * m.height) { i -> if (m.get(i % m.width, i / m.width)) Color.BLACK else Color.WHITE }
            return Bitmap.createBitmap(px, m.width, m.height, Bitmap.Config.ARGB_8888)
        }

        /** IST day number → date (SPEC §9: day(t) = floor((t + 19800) / 86400)); shows the last valid day. */
        fun formatDay(day: Int): String =
            DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(day.toLong() * 86_400_000L))
    }
}
