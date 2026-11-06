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

    override fun putNullifier(r: NullifierRecord) {
        dao.recordScan(NullifierRow(r.nullifier.toString(), r.epochId, r.count, r.firstSeenMs, r.lastReadMs))
    }

    override fun purgeBefore(epochId: Long) = dao.purgeBefore(epochId)

    companion object {
        const val K_LAST_SYNC = "lastSyncMs"
        const val K_VK = "vkJson"
        const val K_VK_HASH = "vkSha256"
        const val K_SYNC_STATUS = "syncStatus"
        const val K_SYNC_ATTEMPT = "syncAttemptMs"
    }
}
