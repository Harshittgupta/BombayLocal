package xyz.unlink.passenger

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import xyz.unlink.passenger.net.IssuerClient
import xyz.unlink.passenger.pass.KeystoreSecretStore
import xyz.unlink.passenger.pass.PassRepository
import xyz.unlink.passenger.pass.PassStatus
import xyz.unlink.passenger.pass.PreProver
import xyz.unlink.passenger.pass.Purchaser
import xyz.unlink.passenger.pass.Refresher
import xyz.unlink.passenger.prover.ProtocolEngine
import xyz.unlink.passenger.prover.WebAppEngine
import xyz.unlink.passenger.ui.PassNotification
import xyz.unlink.passenger.ui.QrActivity
import xyz.unlink.passenger.work.EpochScheduler
import xyz.unlink.passenger.work.Jobs

/** Pass screen, purchase (simulated payment) and settings. Plain words only: no crypto terms on screen. */
class MainActivity : ComponentActivity() {

    private var tick by mutableIntStateOf(0)
    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        PassNotification.update(this)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        setContent { MaterialTheme { Screen() } }
        refresh() // on app open (SPEC §3.1), then pre-prove
    }

    private fun refresh() {
        lifecycleScope.launch {
            busy = "Updating…"
            runCatching { Jobs.refresh(this@MainActivity) }
            busy = "Preparing your pass…"
            runCatching { Jobs.preprove(this@MainActivity) }
            busy = null
            PassNotification.update(this@MainActivity)
            tick++
        }
    }

    private var busy by mutableStateOf<String?>(null)
    private var error by mutableStateOf<String?>(null)

    private fun buy(product: String) {
        lifecycleScope.launch {
            busy = "Buying…"
            error = null
            try {
                val protocol = ProtocolEngine(WebAppEngine.shared(this@MainActivity))
                Purchaser(
                    PassRepository(this@MainActivity), KeystoreSecretStore(this@MainActivity), protocol,
                    IssuerClient(Settings(this@MainActivity).issuerUrl),
                ).buy(product)
            } catch (e: Exception) {
                error = "Purchase failed. Is the issuer reachable? (${e.javaClass.simpleName})"
            }
            busy = null
            tick++
            if (error == null) refresh()
        }
    }

    @Composable
    private fun Screen() {
        val repo = remember(tick) { PassRepository(this) }
        val pass = remember(tick) { repo.pass() }
        val root = remember(tick) { repo.rootState() }
        val last = remember(tick) { repo.lastRefresh() }
        val epochNow = System.currentTimeMillis() / 1000 / PreProver.EPOCH
        val readyOffline = remember(tick) { root != null && repo.anyCachedProof(epochNow) != null }
        var showSettings by remember { mutableStateOf(false) }

        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("Unlink Pass", style = MaterialTheme.typography.headlineSmall)

            if (pass == null) {
                Text("You don't have a pass yet.")
            } else {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(productName(pass.product), style = MaterialTheme.typography.titleMedium)
                        Text("Valid until ${QrActivity.formatDay(pass.validUntilDay)}")
                        Text(className(pass.zoneClass))
                        when (last?.status) {
                            PassStatus.REVOKED -> Text("Pass revoked", color = MaterialTheme.colorScheme.error)
                            PassStatus.MISMATCH -> Text("Pass mismatch, contact the issuer", color = MaterialTheme.colorScheme.error)
                            else -> if (readyOffline) Text("Ready offline ✓") else if (root == null) {
                                Text("Pass activates at the next update")
                            } else Text("Preparing…")
                        }
                        last?.let {
                            Text("Last updated ${Refresher.formatTime(it.at)}", style = MaterialTheme.typography.bodySmall)
                            if (!it.ok) Text(it.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(enabled = root != null, onClick = { startActivity(Intent(this@MainActivity, QrActivity::class.java)) }) {
                        Text("Show pass")
                    }
                    OutlinedButton(enabled = busy == null, onClick = { refresh() }) { Text("Refresh") }
                }
                if (Build.VERSION.SDK_INT >= 33) {
                    TextButton(onClick = { addTile() }) { Text("Add \"Show pass\" to Quick Settings (works on the lock screen)") }
                }
            }

            busy?.let { Text(it) }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

            HorizontalDivider()
            Text(if (pass == null) "Buy a pass" else "Buy a new pass (replaces this one)", style = MaterialTheme.typography.titleMedium)
            Text("Simulated payment: no money is charged.", style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(enabled = busy == null, onClick = { buy("day-pass") }) { Text("Buy day pass") }
                Button(enabled = busy == null, onClick = { buy("month-pass") }) { Text("Buy month pass") }
            }

            HorizontalDivider()
            TextButton(onClick = { showSettings = !showSettings }) { Text(if (showSettings) "Hide settings" else "Settings") }
            if (showSettings) SettingsForm()
        }
    }

    @Composable
    private fun SettingsForm() {
        val s = remember { Settings(this) }
        var arkiv by remember { mutableStateOf(s.arkivRpcUrl) }
        var sepolia by remember { mutableStateOf(s.sepoliaRpcUrl) }
        var issuer by remember { mutableStateOf(s.issuerUrl) }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(arkiv, { arkiv = it }, label = { Text("Arkiv RPC URL") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(sepolia, { sepolia = it }, label = { Text("Sepolia RPC URL") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(issuer, { issuer = it }, label = { Text("Issuer URL (purchase only)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Button(onClick = {
                s.arkivRpcUrl = arkiv; s.sepoliaRpcUrl = sepolia; s.issuerUrl = issuer
                EpochScheduler.refreshNow(this@MainActivity)
            }) { Text("Save") }
        }
    }

    /** Android 13+: asks the system to add the "Show pass" tile (the user confirms in a system dialog). */
    private fun addTile() {
        if (Build.VERSION.SDK_INT < 33) return
        getSystemService(android.app.StatusBarManager::class.java).requestAddTileService(
            android.content.ComponentName(this, xyz.unlink.passenger.ui.PassTileService::class.java),
            "Show pass",
            android.graphics.drawable.Icon.createWithResource(this, android.R.drawable.ic_menu_view),
            mainExecutor,
        ) { }
    }

    private fun productName(p: String) = when (p) {
        "day-pass" -> "Day pass"
        "month-pass" -> "Month pass"
        "month-first" -> "Month pass, 1st class"
        else -> p
    }

    private fun className(z: Int) = when (z) {
        0 -> "2nd class"
        1 -> "1st class"
        else -> "AC"
    }
}
