package xyz.unlink.passenger

import android.Manifest
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import xyz.unlink.passenger.pass.PassHistory
import xyz.unlink.passenger.pass.PassRepository
import xyz.unlink.passenger.pass.PassStatus
import xyz.unlink.passenger.pass.PreProver
import xyz.unlink.passenger.ui.BuyScreen
import xyz.unlink.passenger.ui.PassNotification
import xyz.unlink.passenger.ui.PassesScreen
import xyz.unlink.passenger.ui.QrActivity
import xyz.unlink.passenger.ui.SettingsScreen
import xyz.unlink.passenger.ui.components.Products
import xyz.unlink.passenger.ui.components.TicketIcon
import xyz.unlink.passenger.ui.theme.Ink
import xyz.unlink.passenger.ui.theme.Type
import xyz.unlink.passenger.ui.theme.BombayLocalTheme
import xyz.unlink.passenger.work.EpochScheduler
import xyz.unlink.passenger.work.Jobs
import java.io.IOException

/**
 * Two destinations, Buy and Passes, plus a Settings route. Opens on Passes when a pass exists, on Buy otherwise.
 * Plain words only: no crypto terms on screen. The purchase uses a simulated payment, said next to the button.
 */
class MainActivity : ComponentActivity() {

    private enum class Route { BUY, PASSES, SETTINGS }

    private var tick by mutableIntStateOf(0)
    private var busy by mutableStateOf<String?>(null)
    private var buyError by mutableStateOf<String?>(null)
    private var route by mutableStateOf<Route?>(null)

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        PassNotification.update(this)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        route = if (PassRepository(this).pass() != null) Route.PASSES else Route.BUY
        setContent { BombayLocalTheme { App() } }
        refresh() // on app open (SPEC §3.1), then pre-prove
    }

    override fun onResume() {
        super.onResume()
        PassNotification.update(this) // the code may have changed while we were away
        tick++
    }

    private fun refresh() {
        lifecycleScope.launch { refreshOnce() }
    }

    private suspend fun refreshOnce() {
        busy = "Updating…"
        runCatching { Jobs.refresh(this@MainActivity) }
        busy = "Preparing your pass…"
        runCatching { Jobs.preprove(this@MainActivity) }
        busy = null
        PassNotification.update(this@MainActivity)
        tick++
    }

    /**
     * Right after a purchase the new pass is not in any on-chain root yet; the issuer auto-publishes one within about a
     * minute. Check back a few times while this screen is open, so the pass turns ready without tapping Refresh.
     */
    private suspend fun refreshUntilActive() {
        refreshOnce()
        // At most one refresh per ROOT_INTERVAL (SPEC §3.1), and 4 tries at most: about 4 minutes in the demo deployment.
        val waitMs = maxOf(BuildConfig.ROOT_INTERVAL * 1000, 60_000L)
        repeat(4) {
            if (PassRepository(this).lastRefresh()?.status != PassStatus.WAITING) return
            delay(waitMs)
            refreshOnce()
        }
    }

    private fun buy(product: String) {
        lifecycleScope.launch {
            busy = "Buying…"
            buyError = null
            val old = PassRepository(this@MainActivity).pass()
            try {
                Jobs.buy(this@MainActivity, product)
                if (old != null) runCatching { PassHistory(this@MainActivity).recordReplaced(old) }
                route = Route.PASSES
            } catch (e: Exception) {
                buyError = buyErrorText(e)
            }
            busy = null
            tick++
            if (buyError == null) refreshUntilActive()
        }
    }

    private fun buyErrorText(e: Exception): String = when {
        e is IOException && e.message?.startsWith("HTTP ") == true ->
            "The issuer turned the purchase down (${e.message}). Try again in a moment."
        e is IOException -> "Couldn't reach the issuer. Check the issuer URL in Settings and try again."
        else -> "The purchase didn't go through (${e.javaClass.simpleName}). Try again."
    }

    @Composable
    private fun App() {
        val repo = remember(tick) { PassRepository(this) }
        val pass = remember(tick) { repo.pass() }
        val root = remember(tick) { repo.rootState() }
        val last = remember(tick) { repo.lastRefresh() }
        val history = remember(tick) { PassHistory(this).entries() }
        val epochNow = System.currentTimeMillis() / 1000 / PreProver.EPOCH
        val readyOffline = remember(tick) { root != null && repo.anyCachedProof(epochNow) != null }
        val current = route ?: Route.BUY

        BackHandler(enabled = current == Route.SETTINGS) { route = Route.PASSES }

        Scaffold(
            containerColor = Ink.ground,
            bottomBar = {
                if (current != Route.SETTINGS) {
                    NavigationBar(containerColor = Ink.raised) {
                        val colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Ink.text, selectedTextColor = Ink.text, indicatorColor = Ink.line,
                            unselectedIconColor = Ink.muted, unselectedTextColor = Ink.muted,
                        )
                        NavigationBarItem(
                            selected = current == Route.BUY, onClick = { route = Route.BUY }, colors = colors,
                            icon = { Icon(Icons.Filled.ShoppingCart, contentDescription = null) },
                            label = { Text("Buy", style = Type.label) },
                        )
                        NavigationBarItem(
                            selected = current == Route.PASSES, onClick = { route = Route.PASSES }, colors = colors,
                            icon = { Icon(TicketIcon, contentDescription = null) },
                            label = { Text("Passes", style = Type.label) },
                        )
                    }
                }
            },
        ) { padding ->
            val m = Modifier.padding(padding)
            when (current) {
                Route.BUY -> BuyScreen(
                    currentPassName = pass?.let { Products.name(it.product) },
                    buying = busy == "Buying…",
                    error = buyError,
                    onBuy = ::buy,
                    modifier = m,
                )
                Route.PASSES -> PassesScreen(
                    pass = pass,
                    hasRoot = root != null,
                    readyOffline = readyOffline,
                    last = last,
                    busy = busy,
                    history = history,
                    onShowPass = { startActivity(Intent(this, QrActivity::class.java)) },
                    onRefresh = { refresh() },
                    onSettings = { route = Route.SETTINGS },
                    onBuy = { route = Route.BUY },
                    modifier = m,
                )
                Route.SETTINGS -> SettingsScreen(
                    settings = remember { Settings(this) },
                    onSaved = { EpochScheduler.refreshNow(this) },
                    onAddTile = { addTile() },
                    onBack = { route = Route.PASSES },
                    modifier = m,
                )
            }
        }
    }

    /** Android 13+: asks the system to add the "Show pass" tile (the user confirms in a system dialog). */
    private fun addTile() {
        if (Build.VERSION.SDK_INT < 33) return
        getSystemService(android.app.StatusBarManager::class.java).requestAddTileService(
            android.content.ComponentName(this, xyz.unlink.passenger.ui.PassTileService::class.java),
            "Show pass",
            android.graphics.drawable.Icon.createWithResource(this, R.drawable.ic_stat_pass),
            mainExecutor,
        ) { }
    }
}
