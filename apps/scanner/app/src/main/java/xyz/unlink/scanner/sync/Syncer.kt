package xyz.unlink.scanner.sync

import org.json.JSONArray
import org.json.JSONObject
import xyz.unlink.scanner.key.ScannerKey
import xyz.unlink.scanner.store.IssuerRow
import xyz.unlink.scanner.store.KvRow
import xyz.unlink.scanner.store.RoomVerifierStore
import xyz.unlink.scanner.store.ScannerDao
import xyz.unlink.scanner.verifier.Hex
import xyz.unlink.scanner.verifier.Params
import xyz.unlink.scanner.verifier.ScanBatch
import java.math.BigInteger
import java.security.MessageDigest

/** What one sync did, in state names and counts only (safe to log and show). */
data class SyncReport(val registry: String, val clock: String, val vk: String, val scannerList: String, val upload: String) {
    override fun toString() = "registry=$registry clock=$clock vk=$vk scannerList=$scannerList upload=$upload"
}

/** Where sync reads and writes. */
class SyncConfig(
    val chainId: Long,
    val registry: String,
    val authority: String,
    val vkHash: String,
    /** Two independent Sepolia providers; both must agree on the Registry state (see [Syncer]). */
    val sepoliaRpcs: List<String>,
    val arkivRpc: String,
    val issuerUrl: String?,
)

/** JSON-RPC transport for one endpoint URL (real HTTP by default; tests can wrap it). */
typealias RpcFactory = (url: String) -> (method: String, params: JSONArray) -> Any

/**
 * SPEC §5 sync, online only, never called by verify:
 * 1. Registry: issuers() + issuerState(i) from TWO independent providers, read at the same block. They must return
 *    identical state, or nothing is applied (one lying or compromised RPC can't add an issuer, suspend one or raise
 *    a floor). The merge never lowers a floor or latestRootId and never re-activates a suspended issuer.
 *    lastSync advances only when this step succeeds.
 * 2. Clock (SPEC §8 "scanners resync time at each online sync"): the agreed newest block timestamp gives a clock
 *    offset, applied to every verify when the device clock is off by more than [CLOCK_TOLERANCE_MS].
 * 3. Arkiv: the authority's VerifyKey (accepted only if sha256 == the APK's pinned VK_HASH), each issuer's latest
 *    ScannerList and SignedRoot rootId (status).
 * 4. Upload scan batches of CLOSED epochs only (< e − 1, so no finer-than-epoch timing), sorted and signed.
 *    Queue entries older than [PENDING_MAX_EPOCHS] are dropped unsent (privacy over audit completeness).
 * 5. Purge the nullifier log (epochId < e − 1).
 */
