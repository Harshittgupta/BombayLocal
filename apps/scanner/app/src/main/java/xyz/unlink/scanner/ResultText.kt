package xyz.unlink.scanner

import android.graphics.Color
import xyz.unlink.scanner.verifier.Reason
import xyz.unlink.scanner.verifier.Status

/** Plain words for the TC: no crypto terms on screen. */
object ResultText {
    fun title(reason: Reason): String = when (reason) {
        Reason.OK -> "Valid pass"
        Reason.SEEN_BEFORE -> "Shown twice — check"
        Reason.ROOT_NEAR_EXPIRY -> "Valid — pass needs an update soon"
        Reason.SCANNER_UNSYNCED -> "Valid — scanner not synced for 24 h"
        Reason.DUPLICATE -> "Already used — shown 3+ times"
        Reason.MALFORMED -> "Not an Unlink pass"
        Reason.WRONG_EPOCH -> "Old code — ask to reopen the pass"
        Reason.SCANNER_STALE -> "Scanner out of date — sync now"
        Reason.ISSUER_INACTIVE -> "Issuer not recognised"
        Reason.BAD_SIGNATURE -> "Invalid pass"
        Reason.BELOW_FLOOR -> "Pass withdrawn — needs an update"
        Reason.BAD_ROOT_TTL -> "Invalid pass"
        Reason.ROOT_EXPIRED -> "Expired — pass needs an update"
        Reason.BAD_PROOF -> "Invalid pass"
        Reason.WRONG_CLASS -> "Wrong class for this checkpoint"
        Reason.VERIFIER_ERROR -> "Couldn't check — scan again"
    }

    fun color(status: Status): Int = when (status) {
        Status.GREEN -> Color.rgb(0x1B, 0x8A, 0x3C)
        Status.AMBER -> Color.rgb(0xE0, 0x8E, 0x00)
        Status.RED -> Color.rgb(0xC6, 0x28, 0x28)
    }

    /** "Synced 2 h ago" for the status chip. */
    fun syncAge(lastSyncMs: Long, nowMs: Long): String {
        if (lastSyncMs <= 0) return "Never synced — sync before scanning"
        val min = (nowMs - lastSyncMs) / 60_000
        return when {
            min < 0 -> "Clock changed since sync — sync now"
            min < 1 -> "Synced just now"
            min < 60 -> "Synced $min min ago"
            min < 48 * 60 -> "Synced ${min / 60} h ago"
            else -> "Not synced for ${min / 60 / 24} days — sync now"
        }
    }
}
