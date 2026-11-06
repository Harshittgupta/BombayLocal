package xyz.unlink.passenger.ui

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Fired by the epoch-boundary alarm that [PassNotification] arms: re-posts the notification with the new epoch's code
 * (which re-arms the next alarm). Not exported; only our own PendingIntent reaches it.
 */
class EpochTickReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        PassNotification.update(context) { pending.finish() }
    }
}
