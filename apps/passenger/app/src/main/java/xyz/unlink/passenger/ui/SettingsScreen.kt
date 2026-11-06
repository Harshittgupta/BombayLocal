package xyz.unlink.passenger.ui

import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import xyz.unlink.passenger.BuildConfig
import xyz.unlink.passenger.Settings
import xyz.unlink.passenger.ui.components.PrimaryButton
import xyz.unlink.passenger.ui.components.Section
import xyz.unlink.passenger.ui.theme.Corners
import xyz.unlink.passenger.ui.theme.Ink
import xyz.unlink.passenger.ui.theme.Type

/** Endpoints (SPEC §8: configurable), the lock-screen tile and what this build is. */
@Composable
fun SettingsScreen(settings: Settings, onSaved: () -> Unit, onAddTile: () -> Unit, onBack: () -> Unit, modifier: Modifier = Modifier) {
    var arkiv by remember { mutableStateOf(settings.arkivRpcUrl) }
    var sepolia by remember { mutableStateOf(settings.sepoliaRpcUrl) }
    var issuer by remember { mutableStateOf(settings.issuerUrl) }
    var saved by remember { mutableStateOf(false) }

    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 20.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Ink.text) }
            Text("Settings", style = Type.title, color = Ink.text)
        }
        Column(Modifier.padding(horizontal = 20.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(28.dp)) {
            Section("Connections") {
                Text("Where the app checks for pass updates and where it buys passes.", style = Type.label, color = Ink.muted)
                UrlField("Arkiv RPC URL", arkiv) { arkiv = it; saved = false }
                UrlField("Sepolia RPC URL", sepolia) { sepolia = it; saved = false }
                UrlField("Issuer URL (used only to buy)", issuer) { issuer = it; saved = false }
                PrimaryButton("Save", onClick = {
                    settings.arkivRpcUrl = arkiv; settings.sepoliaRpcUrl = sepolia; settings.issuerUrl = issuer
                    arkiv = settings.arkivRpcUrl; sepolia = settings.sepoliaRpcUrl; issuer = settings.issuerUrl
                    saved = true
                    onSaved()
                })
                if (saved) Text("Saved. Updating your pass…", style = Type.label, color = Ink.muted)
            }

            Section("Lock screen") {
                Text("Show your pass from Quick Settings, even while the phone is locked.", style = Type.body, color = Ink.muted)
                if (Build.VERSION.SDK_INT >= 33) {
                    OutlinedButton(onClick = onAddTile, shape = Corners.button, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                        Text("Add “Show pass” to Quick Settings", style = Type.bodyStrong, color = Ink.text)
                    }
                } else {
                    Text("Open Quick Settings, tap Edit and drag “Show pass” in.", style = Type.label, color = Ink.muted)
                }
            }

            Section("About") {
                Text("Unlink Pass ${BuildConfig.VERSION_NAME}", style = Type.body, color = Ink.text)
                Text("Payment in this build is simulated: no money is charged.", style = Type.label, color = Ink.muted)
            }
        }
    }
}

@Composable
private fun UrlField(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        textStyle = Type.body,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
        shape = Corners.button,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Ink.text, unfocusedBorderColor = Ink.line,
            focusedLabelColor = Ink.text, unfocusedLabelColor = Ink.muted,
            focusedTextColor = Ink.text, unfocusedTextColor = Ink.text, cursorColor = Ink.text,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
}
