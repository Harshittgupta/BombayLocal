package xyz.unlink.passenger.ui

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import xyz.unlink.passenger.pass.PassRepository

/**
 * A persistent notification that opens [QrActivity] over the lock screen. It says only "Tap to show your pass": no
 * pass details, so it is safe to show even when the user hides notification contents on the lock screen (its public
 * version carries the same text).
 *
 * The channel is IMPORTANCE_DEFAULT with no sound or vibration. A LOW-importance channel is filed under "Silent", and
 * several OEM builds (vivo, tested) hide silent notifications on the lock screen. [PassTileService] is the second route.
 */
object PassNotification {
    private const val CHANNEL = "pass-lockscreen"
    private const val OLD_CHANNEL = "pass"
    private const val ID = 1

    fun createChannel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.deleteNotificationChannel(OLD_CHANNEL) // M7 first build: LOW importance ("Silent")
        val ch = NotificationChannel(CHANNEL, "Pass on lock screen", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Lets you show your pass without unlocking"
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
        }
        nm.createNotificationChannel(ch)
    }

    private fun build(context: Context, open: PendingIntent): Notification.Builder =
        Notification.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setContentTitle("Unlink Pass")
            .setContentText("Tap to show your pass")
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(open)
            .setCategory(Notification.CATEGORY_STATUS)

    /** Posts the notification while a pass with a verified root exists; removes it otherwise. */
    fun update(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        val repo = PassRepository(context)
        if (repo.pass() == null || repo.rootState() == null) {
            nm.cancel(ID)
            return
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, QrActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = build(context, open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPublicVersion(build(context, open).build())
            .build()
        nm.notify(ID, n)
    }
}
