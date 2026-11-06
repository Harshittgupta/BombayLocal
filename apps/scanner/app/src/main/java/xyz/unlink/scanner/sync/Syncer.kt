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
data class SyncReport(val registry: String, val vk: String, val scannerList: String, val upload: String) {
    override fun toString() = "registry=$registry vk=$vk scannerList=$scannerList upload=$upload"
}

/** Where sync reads and writes. `rpc*` default to real HTTP; tests may pass the same functions. */
class SyncConfig(
    val chainId: Long,
    val registry: String,
    val authority: String,
    val vkHash: String,
    val sepoliaRpcs: List<String>,
    val arkivRpc: String,
    val issuerUrl: String?,
)

/**
 * SPEC §5 sync, online only, never called by verify:
 * 1. Registry: issuers() + issuerState(i). The floor never moves down, a suspension is sticky (the Registry never
 *    re-adds a suspended issuer) and latestRootId never moves down, so a lying or stale RPC can't roll state back.
 *    lastSync advances only when this step succeeds.
 * 2. Arkiv: the authority's VerifyKey (accepted only if sha256 == the APK's pinned VK_HASH), each issuer's latest
 *    ScannerList and SignedRoot rootId (status).
 * 3. Upload pending scan batches (sorted nullifiers, signed with the scanner key) to the issuer.
 * 4. Purge the nullifier log (epochId < e − 1).
 */
class Syncer(private val dao: ScannerDao, private val key: ScannerKey, private val cfg: SyncConfig) {

    fun sync(nowMs: Long): SyncReport {
        dao.put(KvRow(RoomVerifierStore.K_SYNC_ATTEMPT, nowMs.toString()))
        val registry = runCatching { syncRegistry(nowMs) }.fold({ "ok ($it issuers)" }, { "failed (${it.javaClass.simpleName}: ${it.message})" })
        val vk = runCatching { syncVk() }.getOrElse { "failed (${it.javaClass.simpleName})" }
        val list = runCatching { syncArkivStatus() }.getOrElse { "failed (${it.javaClass.simpleName})" }
        val upload = runCatching { uploadBatches() }.getOrElse { "failed (${it.javaClass.simpleName})" }
        dao.purgeBefore(Math.floorDiv(nowMs / 1000, Params.EPOCH) - 1)
        val report = SyncReport(registry, vk, list, upload)
        dao.put(KvRow(RoomVerifierStore.K_SYNC_STATUS, report.toString()))
        return report
    }

    private fun syncRegistry(nowMs: Long): Int {
        var last: Exception? = null
        for (url in cfg.sepoliaRpcs.filter { it.isNotBlank() }) {
            try {
                val client = RegistryClient(cfg.registry, cfg.chainId) { m, p -> Http.jsonRpc(url, m, p) }
                client.checkChain()
                val states = client.issuers().map { client.issuerState(it) }
                for (s in states) dao.upsertIssuer(merge(dao.issuer(s.address), s))
                dao.put(KvRow(RoomVerifierStore.K_LAST_SYNC, nowMs.toString()))
                return states.size
            } catch (e: Exception) {
                last = e // try the backup provider
            }
        }
        throw last ?: SyncException("no Sepolia RPC configured")
    }

    private fun syncVk(): String {
        val bytes = ArkivReader { m, p -> Http.jsonRpc(cfg.arkivRpc, m, p) }.verifyKey(cfg.authority, cfg.vkHash) ?: return "not on Arkiv (kept local)"
        if (sha256(bytes) != cfg.vkHash) return "rejected (hash mismatch)"
        dao.put(KvRow(RoomVerifierStore.K_VK, String(bytes, Charsets.UTF_8)))
        dao.put(KvRow(RoomVerifierStore.K_VK_HASH, cfg.vkHash))
        return "ok"
    }

    private fun syncArkivStatus(): String {
        val arkiv = ArkivReader { m, p -> Http.jsonRpc(cfg.arkivRpc, m, p) }
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

    private fun uploadBatches(): String {
        val url = cfg.issuerUrl?.takeIf { it.isNotBlank() } ?: return "no issuer URL"
        var sent = 0
        for (epoch in dao.pendingEpochs()) {
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
        return "ok ($sent batches)"
    }

    companion object {
        /** Rollback-safe merge of a fresh Registry read into the stored row. */
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
