package xyz.unlink.scanner.scan

import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.ReaderException
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader

/**
 * CameraX frames → ZXing (core only, on-device, no ML Kit). Decodes the luminance (Y) plane of every frame; frames
 * without a readable QR are dropped silently. `onText` runs on the analyzer thread (never the main thread), which
 * is where the verifier runs too, so slow frames are skipped by KEEP_ONLY_LATEST rather than queued.
 */
class QrAnalyzer(private val onText: (text: String, decodeMs: Double) -> Unit) : ImageAnalysis.Analyzer {
    private val reader = QRCodeReader()
    private val hints = mapOf(
        DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
        DecodeHintType.TRY_HARDER to true,
        DecodeHintType.CHARACTER_SET to "ISO-8859-1",
    )
    private var buf = ByteArray(0)

    override fun analyze(image: ImageProxy) {
        try {
            val t0 = System.nanoTime()
            val plane = image.planes[0]
            val w = image.width
            val h = image.height
            if (buf.size != w * h) buf = ByteArray(w * h)
            val src = plane.buffer.apply { rewind() }
            val stride = plane.rowStride
            if (stride == w) {
                src.get(buf, 0, w * h)
            } else {
                for (row in 0 until h) {
                    src.position(row * stride)
                    src.get(buf, row * w, w)
                }
            }
            val text = try {
                reader.decode(BinaryBitmap(HybridBinarizer(PlanarYUVLuminanceSource(buf, w, h, 0, 0, w, h, false))), hints).text
            } catch (e: ReaderException) {
                null
            } finally {
                reader.reset()
            }
            if (text != null) onText(text, (System.nanoTime() - t0) / 1e6)
        } finally {
            image.close()
        }
    }
}
