package xyz.unlink.scanner.verifier

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/** Every fixtures/qr/<case>.json through OfflineVerifier.verify() with the real snarkjs engine (SPEC §5). */
@RunWith(Parameterized::class)
class FixtureTest(private val name: String) {

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun cases(): List<Array<Any>> = QrFixture.all().map { arrayOf<Any>(it.name) }
    }

    @Test
    fun matchesExpected() {
        val f = QrFixture.named(name)
        val store = f.store()
        val before = store.log.toMap()
        val r = OfflineVerifier(NodeSnarkjsEngine).verify(f.qrText, f.nowMs, store)
        val ex = f.expected
        val ctx = "$name (${f.note})"
        assertEquals(ctx, ex.getString("result"), r.status.name)
        assertEquals(ctx, ex.getString("reason"), r.reason.name)
        if (ex.has("warnings")) {
            val w = ex.getJSONArray("warnings").let { a -> (0 until a.length()).map { a.getString(it) } }
            assertEquals("$ctx warnings", w, r.warnings.map { it.name })
        }
        if (r.status == Status.GREEN) assertTrue("$ctx: Green has no warnings", r.warnings.isEmpty())

        val q = QrPayload.parse(f.qrText)
        if (ex.has("nullifierCount")) {
            val rec = store.nullifier(q!!.nullifier)
            assertNotNull("$ctx: nullifier stored", rec)
            assertEquals("$ctx count", ex.getInt("nullifierCount"), rec!!.count)
            val reachedStep8 = r.status != Status.RED || r.reason == Reason.DUPLICATE
            if (reachedStep8) assertEquals("$ctx lastRead", f.nowMs, rec.lastReadMs)
        }
        if (ex.has("absent")) {
            val a = ex.getJSONArray("absent")
            for (i in 0 until a.length()) assertNull("$ctx purged", store.nullifier(java.math.BigInteger(a.getString(i))))
        }
        // Steps 1–7 never write: a Red before step 8 leaves the log exactly as it was.
        if (r.status == Status.RED && r.reason != Reason.DUPLICATE) assertEquals("$ctx: log untouched", before, store.log.toMap())
    }
}
