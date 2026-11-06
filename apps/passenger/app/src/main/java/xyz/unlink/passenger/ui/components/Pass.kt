package xyz.unlink.passenger.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import xyz.unlink.passenger.ui.theme.Corners
import xyz.unlink.passenger.ui.theme.Ink
import xyz.unlink.passenger.ui.theme.Type

/** The products the issuer sells (issuer/products.json). Names are the same words the whole flow uses. */
data class Product(val id: String, val name: String, val days: Int, val zoneClass: Int) {
    val buyLabel: String get() = "Buy ${name.replaceFirstChar { it.lowercase() }}"
    val duration: String get() = if (days == 1) "1 day" else "$days days"
}

object Products {
    val all = listOf(
        Product("day-pass", "Day pass", 1, 0),
        Product("month-pass", "Month pass", 30, 0),
        Product("month-first", "Month pass, 1st class", 30, 1),
    )

    fun name(id: String): String = all.firstOrNull { it.id == id }?.name ?: id
}

fun className(zoneClass: Int): String = when (zoneClass) {
    0 -> "2nd class"
    1 -> "1st class"
    else -> "AC"
}

/**
 * The carriage-door band: first class is the slanted red-and-yellow band, AC a single cool blue, second class none.
 * Draws into [width] × [height] at the top-left of the current draw area.
 */
private fun DrawScope.classBand(zoneClass: Int, width: Float, height: Float) {
    when (zoneClass) {
        1 -> clipRect(0f, 0f, width, height) {
            drawRect(Ink.firstB, size = Size(width, height))
            val stripe = 10.dp.toPx()
            var x = -height
            while (x < width + height) {
                val p = Path().apply {
                    moveTo(x, 0f); lineTo(x + stripe, 0f); lineTo(x + stripe - height, height); lineTo(x - height, height); close()
                }
                drawPath(p, Ink.firstA)
                x += stripe * 2
            }
        }
        2 -> drawRect(Ink.ac, size = Size(width, height))
        else -> Unit
    }
}

/** A small swatch of the class band, for rows and captions. Second class has no band, so nothing is drawn. */
@Composable
fun ClassSwatch(zoneClass: Int, modifier: Modifier = Modifier) {
    if (zoneClass == 0) return
    Canvas(modifier.size(28.dp, 8.dp).clip(RoundedCornerShape(2.dp))) { classBand(zoneClass, size.width, size.height) }
}

/**
 * The pass as a torn ticket: a half-circle notch in each side edge, a dashed tear line between them, the counterfoil below.
 * The class band runs along the top edge.
 */
@Composable
fun TicketCard(
    zoneClass: Int,
    modifier: Modifier = Modifier,
    main: @Composable ColumnScope.() -> Unit,
    counterfoil: @Composable ColumnScope.() -> Unit,
) {
    val notchY = remember { FloatArray(1) }
    Layout(
        content = {
            Column(Modifier.padding(start = 24.dp, end = 24.dp, top = 28.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp), content = main)
            Column(Modifier.padding(start = 24.dp, end = 24.dp, top = 8.dp, bottom = 22.dp), verticalArrangement = Arrangement.spacedBy(4.dp), content = counterfoil)
        },
        modifier = modifier.drawBehind {
            val r = 12.dp.toPx()
            val y = notchY[0]
            val body = Path().apply { addRoundRect(RoundRect(0f, 0f, size.width, size.height, CornerRadius(20.dp.toPx()))) }
            val notches = Path().apply {
                addOval(androidx.compose.ui.geometry.Rect(Offset(0f, y), r))
                addOval(androidx.compose.ui.geometry.Rect(Offset(size.width, y), r))
            }
            val ticket = Path().apply { op(body, notches, PathOperation.Difference) }
            drawPath(ticket, Ink.raised)
            clipPath(ticket) { classBand(zoneClass, size.width, 6.dp.toPx()) }
            drawPath(ticket, Ink.line, style = Stroke(1.dp.toPx()))
            val dash = 6.dp.toPx()
            drawLine(
                Ink.line, Offset(r + 8.dp.toPx(), y), Offset(size.width - r - 8.dp.toPx(), y),
                strokeWidth = 1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(dash, dash)),
            )
        },
    ) { measurables, constraints ->
        val loose = constraints.copy(minHeight = 0)
        val top = measurables[0].measure(loose)
        val bottom = measurables[1].measure(loose)
        val gap = 24.dp.roundToPx()
        val width = constraints.maxWidth
        notchY[0] = (top.height + gap / 2).toFloat()
        layout(width, top.height + gap + bottom.height) {
            top.place(0, 0)
            bottom.place(0, top.height + gap)
        }
    }
}

