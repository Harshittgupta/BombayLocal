package xyz.unlink.passenger

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import xyz.unlink.passenger.prover.ProverService
import xyz.unlink.passenger.prover.WebAppEngine
import xyz.unlink.passenger.prover.runProveSelfTest

/**
 * Demo screen for the module-3 spike: tap to generate a real Groth16 proof on this phone, verify it on-device, and
 * show the proving time. The real pass UI arrives in module 7.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                var status by remember { mutableStateOf("Tap to prove fixture case 0 on this device.") }
                var busy by remember { mutableStateOf(false) }
                Column(
                    Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text("Unlink — on-device proof spike", style = MaterialTheme.typography.titleLarge)
                    Text(status)
                    Button(
                        enabled = !busy,
                        onClick = {
                            busy = true
                            status = "Proving on-device…"
                            lifecycleScope.launch {
                                status = try {
                                    val engine = WebAppEngine.create(this@MainActivity)
                                    val r = runProveSelfTest(this@MainActivity, ProverService(engine))
                                    "prove ${r.proveMs} ms\nverified on-device: ${r.verified}\n" +
                                        "matches fixture: ${r.publicSignalsMatch}"
                                } catch (e: Exception) {
                                    "Error: ${e.message}"
                                }
                                busy = false
                            }
                        },
                    ) { Text("Run self-test") }
                }
            }
        }
    }
}
