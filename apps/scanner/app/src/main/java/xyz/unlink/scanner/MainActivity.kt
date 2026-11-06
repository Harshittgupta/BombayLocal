package xyz.unlink.scanner

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

/** Launcher screen. M8a ships the offline verifier and its engine; the camera and result screens come in M8b. */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(
            TextView(this).apply {
                textSize = 18f
                setPadding(48, 96, 48, 48)
                text = "Unlink Scanner\n\nOffline verifier installed.\nVerification key ${BuildConfig.VK_HASH.take(16)}…"
            },
        )
    }
}
