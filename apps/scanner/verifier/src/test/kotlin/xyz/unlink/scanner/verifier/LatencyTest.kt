package xyz.unlink.scanner.verifier

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Laptop reference for SPEC §10 "Verify latency (steps 1–10)": the full verify() on the valid fixture, and the Kotlin
 * part alone (everything except the engine call). The phone number comes from the app's instrumented test.
 */
class LatencyTest {
    @Test
    fun measureVerifyLatency() {
        val f = QrFixture.named("valid")
        var engineNs = 0L
        val timed = Groth16Engine { vk, p, s ->
            val t0 = System.nanoTime()
            NodeSnarkjsEngine.verify(vk, p, s).also { engineNs = System.nanoTime() - t0 }
        }
        val v = OfflineVerifier(timed)
        repeat(3) { v.verify(f.qrText, f.nowMs, f.store()) } // warm-up (JIT, node curve init)
        val total = mutableListOf<Long>()
        val kotlinOnly = mutableListOf<Long>()
        repeat(20) {
            val store = f.store()
            val t0 = System.nanoTime()
            val r = v.verify(f.qrText, f.nowMs, store)
            val dt = System.nanoTime() - t0
            assertEquals(Status.GREEN, r.status)
            total += dt
            kotlinOnly += dt - engineNs
        }
        fun med(x: List<Long>) = x.sorted()[x.size / 2] / 1e6
        println("LATENCY verify() median %.1f ms (Kotlin steps %.1f ms + snarkjs engine via node IPC), n=20".format(med(total), med(kotlinOnly)))

        val parse = mutableListOf<Long>()
        repeat(20) {
            val t0 = System.nanoTime()
            QrPayload.parse(f.qrText)!!
            parse += System.nanoTime() - t0
        }
        println("LATENCY step 1 parse incl. G2 subgroup check median %.1f ms".format(med(parse)))
        assertTrue("SPEC §10 target < 1 s", med(total) < 1000.0)
    }
}
