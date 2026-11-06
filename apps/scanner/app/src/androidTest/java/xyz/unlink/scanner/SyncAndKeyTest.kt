package xyz.unlink.scanner

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import xyz.unlink.scanner.key.ScannerKey
import xyz.unlink.scanner.store.IssuerRow
import xyz.unlink.scanner.store.NullifierRow
import xyz.unlink.scanner.store.PendingScanRow
import xyz.unlink.scanner.store.RoomVerifierStore
import xyz.unlink.scanner.store.ScannerDb
import xyz.unlink.scanner.sync.ChainIssuer
import xyz.unlink.scanner.sync.Http
import xyz.unlink.scanner.sync.RpcFactory
import xyz.unlink.scanner.sync.SyncConfig
import xyz.unlink.scanner.sync.Syncer
import xyz.unlink.scanner.verifier.Hex
import xyz.unlink.scanner.verifier.NullifierRecord
import org.web3j.crypto.Hash
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
            // Two independent real providers; an unreachable issuer URL (port 9) proves only CLOSED epochs are sent.
            val cfg = SyncConfig(
                BuildConfig.CHAIN_ID, BuildConfig.REGISTRY, BuildConfig.AUTHORITY, BuildConfig.VK_HASH,
                listOf(BuildConfig.SEPOLIA_RPC_DEFAULT, BuildConfig.SEPOLIA_RPC_BACKUP_DEFAULT),
                BuildConfig.ARKIV_RPC_DEFAULT, "http://127.0.0.1:9",
            )
            val now = System.currentTimeMillis()
            val e = Syncer.epochOf(now)
            db.dao().enqueue(PendingScanRow(e, "123"))                               // open epoch: kept, not sent
            db.dao().enqueue(PendingScanRow(e - Syncer.PENDING_MAX_EPOCHS - 1, "456")) // older than 24 h: dropped unsent
            val report = Syncer(db.dao(), key, cfg).sync(now)
            assertTrue(report.toString(), report.registry.startsWith("ok"))
            assertEquals(report.toString(), "ok", report.vk)
            val issuer = db.dao().issuer(BuildConfig.DEPLOYMENT_ISSUER.lowercase())
            assertNotNull("deployment issuer synced", issuer)
            assertTrue(issuer!!.active)
            assertTrue(issuer.latestRootId >= 8)
            assertTrue("Arkiv SignedRoot seen", issuer.arkivRootId >= issuer.latestRootId)
            val offset = db.dao().get(RoomVerifierStore.K_CLOCK_OFFSET)!!.toLong()
            assertEquals("phone clock is network-synced", 0L, offset)
            assertEquals((now + offset).toString(), db.dao().get(RoomVerifierStore.K_LAST_SYNC))
            assertEquals(BuildConfig.VK_HASH, Syncer.sha256(db.dao().get(RoomVerifierStore.K_VK)!!.toByteArray()))
            assertTrue(report.upload, report.upload.startsWith("ok (0 batches"))
            assertEquals(listOf(e), db.dao().pendingEpochs())
        } finally {
            key.clear()
            db.close()
        }
    }

    /** LIVE: one provider lies about the Registry (adds an issuer) -> nothing is applied and lastSync doesn't move. */
    @Test
    fun disagreeingProvidersApplyNothing() {
        val db = Room.inMemoryDatabaseBuilder(ctx, ScannerDb::class.java).build()
        val key = ScannerKey(ctx, "test-lie-key.bin", "unlink-test-lie-wrap")
        try {
            val honest = BuildConfig.SEPOLIA_RPC_DEFAULT
            val liar = "liar://rpc" // the honest endpoint, with issuers() rewritten to append an attacker issuer
            val rpcFor: RpcFactory = { url ->
                { m, p ->
                    val real = Http.jsonRpc(honest, m, p)
                    val data = if (m == "eth_call") p.getJSONObject(0).getString("data") else ""
                    if (url == liar && data.startsWith(Hash.sha3String("issuers()").substring(0, 10))) {
                        // ABI address[]: offset 0x20, length n+1, the real items, then 0x…bad
                        val hex = (real as String).removePrefix("0x")
                        val n = BigInteger(hex.substring(64, 128), 16).toInt()
                        "0x" + hex.substring(0, 64) + (n + 1).toString(16).padStart(64, '0') + hex.substring(128, 128 + 64 * n) + "bad".padStart(64, '0')
                    } else real
                }
            }
            val cfg = SyncConfig(BuildConfig.CHAIN_ID, BuildConfig.REGISTRY, BuildConfig.AUTHORITY, BuildConfig.VK_HASH, listOf(honest, liar), BuildConfig.ARKIV_RPC_DEFAULT, null)
            val report = Syncer(db.dao(), key, cfg, rpcFor).sync(System.currentTimeMillis())
            assertTrue(report.registry, report.registry.startsWith("failed") && report.registry.contains("disagree"))
            assertTrue("no issuer applied", db.dao().issuers().isEmpty())
            assertNull("lastSync not advanced", db.dao().get(RoomVerifierStore.K_LAST_SYNC))
        } finally {
            key.clear()
            db.close()
        }
    }

    @Test
    fun clockOffsetIgnoresBlockLagButCorrectsRealSkew() {
        val now = 1_793_952_000_000L
        assertEquals(0L, Syncer.clockOffset(now, now / 1000 - 15)) // block 15 s behind: normal lag
        assertEquals(0L, Syncer.clockOffset(now, now / 1000 + 60))
        assertEquals(300_000L, Syncer.clockOffset(now, now / 1000 + 300)) // device 5 min slow
        assertEquals(-600_000L, Syncer.clockOffset(now, now / 1000 - 600)) // device 10 min fast
    }

    /** Through the app's store: a nullifier is queued once, however many times it is read. */
    @Test
    fun onlyFirstSightingIsQueued() {
        val db = Room.inMemoryDatabaseBuilder(ctx, ScannerDb::class.java).build()
        val st = RoomVerifierStore(db.dao(), 1, ByteArray(20)) { null }
        st.putNullifier(NullifierRecord(BigInteger("77"), 5, 1, 1000, 1000))
        st.putNullifier(NullifierRecord(BigInteger("77"), 5, 1, 1000, 1500)) // debounced re-read
        st.putNullifier(NullifierRecord(BigInteger("77"), 5, 2, 1000, 9000)) // second showing
        assertEquals(listOf("77"), db.dao().pending(5))
        db.dao().dequeue(5, listOf("77"))
        st.putNullifier(NullifierRecord(BigInteger("77"), 5, 3, 1000, 20000)) // after upload: not re-queued
        assertTrue(db.dao().pendingEpochs().isEmpty())
        db.close()
    }
}
