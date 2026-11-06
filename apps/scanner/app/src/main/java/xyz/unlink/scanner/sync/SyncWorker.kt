package xyz.unlink.scanner.sync

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import xyz.unlink.scanner.BuildConfig
import xyz.unlink.scanner.Settings
import xyz.unlink.scanner.key.ScannerKey
import xyz.unlink.scanner.store.ScannerDb
import java.util.concurrent.TimeUnit

/** Background sync (WorkManager, network required). Never touched by the scan path. */
class SyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val report = syncNow(applicationContext)
        Log.i(TAG, "sync $report") // state names and counts only
        return if (report.registry.startsWith("ok")) Result.success() else Result.retry()
    }

    companion object {
        private const val TAG = "UnlinkScanner"
        private const val PERIODIC = "scanner-sync"
        private const val NOW = "scanner-sync-now"

        fun config(context: Context): SyncConfig {
            val s = Settings(context)
            return SyncConfig(
                chainId = BuildConfig.CHAIN_ID,
                registry = BuildConfig.REGISTRY,
                authority = BuildConfig.AUTHORITY,
                vkHash = BuildConfig.VK_HASH,
                sepoliaRpcs = listOf(s.sepoliaRpc, s.sepoliaRpcBackup),
                arkivRpc = s.arkivRpc,
                issuerUrl = s.issuerUrl,
            )
        }

        /** Blocking; call off the main thread. */
        fun syncNow(context: Context): SyncReport =
            Syncer(ScannerDb.get(context).dao(), ScannerKey(context), config(context)).sync(System.currentTimeMillis())

        private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun schedule(context: Context) {
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC, ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS).setConstraints(online).build(),
            )
        }

        fun requestNow(context: Context) {
            WorkManager.getInstance(context).enqueueUniqueWork(
                NOW, ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(online).build(),
            )
        }
    }
}
