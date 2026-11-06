package xyz.unlink.scanner.verifier

import org.junit.Assert.assertEquals
import org.junit.Test

/** SPEC §5 note: an engine that throws (crash, timeout) is Red VERIFIER_ERROR, never BAD_PROOF, and nothing is stored. */
class EngineFailureTest {
    @Test
    fun throwingEngineFailsClosed() {
        val f = QrFixture.named("valid")
        val store = f.store()
        val r = OfflineVerifier { _, _, _ -> throw IllegalStateException("renderer gone") }.verify(f.qrText, f.nowMs, store)
        assertEquals(Status.RED, r.status)
        assertEquals(Reason.VERIFIER_ERROR, r.reason)
        assertEquals(emptyMap<Any, Any>(), store.log.toMap())
    }
}
