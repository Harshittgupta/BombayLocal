package xyz.unlink.passenger

import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import xyz.unlink.passenger.ui.PassNotification
import xyz.unlink.passenger.work.EpochScheduler

/**
 * App start: the lock-screen notification channel, the hourly/daily jobs, and an unlock listener. Each unlock tops up
 * the proof cache (SPEC §6: pre-prove after the device is unlocked) and, when online, first tries a refresh.
 */
class UnlinkApp : Application() {

    private val unlockReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_USER_PRESENT) EpochScheduler.refreshNow(context)
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
