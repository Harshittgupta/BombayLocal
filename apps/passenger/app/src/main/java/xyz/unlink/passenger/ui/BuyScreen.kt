package xyz.unlink.passenger.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import xyz.unlink.passenger.ui.components.PrimaryButton
import xyz.unlink.passenger.ui.components.ProductRow
import xyz.unlink.passenger.ui.components.Products
import xyz.unlink.passenger.ui.theme.Corners
import xyz.unlink.passenger.ui.theme.Ink
import xyz.unlink.passenger.ui.theme.Type

/**
 * Pick one of the issuer's products and buy it. Payment is simulated, and the screen says so next to the button.
 * The phone holds one pass at a time, so buying while a pass exists asks first: the old pass stops working.
 */
@Composable
fun BuyScreen(
    currentPassName: String?,
    buying: Boolean,
    error: String?,
    onBuy: (productId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var selected by rememberSaveable { mutableStateOf(Products.all.first().id) }
    var confirm by rememberSaveable { mutableStateOf(false) }
    val product = Products.all.first { it.id == selected }

    Column(modifier.fillMaxSize()) {
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Buy a pass", style = Type.title, color = Ink.text)
            Text("Your pass lives on this phone and works without signal.", style = Type.body, color = Ink.muted)
            Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Products.all.forEach { p ->
                    ProductRow(p, selected = p.id == selected, enabled = !buying) { selected = p.id }
                }
            }
        }
        HorizontalDivider(color = Ink.line)
        Column(
            Modifier.fillMaxWidth().background(Ink.ground).padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            error?.let { Text(it, style = Type.label, color = Ink.error) }
            PrimaryButton(
                text = if (buying) "Buying…" else product.buyLabel,
                busy = buying,
                onClick = { if (currentPassName != null) confirm = true else onBuy(selected) },
            )
            Text("Simulated payment — no money is charged", style = Type.label, color = Ink.muted)
        }
    }

    if (confirm && currentPassName != null) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            containerColor = Ink.raised,
            shape = Corners.card,
            title = { Text("Replace your pass?", style = Type.title, color = Ink.text) },
            text = {
                Text(
                    "Buying a ${product.name.replaceFirstChar { it.lowercase() }} replaces the ${currentPassName.replaceFirstChar { it.lowercase() }} you hold. The old pass stops working.",
                    style = Type.body, color = Ink.muted,
                )
            },
            confirmButton = {
                TextButton(onClick = { confirm = false; onBuy(selected) }) { Text(product.buyLabel, style = Type.bodyStrong, color = Ink.text) }
            },
            dismissButton = {
                TextButton(onClick = { confirm = false }) { Text("Keep my pass", style = Type.bodyStrong, color = Ink.muted) }
            },
        )
    }
}
