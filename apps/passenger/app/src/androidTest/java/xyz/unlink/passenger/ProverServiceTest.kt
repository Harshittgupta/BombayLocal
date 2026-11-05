package xyz.unlink.passenger

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import xyz.unlink.passenger.prover.ProverService
import xyz.unlink.passenger.prover.WebAppEngine
import xyz.unlink.passenger.prover.runProveSelfTest

/** Module-3 spike gate: a real Groth16 proof must be generated AND verified on the physical device. */
@RunWith(AndroidJUnit4::class)
class ProverServiceTest {

    @Test
    fun provesAndVerifiesFixtureCase0OnDevice() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val engine = WebAppEngine.create(context)
        val result = runProveSelfTest(context, ProverService(engine))

        Log.i(TAG, "on-device prove ${result.proveMs} ms; verified=${result.verified}")
        assertTrue("public signals must equal fixture case 0", result.publicSignalsMatch)
        assertTrue("proof must verify on-device", result.verified)
    }

    private companion object {
        const val TAG = "UnlinkSpike"
    }
}
