package xyz.unlink.scanner

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import xyz.unlink.scanner.key.ScannerKey
import xyz.unlink.scanner.store.IssuerRow
import xyz.unlink.scanner.store.NullifierRow
import xyz.unlink.scanner.store.RoomVerifierStore
import xyz.unlink.scanner.store.ScannerDb
import xyz.unlink.scanner.sync.ChainIssuer
import xyz.unlink.scanner.sync.SyncConfig
import xyz.unlink.scanner.sync.Syncer
import xyz.unlink.scanner.verifier.Hex
import xyz.unlink.scanner.verifier.ScanBatch
import xyz.unlink.scanner.verifier.SignedRoot
import java.math.BigInteger

@RunWith(AndroidJUnit4::class)
class SyncAndKeyTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext

    /** A Keystore-wrapped scanner key survives a reload, and its batch signature recovers to its address. */
    @Test
    fun scannerKeySignsRecoverableBatches() {
        val k = ScannerKey(ctx, "test-scanner-key.bin", "unlink-test-scanner-wrap")
        try {
            val a = k.address
            assertTrue(a.matches(Regex("0x[0-9a-f]{40}")))
            assertEquals(a, ScannerKey(ctx, "test-scanner-key.bin", "unlink-test-scanner-wrap").address)
            val digest = ScanBatch.digest(Hex.bytes(a, 20), 2_988_400, ScanBatch.sorted(listOf(BigInteger("9"), BigInteger("2"), BigInteger("5"))))
            val sig = k.signDigest(digest)
            assertEquals(65, sig.size)
            assertEquals(a, SignedRoot.recoverSigner(digest, sig))
        } finally {
            k.clear()
        }
    }

    /** A Registry read can't roll the store back: suspension is sticky, floor and latestRootId never decrease. */
    @Test
    fun registryMergeIsRollbackSafe() {
        val old = IssuerRow("0xabc", active = false, floor = 5, latestRootId = 9, arkivRootId = 9, listed = true)
        val m = Syncer.merge(old, ChainIssuer("0xabc", active = true, floor = 3, latestRootId = 7))
        assertFalse(m.active)
        assertEquals(5, m.floor)
        assertEquals(9, m.latestRootId)
        assertTrue(m.listed)
        val fresh = Syncer.merge(null, ChainIssuer("0xdef", active = true, floor = 2, latestRootId = 4))
        assertTrue(fresh.active)
        assertEquals(2, fresh.floor)
    }

    /** Purge drops old log entries but keeps their upload-queue rows until the issuer accepts them. */
    @Test
    fun purgeKeepsUploadQueue() {
        val db = Room.inMemoryDatabaseBuilder(ctx, ScannerDb::class.java).build()
        val dao = db.dao()
        dao.recordScan(NullifierRow("111", 10, 1, 1000, 1000))
        dao.recordScan(NullifierRow("111", 10, 2, 1000, 5000)) // same nullifier again: one queue row
        dao.recordScan(NullifierRow("222", 12, 1, 2000, 2000))
        dao.purgeBefore(11)
        assertEquals(1, dao.nullifierCount())
        assertEquals(listOf(10L, 12L), dao.pendingEpochs())
        assertEquals(listOf("111"), dao.pending(10))
        dao.dequeue(10, listOf("111"))
        assertEquals(listOf(12L), dao.pendingEpochs())
        db.close()
    }

    /**
     * LIVE: a real sync against the Sepolia Registry and Arkiv (no issuer URL, so no upload). The real issuer must be
     * active, lastSync set, and the authority's VerifyKey on Arkiv must match the APK's pinned hash.
     */
    @Test
    fun liveSyncReadsRegistryAndArkiv() {
        val db = Room.inMemoryDatabaseBuilder(ctx, ScannerDb::class.java).build()
        val key = ScannerKey(ctx, "test-live-key.bin", "unlink-test-live-wrap")
        try {
            val cfg = SyncConfig(
                BuildConfig.CHAIN_ID, BuildConfig.REGISTRY, BuildConfig.AUTHORITY, BuildConfig.VK_HASH,
                listOf("https://invalid.example.invalid", BuildConfig.SEPOLIA_RPC_DEFAULT), // primary down -> backup used
                BuildConfig.ARKIV_RPC_DEFAULT, null,
            )
            val now = System.currentTimeMillis()
            val report = Syncer(db.dao(), key, cfg).sync(now)
            assertTrue(report.toString(), report.registry.startsWith("ok"))
            assertEquals(report.toString(), "ok", report.vk)
            val issuer = db.dao().issuer(BuildConfig.DEPLOYMENT_ISSUER.lowercase())
            assertNotNull("deployment issuer synced", issuer)
            assertTrue(issuer!!.active)
            assertTrue(issuer.latestRootId >= 8)
            assertTrue("Arkiv SignedRoot seen", issuer.arkivRootId >= issuer.latestRootId)
            assertEquals(now.toString(), db.dao().get(RoomVerifierStore.K_LAST_SYNC))
            assertEquals(BuildConfig.VK_HASH, Syncer.sha256(db.dao().get(RoomVerifierStore.K_VK)!!.toByteArray()))
            assertNotEquals("no upload without an issuer URL", "ok", report.upload.take(2))
        } finally {
            key.clear()
            db.close()
        }
    }
}
