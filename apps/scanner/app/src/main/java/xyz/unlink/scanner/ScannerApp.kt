package xyz.unlink.scanner

import android.app.Application
import android.content.Context
import xyz.unlink.scanner.store.KvRow
import xyz.unlink.scanner.store.RoomVerifierStore
import xyz.unlink.scanner.store.ScannerDao
import xyz.unlink.scanner.store.ScannerDb
import xyz.unlink.scanner.sync.Syncer
import xyz.unlink.scanner.sync.SyncWorker
import xyz.unlink.scanner.verifier.Hex
import xyz.unlink.scanner.verifier.Params
import java.util.concurrent.Executors

/** App start: seed the bundled vk (hash-pinned), purge the old nullifier log, schedule the hourly sync. */
class ScannerApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val ctx = this
        Executors.newSingleThreadExecutor().execute {
            val dao = ScannerDb.get(ctx).dao()
            seedVk(ctx, dao)
            dao.purgeBefore(Math.floorDiv(System.currentTimeMillis() / 1000, Params.EPOCH) - 1)
        }
        SyncWorker.schedule(this)
    }

    companion object {
        /** The APK's own verification_key.json, used until (and unless) sync fetches the same hash from Arkiv. */
        fun seedVk(context: Context, dao: ScannerDao) {
            if (dao.get(RoomVerifierStore.K_VK) != null) return
            val bytes = context.assets.open("verification_key.json").use { it.readBytes() }
            check(Syncer.sha256(bytes) == BuildConfig.VK_HASH) { "bundled vk does not match VK_HASH" }
            dao.put(KvRow(RoomVerifierStore.K_VK, String(bytes, Charsets.UTF_8)))
            dao.put(KvRow(RoomVerifierStore.K_VK_HASH, BuildConfig.VK_HASH))
        }

        fun store(context: Context): RoomVerifierStore {
            val settings = Settings(context)
            return RoomVerifierStore(ScannerDb.get(context).dao(), BuildConfig.CHAIN_ID, Hex.bytes(BuildConfig.REGISTRY, 20)) { settings.requiredClass }
        }
    }
}
