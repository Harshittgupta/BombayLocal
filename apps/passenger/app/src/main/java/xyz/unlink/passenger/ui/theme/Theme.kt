package xyz.unlink.passenger.ui.theme

import android.content.Context
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * BombayLocal design tokens (shared with the scanner app, which mirrors this file). Dark only: the pass's white QR card is
 * the brightest thing on any screen, and class is the only colour on the pass card.
 */
object Ink {
    val ground = Color(0xFF10161C)
    val raised = Color(0xFF19212A)
    val line = Color(0xFF2A3541)
    val text = Color(0xFFECF1F6)
    val muted = Color(0xFF8D9BA9)
    val paper = Color(0xFFFFFFFF)
    val firstA = Color(0xFFE0462F)
    val firstB = Color(0xFFF4C64E)
    val ac = Color(0xFF5BA7E8)
    val error = Color(0xFFF28B82)
}

private val Sans = FontFamily.SansSerif

/** Scale: display 34/40 (−0.02em), title 22, body 16, label 13. Sentence case everywhere. */
object Type {
    val display = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 34.sp, lineHeight = 40.sp, letterSpacing = (-0.02).em)
    val title = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp)
    val body = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 22.sp)
    val bodyStrong = body.copy(fontWeight = FontWeight.Medium)
    val label = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp)
}

object Corners {
    val card = RoundedCornerShape(20.dp)
    val button = RoundedCornerShape(10.dp)
}

private val scheme = darkColorScheme(
    primary = Ink.text,
    onPrimary = Ink.ground,
    secondary = Ink.muted,
    onSecondary = Ink.ground,
    secondaryContainer = Ink.line,
    onSecondaryContainer = Ink.text,
    background = Ink.ground,
    onBackground = Ink.text,
    surface = Ink.ground,
    onSurface = Ink.text,
    surfaceVariant = Ink.raised,
    onSurfaceVariant = Ink.muted,
    surfaceContainer = Ink.raised,
    surfaceContainerHigh = Ink.raised,
    surfaceContainerHighest = Ink.raised,
    surfaceContainerLow = Ink.raised,
    outline = Ink.line,
    outlineVariant = Ink.line,
    error = Ink.error,
    onError = Ink.ground,
)

private val typography = Typography(
    displaySmall = Type.display,
    headlineSmall = Type.title,
    titleLarge = Type.title,
    titleMedium = Type.bodyStrong,
    bodyLarge = Type.body,
    bodyMedium = Type.body,
    bodySmall = Type.label,
    labelLarge = Type.bodyStrong,
    labelMedium = Type.label,
    labelSmall = Type.label,
)

private val shapes = Shapes(small = Corners.button, medium = Corners.button, large = Corners.card)

@Composable
fun BombayLocalTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, typography = typography, shapes = shapes, content = content)
}

/** The system "Animator duration scale" (Developer options / Remove animations). 0 means: no animation at all. */
fun animationsEnabled(context: Context): Boolean =
    android.provider.Settings.Global.getFloat(context.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
