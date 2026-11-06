package xyz.unlink.passenger

import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import xyz.unlink.passenger.pass.PassRepository
import xyz.unlink.passenger.ui.PassNotification
import xyz.unlink.passenger.work.EpochScheduler

/**
 * App start: the lock-screen notification channel, the hourly/daily jobs, and an unlock listener. Each unlock tops up
 * the proof cache (SPEC §6: pre-prove after the device is unlocked) and, when online, first tries a refresh.
 */
class UnlinkApp : Application() {

    private val unlockReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != Intent.ACTION_USER_PRESENT) return
            // SPEC §3.1 / §8: refresh on unlock at most once per ROOT_INTERVAL (limits what RPC providers see);
            // otherwise just top up the proof cache.
            val last = PassRepository(context).lastRefresh()?.at ?: 0L
            if (System.currentTimeMillis() / 1000 - last >= BuildConfig.ROOT_INTERVAL) EpochScheduler.refreshNow(context)
            else EpochScheduler.preproveNow(context)
        }
    }

    override fun onCreate() {
        super.onCreate()
        PassNotification.createChannel(this)
        EpochScheduler.schedulePeriodic(this)
        ContextCompat.registerReceiver(
            this, unlockReceiver, IntentFilter(Intent.ACTION_USER_PRESENT), ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }
}
