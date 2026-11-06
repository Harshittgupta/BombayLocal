package xyz.unlink.scanner.verifier

import java.math.BigInteger

/** SPEC v0.3 §9 parameters (seconds unless noted). Mirrors protocol/src/constants.ts. */
object Params {
    const val EPOCH = 600L
    const val SKEW = 120L
    const val DEBOUNCE_GAP_MS = 1_000L
    const val ROOT_TTL = 36 * 3600L
    const val EXPIRY_WARN = 2 * 3600L
    const val STALE_WARN_MS = 24 * 3600_000L
    const val STALE_MAX_MS = 48 * 3600_000L
    const val DAY_OFFSET = 19_800L
    const val DAY_SECONDS = 86_400L
    const val QR_BYTES = 427
    const val QR_VERSION = 1

    /** BN254 scalar field r (circuit signals) and base field p (curve coordinates). */
    val FIELD_R = BigInteger("21888242871839275222246405745257275088548364400416034343698204186575808495617")
    val FIELD_P = BigInteger("21888242871839275222246405745257275088696311157297823662689037894645226208583")

    /** day(t) = floor((t + DAY_OFFSET) / 86400); day(epochId) = day(epochId · EPOCH). */
    fun dayOfEpoch(epochId: Long): Long = Math.floorDiv(epochId * EPOCH + DAY_OFFSET, DAY_SECONDS)
}