/** One product to choose on the Buy screen. */
@Composable
fun ProductRow(product: Product, selected: Boolean, enabled: Boolean, onSelect: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .clip(Corners.button)
            .background(Ink.raised)
            .border(if (selected) 2.dp else 1.dp, if (selected) Ink.text else Ink.line, Corners.button)
            .selectable(selected = selected, enabled = enabled, role = Role.RadioButton, onClick = onSelect)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioDot(selected)
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(product.name, style = Type.bodyStrong, color = Ink.text)
            Text("${product.duration} · ${className(product.zoneClass)}", style = Type.label, color = Ink.muted)
        }
        ClassSwatch(product.zoneClass, Modifier.padding(start = 12.dp))
    }
}

@Composable
private fun RadioDot(selected: Boolean) {
    Canvas(Modifier.size(20.dp)) {
        drawCircle(if (selected) Ink.text else Ink.muted, radius = size.minDimension / 2 - 1.dp.toPx(), style = Stroke(2.dp.toPx()))
        if (selected) drawCircle(Ink.text, radius = size.minDimension / 4)
    }
}

/** Full-width primary button; shows a small spinner in place while [busy]. */
@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, busy: Boolean = false) {
    Button(
        onClick = onClick,
        enabled = enabled && !busy,
        shape = Corners.button,
        colors = ButtonDefaults.buttonColors(
            containerColor = Ink.text, contentColor = Ink.ground,
            disabledContainerColor = Ink.line, disabledContentColor = if (busy) Ink.text else Ink.muted,
        ),
        modifier = modifier.fillMaxWidth().heightIn(min = 52.dp),
    ) {
        if (busy) {
            CircularProgressIndicator(Modifier.size(18.dp), color = Ink.text, strokeWidth = 2.dp, trackColor = Color.Transparent)
            Spacer(Modifier.width(12.dp))
        }
        Text(text, style = Type.bodyStrong)
    }
}

/** A ticket outline for the Passes tab (Material's core icon set has no ticket). */
val TicketIcon: ImageVector by lazy {
    ImageVector.Builder("Ticket", 24.dp, 24.dp, 24f, 24f).apply {
        path(fill = SolidColor(Color.Black), pathFillType = PathFillType.EvenOdd) {
            // Outer ticket with a notch on each side at y = 12, minus the inner area: a 2-unit outline.
            moveTo(3f, 5f); lineTo(21f, 5f); lineTo(21f, 9.5f)
            arcTo(2.5f, 2.5f, 0f, false, false, 21f, 14.5f)
            lineTo(21f, 19f); lineTo(3f, 19f); lineTo(3f, 14.5f)
            arcTo(2.5f, 2.5f, 0f, false, false, 3f, 9.5f)
            close()
            moveTo(5f, 7f); lineTo(19f, 7f); lineTo(19f, 7.97f)
            arcTo(4.5f, 4.5f, 0f, false, false, 19f, 16.03f)
            lineTo(19f, 17f); lineTo(5f, 17f); lineTo(5f, 16.03f)
            arcTo(4.5f, 4.5f, 0f, false, false, 5f, 7.97f)
            close()
        }
    }.build()
}

/** The BombayLocal app mark (the launcher icon artwork), small, for screen headers. */
@Composable
fun BrandMark(size: androidx.compose.ui.unit.Dp = 32.dp, modifier: Modifier = Modifier) {
    androidx.compose.foundation.Image(
        painter = androidx.compose.ui.res.painterResource(xyz.unlink.passenger.R.drawable.bombaylocal_logo),
        contentDescription = "BombayLocal",
        modifier = modifier.size(size).clip(RoundedCornerShape(size / 4)),
    )
}

/** Section wrapper used on the settings screen: a sentence-case title and its content on the raised colour. */
@Composable
fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = Type.bodyStrong, color = Ink.text)
        Box(Modifier.fillMaxWidth().clip(Corners.button).background(Ink.raised).padding(16.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
        }
    }
}
