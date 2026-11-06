package xyz.unlink.scanner

import android.content.ClipData
import android.content.ClipboardManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import xyz.unlink.scanner.key.ScannerKey
import xyz.unlink.scanner.store.RoomVerifierStore
import xyz.unlink.scanner.store.ScannerDb
import xyz.unlink.scanner.sync.SyncWorker
import xyz.unlink.scanner.ui.theme.Corners
import xyz.unlink.scanner.ui.theme.Ink
import xyz.unlink.scanner.ui.theme.Type
import xyz.unlink.scanner.ui.theme.BombayLocalScanTheme
import java.util.concurrent.Executors

/**
 * Four groups: Checkpoint (class requirement, saved on tap), Sync (Sync now + status), Scanner identity (address to
 * paste into issuer/scanners.json) and Endpoints (primary + backup Sepolia RPC, Arkiv RPC, issuer URL; one Save).
 */
class SettingsActivity : ComponentActivity() {
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val s by lazy { Settings(this) }

    private var address by mutableStateOf("")
    private var status by mutableStateOf<String?>(null)
    private var info by mutableStateOf("")
    private var syncing by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(SystemBarStyle.dark(android.graphics.Color.TRANSPARENT), SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        setContent { BombayLocalScanTheme { Screen() } }
        io.execute {
            val a = ScannerKey(applicationContext).address
            main.post { address = a }
        }
        refresh()
    }

    private fun syncNow() {
        syncing = true
        status = "Syncing…"
        io.execute {
            val report = runCatching { SyncWorker.syncNow(applicationContext).toString() }.getOrElse { "sync failed (${it.javaClass.simpleName})" }
            main.post { status = report; syncing = false; refresh() }
        }
    }

    private fun refresh() {
        io.execute {
            val dao = ScannerDb.get(applicationContext).dao()
            val lines = dao.issuers().map {
                "Issuer ${it.address.take(10)}…  ${if (it.active) "active" else "SUSPENDED"}, floor ${it.floor}, " +
                    "latest root ${it.latestRootId} (Arkiv ${it.arkivRootId}), this scanner ${if (it.listed) "listed" else "not listed"}"
            }
            val text = buildString {
                appendLine(ResultText.syncAge(dao.get(RoomVerifierStore.K_LAST_SYNC)?.toLongOrNull() ?: 0, System.currentTimeMillis() + (dao.get(RoomVerifierStore.K_CLOCK_OFFSET)?.toLongOrNull() ?: 0L)))
                dao.get(RoomVerifierStore.K_SYNC_STATUS)?.let { appendLine("Last sync: $it") }
                appendLine("Verification key ${dao.get(RoomVerifierStore.K_VK_HASH)?.take(16) ?: "missing"}…")
                appendLine("Scans waiting to upload: ${dao.pendingEpochs().sumOf { dao.pending(it).size }}")
                lines.forEach { appendLine(it) }
            }.trimEnd()
            main.post { info = text }
        }
    }

