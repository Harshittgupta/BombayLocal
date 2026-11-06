package xyz.unlink.passenger.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import xyz.unlink.passenger.pass.Pass
import xyz.unlink.passenger.pass.PassHistory
import xyz.unlink.passenger.pass.PassStatus
import xyz.unlink.passenger.pass.RefreshRecord
import xyz.unlink.passenger.pass.Refresher
import xyz.unlink.passenger.ui.components.ClassSwatch
import xyz.unlink.passenger.ui.components.PrimaryButton
import xyz.unlink.passenger.ui.components.Products
import xyz.unlink.passenger.ui.components.TicketCard
import xyz.unlink.passenger.ui.components.TicketIcon
import xyz.unlink.passenger.ui.components.className
import xyz.unlink.passenger.ui.theme.Ink
import xyz.unlink.passenger.ui.theme.Type

/** What the pass card's state line says (same rules as before the redesign). */
private fun stateLine(last: RefreshRecord?, hasRoot: Boolean, readyOffline: Boolean): Pair<String, Boolean> = when (last?.status) {
    PassStatus.REVOKED -> "Pass revoked" to true
    PassStatus.MISMATCH -> "Pass mismatch — contact the issuer" to true
    else -> when {
        readyOffline -> "Ready offline" to false
        !hasRoot -> "Pass activates at the next update" to false
        else -> "Preparing…" to false
    }
}

@Composable
fun PassesScreen(
    pass: Pass?,
    hasRoot: Boolean,
    readyOffline: Boolean,
    last: RefreshRecord?,
    busy: String?,
    history: List<PassHistory.Entry>,
    onShowPass: () -> Unit,
    onRefresh: () -> Unit,
    onSettings: () -> Unit,
    onBuy: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Your pass", style = Type.title, color = Ink.text, modifier = Modifier.weight(1f))
            IconButton(onClick = onSettings) { Icon(Icons.Filled.Settings, contentDescription = "Settings", tint = Ink.muted) }
        }

        if (pass == null) {
            EmptyState(onBuy)
        } else {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                val (state, isError) = stateLine(last, hasRoot, readyOffline)
                TicketCard(
                    zoneClass = pass.zoneClass,
                    modifier = Modifier.fillMaxWidth(),
                    main = {
                        Text(Products.name(pass.product), style = Type.title, color = Ink.text)
                        Spacer(Modifier.size(4.dp))
                        Text("Valid until", style = Type.label, color = Ink.muted)
                        Text(QrActivity.formatDay(pass.validUntilDay), style = Type.display, color = Ink.text)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            ClassSwatch(pass.zoneClass, Modifier.padding(end = 10.dp))
                            Text(className(pass.zoneClass), style = Type.body, color = Ink.muted)
                        }
                    },
                    counterfoil = {
                        Text(state, style = Type.bodyStrong, color = if (isError) Ink.error else Ink.text)
                        Text("Bought ${Refresher.formatTime(pass.boughtAt)}", style = Type.label, color = Ink.muted)
                    },
                )

                last?.let {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Last updated ${Refresher.formatTime(it.at)}", style = Type.label, color = Ink.muted)
                        if (!it.ok) Text(it.message, style = Type.label, color = Ink.error)
                    }
                }

                PrimaryButton("Show pass", onClick = onShowPass, enabled = hasRoot)

                if (busy != null) {
                    Row(Modifier.heightIn(min = 48.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(16.dp), color = Ink.muted, strokeWidth = 2.dp, trackColor = Color.Transparent)
                        Spacer(Modifier.width(12.dp))
                        Text(busy, style = Type.body, color = Ink.muted)
                    }
                } else {
                    TextButton(onClick = onRefresh, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text("Refresh", style = Type.bodyStrong, color = Ink.text)
                    }
                }
            }
        }

        if (history.isNotEmpty()) {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                Text("Previous passes", style = Type.bodyStrong, color = Ink.text, modifier = Modifier.padding(bottom = 4.dp))
                history.forEach { h ->
                    HorizontalDivider(color = Ink.line)
                    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(Products.name(h.product), style = Type.body, color = Ink.muted)
                            Text(
                                "Valid until ${QrActivity.formatDay(h.validUntilDay)} · replaced ${Refresher.formatTime(h.replacedAt)}",
                                style = Type.label, color = Ink.muted,
                            )
                        }
                        Text("No longer usable", style = Type.label, color = Ink.muted, modifier = Modifier.padding(start = 12.dp))
                    }
                }
            }
        }
        Spacer(Modifier.size(24.dp))
    }
}

@Composable
private fun EmptyState(onBuy: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Icon(TicketIcon, contentDescription = null, tint = Ink.muted, modifier = Modifier.size(48.dp))
        Text("No pass yet. Buy one to start travelling.", style = Type.body, color = Ink.text)
        PrimaryButton("Buy a pass", onClick = onBuy)
    }
}