class Syncer(
    private val dao: ScannerDao,
    private val key: ScannerKey,
    private val cfg: SyncConfig,
    private val rpcFor: RpcFactory = { url -> { m, p -> Http.jsonRpc(url, m, p) } },
) {

    fun sync(deviceNowMs: Long): SyncReport {
        dao.put(KvRow(RoomVerifierStore.K_SYNC_ATTEMPT, deviceNowMs.toString()))
        var clock = "unchanged"
        val registry = runCatching {
            val (n, blockTs) = syncRegistry()
            val offset = clockOffset(deviceNowMs, blockTs)
            dao.put(KvRow(RoomVerifierStore.K_CLOCK_OFFSET, offset.toString()))
            dao.put(KvRow(RoomVerifierStore.K_LAST_SYNC, (deviceNowMs + offset).toString()))
            clock = if (offset == 0L) "ok" else "corrected ${offset / 1000} s"
            n
        }.fold({ "ok ($it issuers)" }, { "failed (${it.javaClass.simpleName}: ${it.message})" })
        val nowMs = deviceNowMs + (dao.get(RoomVerifierStore.K_CLOCK_OFFSET)?.toLongOrNull() ?: 0L)
        val vk = runCatching { syncVk() }.getOrElse { "failed (${it.javaClass.simpleName})" }
        val list = runCatching { syncArkivStatus() }.getOrElse { "failed (${it.javaClass.simpleName})" }
        val upload = runCatching { uploadBatches(nowMs) }.getOrElse { "failed (${it.javaClass.simpleName})" }
        dao.purgeBefore(epochOf(nowMs) - 1)
        val report = SyncReport(registry, clock, vk, list, upload)
        dao.put(KvRow(RoomVerifierStore.K_SYNC_STATUS, report.toString()))
        return report
    }

    /** Returns (issuer count, agreed newest block timestamp in seconds). */
    private fun syncRegistry(): Pair<Int, Long> {
        val urls = cfg.sepoliaRpcs.map { it.trim() }.filter { it.isNotBlank() }.distinct()
        if (urls.size < 2) throw SyncException("two different Sepolia RPC providers are required")
        val clients = urls.map { RegistryClient(cfg.registry, cfg.chainId, rpcFor(it)) }
        clients.forEach { it.checkChain() }
        val heads = clients.map { it.blockNumber() }
        val block = heads.min() - CONFIRMATIONS
        val views = clients.map { c -> c.issuers(block).map { c.issuerState(it, block) } }
        if (views.distinct().size != 1) throw SyncException("RPC providers disagree on the Registry; nothing applied")
        val states = views.first()
        // Newest timestamp either provider reports (blocks trail real time by up to one slot; see CLOCK_TOLERANCE_MS).
        val blockTs = clients.zip(heads).maxOf { (c, h) -> c.blockTimestamp(h) }
        for (s in states) dao.upsertIssuer(merge(dao.issuer(s.address), s))
        return states.size to blockTs
    }

    private fun syncVk(): String {
        val bytes = ArkivReader(rpcFor(cfg.arkivRpc)).verifyKey(cfg.authority, cfg.vkHash) ?: return "not on Arkiv (kept local)"
        if (sha256(bytes) != cfg.vkHash) return "rejected (hash mismatch)"
        dao.put(KvRow(RoomVerifierStore.K_VK, String(bytes, Charsets.UTF_8)))
        dao.put(KvRow(RoomVerifierStore.K_VK_HASH, cfg.vkHash))
        return "ok"
    }

    private fun syncArkivStatus(): String {
        val arkiv = ArkivReader(rpcFor(cfg.arkivRpc))
        val me = key.address
        var listed = 0
        for (row in dao.issuers()) {
            val keys = arkiv.scannerList(row.address)
            val inList = keys?.contains(me) == true
            if (inList) listed++
            val rootId = arkiv.latestSignedRootId(row.address) ?: row.arkivRootId
            dao.upsertIssuer(row.copy(listed = inList, arkivRootId = maxOf(row.arkivRootId, rootId)))
        }
        return if (listed > 0) "listed" else "not listed"
    }

    private fun uploadBatches(nowMs: Long): String {
        val e = epochOf(nowMs)
        dao.dropPendingBefore(e - PENDING_MAX_EPOCHS)
        val url = cfg.issuerUrl?.takeIf { it.isNotBlank() } ?: return "no issuer URL"
        val closed = dao.pendingEpochs().filter { it < e - 1 }
        var sent = 0
        for (epoch in closed) {
            val raw = dao.pending(epoch)
            val sorted = ScanBatch.sorted(raw.map(::BigInteger))
            val scanner = key.address
            val digest = ScanBatch.digest(Hex.bytes(scanner, 20), epoch, sorted)
            val body = JSONObject()
                .put("scannerPubKey", scanner)
                .put("epochId", epoch)
                .put("nullifiers", JSONArray(sorted.map { it.toString() }))
                .put("sig", Hex.of(key.signDigest(digest)))
            val (code, _) = Http.postJson("$url/scan-batches", body.toString())
            if (code !in 200..299) return if (sent == 0) "rejected (HTTP $code)" else "partial ($sent sent, then HTTP $code)"
            dao.dequeue(epoch, raw)
            sent++
        }
        val waiting = dao.pendingEpochs().size
        return "ok ($sent batches" + (if (waiting > 0) ", $waiting epoch(s) still open" else "") + ")"
    }

    companion object {
        /** Read the Registry this many blocks below the lower head, so both providers have the block. */
        const val CONFIRMATIONS = 2L

        /** Upload-queue lifetime: 24 h of epochs. Older entries are dropped unsent. */
        const val PENDING_MAX_EPOCHS = 24 * 3600 / Params.EPOCH

        /** Block timestamps trail real time by up to ~12 s plus RPC latency; only a larger error is corrected. */
        const val CLOCK_TOLERANCE_MS = 60_000L

        fun epochOf(ms: Long) = Math.floorDiv(Math.floorDiv(ms, 1000L), Params.EPOCH)

        /** Offset to add to the device clock, or 0 when it is within tolerance of the chain's time. */
        fun clockOffset(deviceNowMs: Long, blockTimestampSec: Long): Long {
            val d = blockTimestampSec * 1000 - deviceNowMs
            return if (Math.abs(d) <= CLOCK_TOLERANCE_MS) 0L else d
        }

        /** Rollback-safe merge of an agreed Registry read into the stored row. */
        fun merge(old: IssuerRow?, s: ChainIssuer): IssuerRow = IssuerRow(
            address = s.address,
            active = s.active && (old?.active ?: true),
            floor = maxOf(old?.floor ?: 0, s.floor),
            latestRootId = maxOf(old?.latestRootId ?: 0, s.latestRootId),
            arkivRootId = old?.arkivRootId ?: 0,
            listed = old?.listed ?: false,
        )

        fun sha256(b: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }
    }
}