    private fun copyAddress() {
        if (address.isEmpty()) return
        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Scanner address", address))
        Toast.makeText(this, "Address copied", Toast.LENGTH_SHORT).show()
    }

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    private fun Screen() {
        val classes = listOf(
            Triple("Any", null, "Accepts any class"),
            Triple("2nd+", 0, "Accepts 2nd class and above"),
            Triple("1st+", 1, "Accepts 1st class and above"),
            Triple("AC", 2, "Accepts AC only"),
        )
        var required by remember { mutableStateOf(s.requiredClass) }
        var latency by remember { mutableStateOf(s.showLatency) }
        var endpointsOpen by remember { mutableStateOf(false) }
        var sepolia by remember { mutableStateOf(s.sepoliaRpc) }
        var backup by remember { mutableStateOf(s.sepoliaRpcBackup) }
        var arkiv by remember { mutableStateOf(s.arkivRpc) }
        var issuer by remember { mutableStateOf(s.issuerUrl) }
        var saved by remember { mutableStateOf(false) }

        Column(Modifier.fillMaxSize().background(Ink.ground).safeDrawingPadding().verticalScroll(rememberScrollState())) {
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 20.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { finish() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Ink.text) }
                Text("Scanner settings", style = Type.title, color = Ink.text)
            }
            Column(Modifier.padding(horizontal = 20.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(28.dp)) {
                Group("Checkpoint") {
                    Text("Which passes this checkpoint accepts", style = Type.label, color = Ink.muted)
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        classes.forEachIndexed { i, (label, value, _) ->
                            SegmentedButton(
                                selected = required == value,
                                onClick = { required = value; s.requiredClass = value },
                                shape = SegmentedButtonDefaults.itemShape(i, classes.size),
                                colors = SegmentedButtonDefaults.colors(
                                    activeContainerColor = Ink.text, activeContentColor = Ink.ground,
                                    inactiveContainerColor = Ink.raised, inactiveContentColor = Ink.text,
                                    activeBorderColor = Ink.text, inactiveBorderColor = Ink.line,
                                ),
                                icon = {},
                                modifier = Modifier.heightIn(min = 48.dp),
                            ) { Text(label, style = Type.bodyStrong) }
                        }
                    }
                    Text(classes.first { it.second == required }.third, style = Type.body, color = Ink.text)
                }

                Group("Sync") {
                    Button(
                        onClick = { syncNow() },
                        enabled = !syncing,
                        shape = Corners.button,
                        colors = ButtonDefaults.buttonColors(containerColor = Ink.text, contentColor = Ink.ground, disabledContainerColor = Ink.line, disabledContentColor = Ink.text),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                    ) { Text(if (syncing) "Syncing…" else "Sync now", style = Type.bodyStrong) }
                    status?.let { Text(it, style = Type.label, color = Ink.muted) }
                    if (info.isNotEmpty()) Text(info, style = Type.label, color = Ink.text)
                }

                Group("Scanner identity") {
                    Text("Add this address to the issuer's scanner list (issuer/scanners.json).", style = Type.label, color = Ink.muted)
                    SelectionContainer { Text(address.ifEmpty { "…" }, style = Type.body, color = Ink.text) }
                    OutlinedButton(onClick = { copyAddress() }, shape = Corners.button, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                        Text("Copy address", style = Type.bodyStrong, color = Ink.text)
                    }
                }

                Group("Display") {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp)
                            .clickable(role = Role.Switch) { latency = !latency; s.showLatency = latency },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Show check time", style = Type.body, color = Ink.text)
                            Text("Decode and verify time on each result. Long-press the status chip to toggle.", style = Type.label, color = Ink.muted)
                        }
                        Switch(
                            checked = latency,
                            onCheckedChange = { latency = it; s.showLatency = it },
                            colors = SwitchDefaults.colors(checkedThumbColor = Ink.ground, checkedTrackColor = Ink.text, uncheckedThumbColor = Ink.muted, uncheckedTrackColor = Ink.raised, uncheckedBorderColor = Ink.line),
                        )
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(Corners.button).clickable { endpointsOpen = !endpointsOpen },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Endpoints", style = Type.bodyStrong, color = Ink.text, modifier = Modifier.weight(1f))
                        Icon(
                            if (endpointsOpen) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
                            contentDescription = if (endpointsOpen) "Hide endpoints" else "Show endpoints",
                            tint = Ink.muted,
                        )
                    }
                    if (endpointsOpen) {
                        Panel {
                            UrlField("Sepolia RPC URL", sepolia) { sepolia = it; saved = false }
                            UrlField("Backup Sepolia RPC URL (another provider)", backup) { backup = it; saved = false }
                            UrlField("Arkiv RPC URL", arkiv) { arkiv = it; saved = false }
                            UrlField("Issuer URL (scan upload only)", issuer) { issuer = it; saved = false }
                            Button(
                                onClick = {
                                    s.sepoliaRpc = sepolia; s.sepoliaRpcBackup = backup; s.arkivRpc = arkiv; s.issuerUrl = issuer
                                    saved = true
                                },
                                shape = Corners.button,
                                colors = ButtonDefaults.buttonColors(containerColor = Ink.text, contentColor = Ink.ground),
                                modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                            ) { Text("Save", style = Type.bodyStrong) }
                            if (saved) Text("Saved.", style = Type.label, color = Ink.muted)
                        }
                    }
                }
            }
        }
    }

    @Composable
    private fun Group(title: String, content: @Composable ColumnScope.() -> Unit) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = Type.bodyStrong, color = Ink.text)
            Panel(content)
        }
    }

    @Composable
    private fun Panel(content: @Composable ColumnScope.() -> Unit) {
        Box(Modifier.fillMaxWidth().clip(Corners.button).background(Ink.raised).padding(16.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
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

    override fun onDestroy() {
        super.onDestroy()
        io.shutdown()
    }
}
