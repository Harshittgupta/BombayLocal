package xyz.unlink.scanner.store

import xyz.unlink.scanner.verifier.IssuerRecord
import xyz.unlink.scanner.verifier.NullifierRecord
import xyz.unlink.scanner.verifier.VerifierStore
import java.math.BigInteger

/**
 * The scanner's persistent VerifierStore. Reads are what the last sync wrote; the only writes during verify are the
 * nullifier log (and its upload queue entry). Call from a background thread (Room forbids main-thread queries).
 */
class RoomVerifierStore(
    private val dao: ScannerDao,
    override val chainId: Long,
    override val registry: ByteArray,
    private val requiredClassProvider: () -> Int?,
) : VerifierStore {

    override fun lastSyncMs(): Long = dao.get(K_LAST_SYNC)?.toLongOrNull() ?: 0L

    override fun issuer(address: String): IssuerRecord? =
        dao.issuer(address.lowercase())?.let { IssuerRecord(it.active, it.floor, it.latestRootId) }

    override fun vkJson(): String? = dao.get(K_VK)

    override fun requiredClass(): Int? = requiredClassProvider()

    override fun nullifier(n: BigInteger): NullifierRecord? =
        dao.nullifier(n.toString())?.let { NullifierRecord(BigInteger(it.nullifier), it.epochId, it.count, it.firstSeenMs, it.lastReadMs) }

    /**
     * The first sighting of a nullifier is also queued for the scan-batch upload; later reads (repeats, debounced
     * re-reads) only update the log, so each nullifier is uploaded at most once and the issuer's cross-scanner
     * duplicate count isn't inflated by one scanner's own repeats.
     */
    override fun putNullifier(r: NullifierRecord) {
        val row = NullifierRow(r.nullifier.toString(), r.epochId, r.count, r.firstSeenMs, r.lastReadMs)
        if (dao.nullifier(row.nullifier) == null) dao.recordScan(row) else dao.upsertNullifier(row)
    }

    override fun purgeBefore(epochId: Long) = dao.purgeBefore(epochId)

    /** Correction from the last sync's chain time (SPEC §8); add it to the device clock before verifying. */
    fun clockOffsetMs(): Long = dao.get(K_CLOCK_OFFSET)?.toLongOrNull() ?: 0L

    /** The scanner's notion of now: device clock + the offset measured at the last sync. */
    fun nowMs(): Long = System.currentTimeMillis() + clockOffsetMs()

    companion object {
        const val K_CLOCK_OFFSET = "clockOffsetMs"
        const val K_LAST_SYNC = "lastSyncMs"
        const val K_VK = "vkJson"
        const val K_VK_HASH = "vkSha256"
        const val K_SYNC_STATUS = "syncStatus"
        const val K_SYNC_ATTEMPT = "syncAttemptMs"
    }
}
