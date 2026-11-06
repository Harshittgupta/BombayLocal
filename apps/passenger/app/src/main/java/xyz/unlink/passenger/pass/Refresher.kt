package xyz.unlink.passenger.pass

import android.util.Log
import xyz.unlink.passenger.BuildConfig
import xyz.unlink.passenger.net.ArkivClient
import xyz.unlink.passenger.net.RegistryReader
import xyz.unlink.passenger.prover.ProtocolEngine
import java.math.BigInteger
import java.text.DateFormat
import java.util.Date

/** The public data a refresh reads: one Registry call plus Arkiv entities. Never the issuer server (SPEC §3.1). */
interface PublicData {
    suspend fun issuerState(issuer: String): IssuerState
    suspend fun signedRoots(issuer: String, rootId: Long): List<SignedRoot>
    suspend fun leafBatches(issuer: String): List<ArkivBatch>
    suspend fun revocations(issuer: String): List<ArkivRevocation>
}

class NetworkPublicData(sepoliaRpcUrl: String, arkivRpcUrl: String, registry: String = BuildConfig.REGISTRY) : PublicData {
    private val registryReader = RegistryReader(sepoliaRpcUrl, registry)
    private val arkiv = ArkivClient(arkivRpcUrl)
    override suspend fun issuerState(issuer: String) = registryReader.issuerState(issuer)
    override suspend fun signedRoots(issuer: String, rootId: Long) = arkiv.signedRoots(issuer, rootId)
    override suspend fun leafBatches(issuer: String) = arkiv.leafBatches(issuer)
    override suspend fun revocations(issuer: String) = arkiv.revocations(issuer)
}

/** A refresh step failed: the phone keeps its current root (SPEC §3.1 step 5). `reason` is a log-safe state name. */
class RefreshRejected(val reason: String) : Exception(reason)

/**
 * SPEC §3.1 "Refresh: path from public data". The phone moves to a new root only when every check passes:
 *  1. Registry.issuerState: issuer active, latestRootId ≥ floor, never move backwards.
 *  2. Arkiv: the SignedRoot for exactly latestRootId, creator = owner = issuer; two different ones → refuse.
 *  3. Signature recovers the issuer; root == latestRoot; issuedAt == postedAt; expiresAt == issuedAt + ROOT_TTL.
 *  4. Rebuild the tree from LeafBatches + Revocations (protocol/), computed root == signed root.
 *  5. On any failure: keep the previous root, "Couldn't update; your pass still works until <time>".
 *  6. Derive our path; not covered yet → "activates at the next update"; leaf 0 → revoked; other leaf → mismatch.
 * Logs carry only state names (invariant 1).
 */
class Refresher(
    private val repo: PassRepository,
    private val protocol: ProtocolEngine,
    private val data: PublicData,
    private val issuer: String = BuildConfig.ISSUER,
    private val registry: String = BuildConfig.REGISTRY,
    private val chainId: Long = BuildConfig.CHAIN_ID,
    private val clock: () -> Long = { System.currentTimeMillis() / 1000 },
) {

    suspend fun refresh(): RefreshRecord {
        val now = clock()
        val pass = repo.pass() ?: return RefreshRecord(now, true, PassStatus.NO_PASS, "").also { repo.saveRefresh(it) }
        var current = repo.rootState()
        val record = try {
            val st = data.issuerState(issuer)
            if (!st.active) throw RefreshRejected("issuer-inactive")
            // SPEC §3.1 step 1: a held root below the floor is dropped FIRST (its proofs would be BELOW_FLOOR at every
            // scanner), even when the issuer has not yet posted a root at or above the new floor.
            if (current != null && current.signedRoot.rootId < st.floor) {
                repo.dropRoot()
                current = null
            }
            if (st.latestRootId < st.floor) throw RefreshRejected("latest-below-floor")
            val cur = current
            if (cur != null && st.latestRootId < cur.signedRoot.rootId) throw RefreshRejected("chain-behind-current")
            if (cur != null && st.latestRootId == cur.signedRoot.rootId) {
                RefreshRecord(now, true, PassStatus.READY, "up to date")
            } else {
                moveTo(st, pass, now)
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e // a cancelled/replaced job is not a failed update
        } catch (e: Exception) {
            val reason = (e as? RefreshRejected)?.reason ?: e.javaClass.simpleName
            Log.i(TAG, "refresh kept previous root: $reason")
            val until = current?.signedRoot?.expiresAt
            val msg = if (until != null) "Couldn't update; your pass still works until ${formatTime(until)}"
            else "Couldn't update. Check your connection and try again."
            RefreshRecord(now, false, if (current != null) PassStatus.READY else PassStatus.WAITING, msg)
        }
        repo.saveRefresh(record)
        return record
    }

    private suspend fun moveTo(st: IssuerState, pass: Pass, now: Long): RefreshRecord {
        val roots = data.signedRoots(issuer, st.latestRootId).distinct()
        if (roots.isEmpty()) throw RefreshRejected("signed-root-not-on-arkiv-yet")
        if (roots.size > 1) throw RefreshRejected("conflicting-signed-roots")
        val sr = roots[0]
        // SPEC §8 tagging: the rootId must be the chain's, not whatever an Arkiv endpoint returns. Otherwise an issuer
        // could sign the same root under a different rootId per phone and recognise each phone by it at scans.
        if (sr.rootId != st.latestRootId) throw RefreshRejected("rootId-not-latest-on-chain")
        if (!sr.issuer.equals(issuer, true) || !sr.registry.equals(registry, true) || sr.chainId != chainId) {
            throw RefreshRejected("wrong-issuer-or-chain")
        }
        if (!sr.root.equals(st.latestRoot, true)) throw RefreshRejected("root-not-latest-on-chain")
        if (sr.issuedAt != st.latestPostedAt) throw RefreshRejected("issuedAt-not-postedAt")
        if (sr.expiresAt != sr.issuedAt + ROOT_TTL) throw RefreshRejected("bad-ttl")
        if (!protocol.recoverRootSigner(sr).equals(issuer, true)) throw RefreshRejected("bad-signature")

        val rb = protocol.rebuildAndPath(sr.leafCount, sr.revSeq, data.leafBatches(issuer), data.revocations(issuer), pass.leafIndex)
        if (BigInteger(rb.root) != BigInteger(sr.root.removePrefix("0x"), 16)) throw RefreshRejected("rebuilt-root-mismatch")

        if (!rb.covered) {
            Log.i(TAG, "refresh: pass not in a root yet")
            return RefreshRecord(now, true, PassStatus.WAITING, "Pass activates at the next update")
        }
        if (rb.leaf == "0" || rb.path == null) {
            repo.dropRoot()
            Log.i(TAG, "refresh: pass revoked")
            return RefreshRecord(now, true, PassStatus.REVOKED, "Pass revoked")
        }
        if (rb.leaf != pass.leaf) {
            Log.i(TAG, "refresh: pass mismatch")
            return RefreshRecord(now, true, PassStatus.MISMATCH, "Pass mismatch, contact the issuer")
        }
        repo.saveRootState(RootState(sr, rb.path))
        Log.i(TAG, "refresh ok")
        return RefreshRecord(now, true, PassStatus.READY, "Updated")
    }

    companion object {
        private const val TAG = "Unlink"
        const val ROOT_TTL = 36L * 3600 // SPEC §9

        fun formatTime(unix: Long): String = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(unix * 1000))
    }
}
