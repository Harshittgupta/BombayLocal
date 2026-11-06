package xyz.unlink.passenger.work

import android.app.KeyguardManager
import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import xyz.unlink.passenger.Settings
import xyz.unlink.passenger.pass.KeystoreSecretStore
import xyz.unlink.passenger.pass.NetworkPublicData
import xyz.unlink.passenger.pass.PassRepository
import xyz.unlink.passenger.pass.PreProver
import xyz.unlink.passenger.pass.PreproveStats
import xyz.unlink.passenger.pass.RefreshRecord
import xyz.unlink.passenger.pass.Refresher
import xyz.unlink.passenger.prover.ProtocolEngine
import xyz.unlink.passenger.prover.WebAppEngine
import xyz.unlink.passenger.ui.PassNotification
import java.util.concurrent.TimeUnit

/** One refresh or pre-prove at a time, whoever triggers it (UI, unlock, WorkManager). */
object Jobs {
    private val mutex = Mutex()

    suspend fun refresh(context: Context): RefreshRecord = mutex.withLock {
        val s = Settings(context)
        val protocol = ProtocolEngine(WebAppEngine.shared(context))
        Refresher(PassRepository(context), protocol, NetworkPublicData(s.sepoliaRpcUrl, s.arkivRpcUrl)).refresh()
    }

    suspend fun preprove(context: Context): PreproveStats = mutex.withLock {
        val protocol = ProtocolEngine(WebAppEngine.shared(context))
        PreProver(PassRepository(context), KeystoreSecretStore(context), protocol).run()
            .also { PassNotification.update(context) }
    }

    fun isLocked(context: Context): Boolean = context.getSystemService(KeyguardManager::class.java).isDeviceLocked
}

/** Refresh from public data (SPEC §3.1), then top up the proof cache. Daily + on app open + Refresh button. */
class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        Jobs.refresh(applicationContext)
        EpochScheduler.preproveNow(applicationContext)
        return Result.success()
    }
}

/** SPEC §6: pre-prove only while unlocked (the Keystore key enforces it; we skip early to avoid the error). */
class PreproveWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        if (Jobs.isLocked(applicationContext)) {
            Log.i("Unlink", "preprove skipped: locked")
            return Result.success()
        }
        return try {
            Jobs.preprove(applicationContext)
            Result.success()
        } catch (e: Exception) {
            Log.i("Unlink", "preprove failed: ${e.javaClass.simpleName}")
            Result.retry()
        }
    }
}

/**
 * When proofs get made: on app start, on every unlock while the process is alive (ACTION_USER_PRESENT, registered in
 * UnlinkApp; Android no longer delivers it to manifest receivers), and hourly as a backstop. PREPROVE = 12 epochs
 * (2 h), so the hourly job always leaves ≥ 1 h of proofs cached for the lock screen.
 */
object EpochScheduler {
    private const val PERIODIC_PREPROVE = "preprove-periodic"
    private const val PERIODIC_REFRESH = "refresh-daily"
    private const val NOW_PREPROVE = "preprove-now"
    private const val NOW_REFRESH = "refresh-now"

    fun schedulePeriodic(context: Context) {
        val wm = WorkManager.getInstance(context)
        wm.enqueueUniquePeriodicWork(
            PERIODIC_PREPROVE, ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<PreproveWorker>(1, TimeUnit.HOURS).build(),
        )
        wm.enqueueUniquePeriodicWork(
            PERIODIC_REFRESH, ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<RefreshWorker>(1, TimeUnit.DAYS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build(),
        )
    }

    /** Refresh first when online (SPEC §6: try to move to the newest root before a pre-prove batch). */
    fun refreshNow(context: Context) {
        WorkManager.getInstance(context).enqueueUniqueWork(
            NOW_REFRESH, ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<RefreshWorker>().build(),
        )
    }

    fun preproveNow(context: Context) {
        WorkManager.getInstance(context).enqueueUniqueWork(
            NOW_PREPROVE, ExistingWorkPolicy.KEEP, OneTimeWorkRequestBuilder<PreproveWorker>().build(),
        )
    }
}
