package xyz.unlink.passenger.pass

import android.util.Log
import xyz.unlink.passenger.prover.ProtocolEngine

/** Timing of the last pre-prove batch (for SPEC §10). No secrets, no nullifiers. */
data class PreproveStats(val generated: Int, val totalMs: Long, val firstMs: Long, val avgMs: Long)

/**
 * SPEC §6 pre-prover: real proofs for the current epoch and the next PREPROVE epochs, each encoded as the SPEC §3.4
 * QR text and cached. Never for past epochs, never past the pass's last valid day or the root's expiry (a scanner
 * would reject those). Runs only while the phone is unlocked: the Keystore key refuses to unwrap the secret otherwise.
 */
class PreProver(
    private val repo: PassRepository,
    private val secrets: KeystoreSecretStore,
    private val protocol: ProtocolEngine,
    private val clock: () -> Long = { System.currentTimeMillis() / 1000 },
) {

    suspend fun run(): PreproveStats {
        val pass = repo.pass() ?: return PreproveStats(0, 0, 0, 0)
        val root = repo.rootState() ?: return PreproveStats(0, 0, 0, 0)
        val sr = root.signedRoot
        val first = clock() / EPOCH
        repo.pruneProofsBefore(first)
        val secret = secrets.readSecret() // throws while locked: nothing is proved then
        var generated = 0
        var total = 0L
        var firstMs = 0L
        for (e in first..first + PREPROVE) {
            if (dayOfEpoch(e) > pass.validUntilDay) break
            if (e * EPOCH >= sr.expiresAt) break
            if (repo.cachedProof(e, sr.rootId) != null) continue
            if (e < clock() / EPOCH) continue // became a past epoch while we were proving
            val t0 = System.nanoTime()
            val qr = protocol.proveEpoch(secret, e, pass.validUntilDay, pass.zoneClass, pass.leaf, root.path, sr)
            val ms = (System.nanoTime() - t0) / 1_000_000
            repo.cacheProof(e, sr.rootId, qr)
            if (generated == 0) firstMs = ms
            generated++
            total += ms
        }
        val stats = PreproveStats(generated, total, firstMs, if (generated > 0) total / generated else 0)
        Log.i(TAG, "preprove ${stats.generated} proofs, first ${stats.firstMs} ms, avg ${stats.avgMs} ms")
        return stats
    }

    companion object {
        private const val TAG = "Unlink"
        const val EPOCH = 600L // SPEC §9
        const val PREPROVE = 12 // SPEC §9: current + next 12 epochs
        private const val DAY_OFFSET = 19_800L
        private const val DAY_SECONDS = 86_400L

        fun dayOfEpoch(epochId: Long): Long = (epochId * EPOCH + DAY_OFFSET) / DAY_SECONDS
    }
}
