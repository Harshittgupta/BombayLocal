package xyz.unlink.scanner.verifier

import java.math.BigInteger

/**
 * The Groth16 verifier the app provides (M3 engine: snarkjs 0.7.6 `groth16.verify`, run offline in a WebView).
 * `publicSignals` are in SPEC §4 order. Returns false for an invalid proof; throws only if the engine itself fails.
 */
fun interface Groth16Engine {
    fun verify(vkJson: String, proof: Groth16Proof, publicSignals: List<BigInteger>): Boolean
}

enum class Status { GREEN, AMBER, RED }

/** SPEC §5 reason codes. VERIFIER_ERROR is the one addition: the engine failed or no vk is stored (fail closed). */
enum class Reason {
    OK,
    MALFORMED,
    WRONG_EPOCH,
    SCANNER_STALE,
    ISSUER_INACTIVE,
    BAD_SIGNATURE,
    BELOW_FLOOR,
    BAD_ROOT_TTL,
    ROOT_EXPIRED,
    BAD_PROOF,
    WRONG_CLASS,
    SEEN_BEFORE,
    DUPLICATE,
    ROOT_NEAR_EXPIRY,
    SCANNER_UNSYNCED,
    VERIFIER_ERROR,
}

/**
 * `reason` is the first failure (Red), the first Amber condition, or OK. `warnings` lists every Amber condition in
 * SPEC §5 step 10 order. `sameShowing` is true when the read was debounced (not counted).
 */
data class Result(
    val status: Status,
    val reason: Reason,
    val warnings: List<Reason> = emptyList(),
    val sameShowing: Boolean = false,
)

/**
 * SPEC §5 `verify(qrText, now)`: steps 1–10 in order, first failure wins. Uses only `store` and `engine`: no
 * network, no logging. `nowMs` is unix milliseconds (the debounce gap is 1 s); every other rule uses whole seconds.
 */
class OfflineVerifier(private val engine: Groth16Engine) {

    @Synchronized
    fun verify(qrText: String, nowMs: Long, store: VerifierStore): Result {
        // 1. Parse.
        val q = QrPayload.parse(qrText) ?: return red(Reason.MALFORMED)
        val now = Math.floorDiv(nowMs, 1000L)

        // 2. Epoch.
        val e = Math.floorDiv(now, Params.EPOCH)
        val t = Math.floorMod(now, Params.EPOCH)
        val epochOk = q.epochId == e ||
            (q.epochId == e - 1 && t <= Params.SKEW) ||
            (q.epochId == e + 1 && Params.EPOCH - t <= Params.SKEW)
        if (!epochOk) return red(Reason.WRONG_EPOCH)

        // 3. Scanner freshness.
        // A lastSync more than SKEW in the future means the clock moved back since the sync: the age is unknown, so
        // the TC must sync again.
        val sinceSync = nowMs - store.lastSyncMs()
        if (sinceSync > Params.STALE_MAX_MS || sinceSync < -Params.SKEW * 1000) return red(Reason.SCANNER_STALE)

        // 4. Issuer.
        val issuer = store.issuer(q.issuerHex)
        if (issuer == null || !issuer.active) return red(Reason.ISSUER_INACTIVE)

        // 5. Signed root.
        val digest = SignedRoot.digest(store.chainId, store.registry, q.issuer, q.rootId, q.root, q.issuedAt, q.expiresAt)
        if (SignedRoot.recoverSigner(digest, q.signature) != q.issuerHex) return red(Reason.BAD_SIGNATURE)
        if (java.lang.Long.compareUnsigned(q.rootId, issuer.floor) < 0) return red(Reason.BELOW_FLOOR)
        if (q.expiresAt - q.issuedAt != Params.ROOT_TTL) return red(Reason.BAD_ROOT_TTL)
        if (!(q.issuedAt <= now + Params.SKEW && now < q.expiresAt)) return red(Reason.ROOT_EXPIRED)
        // A rootId this scanner has never seen is accepted: every check above passed.

        // 6. Proof. currentDay is derived from epochId, never read from the QR.
        val vk = store.vkJson() ?: return red(Reason.VERIFIER_ERROR)
        val signals = listOf(
            q.rootValue, q.nullifier, BigInteger.valueOf(q.epochId),
            BigInteger.valueOf(Params.dayOfEpoch(q.epochId)), BigInteger.valueOf(q.zoneClass.toLong()),
        )
        val proofOk = try {
            engine.verify(vk, q.proof, signals)
        } catch (ex: Exception) {
            return red(Reason.VERIFIER_ERROR)
        }
        if (!proofOk) return red(Reason.BAD_PROOF)

        // 7. Class.
        val required = store.requiredClass()
        if (required != null && q.zoneClass < required) return red(Reason.WRONG_CLASS)

        // 8. Nullifier. A read with no gap >= DEBOUNCE_GAP since the last one is the same showing: not counted.
        // A negative gap (the clock moved back) counts as a new showing, so a clock change can never hide a repeat.
        val prev = store.nullifier(q.nullifier)
        val gap = if (prev == null) -1 else nowMs - prev.lastReadMs
        val sameShowing = prev != null && gap >= 0 && gap < Params.DEBOUNCE_GAP_MS
        val count = if (sameShowing) prev.count else (prev?.count ?: 0) + 1

        // 9. Store, then purge entries older than the previous epoch.
        store.putNullifier(NullifierRecord(q.nullifier, q.epochId, count, prev?.firstSeenMs ?: nowMs, nowMs))
        store.purgeBefore(e - 1)

        // 10. Result.
        if (count >= 3) return Result(Status.RED, Reason.DUPLICATE, sameShowing = sameShowing)
        val warnings = buildList {
            if (count == 2) add(Reason.SEEN_BEFORE)
            if (q.expiresAt - now < Params.EXPIRY_WARN) add(Reason.ROOT_NEAR_EXPIRY)
            if (sinceSync > Params.STALE_WARN_MS) add(Reason.SCANNER_UNSYNCED)
        }
        return if (warnings.isEmpty()) {
            Result(Status.GREEN, Reason.OK, sameShowing = sameShowing)
        } else {
            Result(Status.AMBER, warnings.first(), warnings, sameShowing)
        }
    }

    private fun red(r: Reason) = Result(Status.RED, r)
}
