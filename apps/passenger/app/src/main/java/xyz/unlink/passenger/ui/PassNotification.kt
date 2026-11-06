package xyz.unlink.passenger.ui

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.os.Build
import xyz.unlink.passenger.pass.PassRepository
import xyz.unlink.passenger.pass.PreProver
import java.util.concurrent.Executors

/**
 * The ongoing pass notification. Expanded, it carries the current epoch's QR code itself, so the pass can be scanned
 * straight from the notification shade or the lock screen without unlocking. Collapsed, it reads "Tap to show your
 * pass" and opens [QrActivity]. Like QrActivity it only shows a code the pre-prover already cached for the CURRENT
 * epoch (SPEC §6): never a past epoch's code (a scanner rejects it) and it never proves or touches the secret.
 *
 * Privacy cost (README, threat model): a code on the lock screen can be shown by whoever holds the phone, and an app
 * the user has granted notification access can read the picture. The code changes every epoch and carries no
 * identifier, but it is a valid pass for that epoch.
 *
 * The channel is IMPORTANCE_DEFAULT with no sound or vibration. A LOW-importance channel is filed under "Silent", and
 * several OEM builds (vivo, tested) hide silent notifications on the lock screen. [PassTileService] is the second route.
 */
object PassNotification {
    private const val CHANNEL = "pass-lockscreen"
    private const val OLD_CHANNEL = "pass"
    private const val ID = 1

    /** Rendering and posting run here, off the main thread. */
    private val worker = Executors.newSingleThreadExecutor()

    /** One rendered picture, keyed by epoch and the code text (a re-post in the same epoch never re-encodes). */
    private var cached: Triple<Long, String, Bitmap>? = null

    fun createChannel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.deleteNotificationChannel(OLD_CHANNEL) // M7 first build: LOW importance ("Silent")
        val ch = NotificationChannel(CHANNEL, "Pass on lock screen", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Shows your pass code without unlocking"
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
        }
        nm.createNotificationChannel(ch)
    }

    /** Posts (or removes) the notification for the current epoch, then arms the next epoch-boundary re-post. */
    fun update(context: Context, done: (() -> Unit)? = null) {
        val app = context.applicationContext
        worker.execute {
            try {
                post(app)
            } catch (_: Exception) {
                // A failed post leaves the previous notification; the next trigger (screen on, alarm) tries again.
            } finally {
                done?.invoke()
            }
        }
    }

    private fun post(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        val repo = PassRepository(context)
        val pass = repo.pass()
        if (pass == null || repo.rootState() == null) {
            nm.cancel(ID)
            cancelTick(context)
            main.removeCallbacksAndMessages(BOUNDARY)
            return
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val nowSec = System.currentTimeMillis() / 1000
        val boundaryMs = (nowSec / PreProver.EPOCH + 1) * PreProver.EPOCH * 1000
        val epoch = nowSec / PreProver.EPOCH
        val qr = repo.anyCachedProof(epoch)
        val picture = qr?.let { picture(epoch, it) }
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, QrActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val validUntil = "Valid until ${QrActivity.formatDay(pass.validUntilDay)}"

        fun build(): Notification.Builder {
            val b = Notification.Builder(context, CHANNEL)
                .setSmallIcon(xyz.unlink.passenger.R.drawable.ic_stat_pass)
                .setContentTitle("BombayLocal Pass")
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(open)
                .setCategory(Notification.CATEGORY_STATUS)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
            if (picture != null) {
                b.setContentText("Tap to show your pass")
                // Never leave a stale code showing: if no re-post arrives (process killed, alarm deferred), the system
                // removes the notification 110 s after the epoch boundary, while scanners still accept the old epoch
                // (SPEC §5 step 2, SKEW = 120 s). The next screen-on, unlock or alarm posts it again with the new code.
                b.setTimeoutAfter(boundaryMs - System.currentTimeMillis() + 110_000)
                b.style = Notification.BigPictureStyle()
                    .bigPicture(picture)
                    .bigLargeIcon(null as Bitmap?)
                    .setBigContentTitle("BombayLocal Pass")
                    .setSummaryText(validUntil)
            } else {
                b.setContentText("Open BombayLocal Pass to prepare your pass")
            }
            return b
        }
        // The same picture on the public version, or it vanishes where the lock screen shows only public versions.
        nm.notify(ID, build().setPublicVersion(build().build()).build())
        scheduleTick(context, boundaryMs)
        // While our process is alive and the CPU awake (screen on, when someone can actually look), also re-post right
        // at the boundary: the system may defer the inexact alarm by several minutes. Uptime-based, so it simply
        // pauses in deep sleep, where the alarm and the next screen-on take over.
        main.removeCallbacksAndMessages(BOUNDARY)
        main.postAtTime({ update(context) }, BOUNDARY, android.os.SystemClock.uptimeMillis() + (boundaryMs - System.currentTimeMillis()) + 500)
    }

    private val main = android.os.Handler(android.os.Looper.getMainLooper())
    private val BOUNDARY = Any()

    /**
     * The QR on a 2:1 white canvas. Android's expanded big-picture view is wider than tall and centre-crops a square
     * image, which would cut off the top and bottom of the code; a 2:1 picture fits without cropping. The code keeps a
     * 4-module quiet zone, and the white canvas adds more on both sides.
     */
    private fun picture(epoch: Long, text: String): Bitmap {
        cached?.let { (e, t, b) -> if (e == epoch && t == text) return b }
        val qr = QrActivity.renderQr(text, size = 512, margin = 4)
        val out = Bitmap.createBitmap(1024, 512, Bitmap.Config.ARGB_8888)
        Canvas(out).apply {
            drawColor(Color.WHITE)
            drawBitmap(qr, ((1024 - qr.width) / 2).toFloat(), ((512 - qr.height) / 2).toFloat(), null)
        }
        cached = Triple(epoch, text, out)
        return out
    }

    private fun tickIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
        context, 0, Intent(context, EpochTickReceiver::class.java),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    /**
     * Re-post at the next epoch boundary. Exact when the user has allowed exact alarms, otherwise inexact: we don't ask.
     * Inexact drift is fine here, so please don't "fix" it with a permission flow: a scanner accepts the adjacent epoch
     * within 120 s of the boundary (SPEC §5 step 2), and every screen-on re-posts before anyone looks at the code.
     * RTC (not RTC_WAKEUP): nobody can see the notification while the screen is off, so there is no reason to wake it.
     */
    private fun scheduleTick(context: Context, atMs: Long) {
        val am = context.getSystemService(AlarmManager::class.java)
        val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC, atMs, tickIntent(context))
        else am.setAndAllowWhileIdle(AlarmManager.RTC, atMs, tickIntent(context))
    }

    private fun cancelTick(context: Context) {
        context.getSystemService(AlarmManager::class.java).cancel(tickIntent(context))
    }
}
