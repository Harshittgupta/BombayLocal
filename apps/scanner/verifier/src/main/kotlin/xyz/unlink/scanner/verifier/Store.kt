package xyz.unlink.scanner.verifier

import java.math.BigInteger

/** What the last sync recorded about one issuer (Registry.issuerState). */
data class IssuerRecord(val active: Boolean, val floor: Long)

/** One nullifier log entry (SPEC §5 step 9). Nothing else about a scan is ever stored. */
data class NullifierRecord(
    val nullifier: BigInteger,
    val epochId: Long,
    val count: Int,
    val firstSeenMs: Long,
    val lastReadMs: Long,
)

/**
 * The scanner's local state, filled only by sync (never by verify, except the nullifier log). `chainId` and
 * `registry` are the scanner's own deployment config and go into every signed-root digest.
 */
interface VerifierStore {
    val chainId: Long

    /** 20 bytes. */
    val registry: ByteArray

    /** Unix ms of the last successful sync; 0 = never. */
    fun lastSyncMs(): Long

    /** Keyed by lowercase 0x address. */
    fun issuer(address: String): IssuerRecord?

    /** snarkjs verification_key.json, hash-checked at sync against the APK's pinned hash; null if none. */
    fun vkJson(): String?

    /** Minimum zoneClass this checkpoint requires, or null for any class. */
    fun requiredClass(): Int?

    fun nullifier(n: BigInteger): NullifierRecord?
    fun putNullifier(r: NullifierRecord)

    /** Drop every entry with epochId < `epochId`. */
    fun purgeBefore(epochId: Long)
}

/** An in-memory VerifierStore. The app's persistent store implements the same interface. */
class MemoryStore(
    override val chainId: Long,
    override val registry: ByteArray,
    var lastSync: Long,
    issuers: Map<String, IssuerRecord>,
    var vk: String?,
    var required: Int?,
) : VerifierStore {
    val issuers: MutableMap<String, IssuerRecord> = issuers.mapKeys { it.key.lowercase() }.toMutableMap()
    val log: MutableMap<BigInteger, NullifierRecord> = linkedMapOf()

    override fun lastSyncMs() = lastSync
    override fun issuer(address: String) = issuers[address.lowercase()]
    override fun vkJson() = vk
    override fun requiredClass() = required
    override fun nullifier(n: BigInteger) = log[n]
    override fun putNullifier(r: NullifierRecord) {
        log[r.nullifier] = r
    }
    override fun purgeBefore(epochId: Long) {
        log.values.removeIf { it.epochId < epochId }
    }
}
