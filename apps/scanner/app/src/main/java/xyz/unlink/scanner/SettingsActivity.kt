package xyz.unlink.scanner

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.TypedValue
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import xyz.unlink.scanner.key.ScannerKey
import xyz.unlink.scanner.store.RoomVerifierStore
import xyz.unlink.scanner.store.ScannerDb
import xyz.unlink.scanner.sync.SyncWorker
import java.util.concurrent.Executors

/** Endpoints (primary + backup Sepolia RPC, Arkiv RPC, issuer URL), checkpoint class, scanner identity, Sync now. */
class SettingsActivity : Activity() {
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private lateinit var status: TextView

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val s = Settings(this)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(36), dp(20), dp(20)) }
        fun label(t: String) = col.addView(TextView(this).apply { text = t; textSize = 14f; setPadding(0, dp(14), 0, dp(2)) })
        fun field(t: String, v: String): EditText = EditText(this).apply {
            setText(v)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            isSingleLine = true
        }.also { label(t); col.addView(it) }

        col.addView(TextView(this).apply { text = "Scanner settings"; textSize = 22f })
        val sepolia = field("Sepolia RPC URL", s.sepoliaRpc)
        val backup = field("Backup Sepolia RPC URL (another provider)", s.sepoliaRpcBackup)
        val arkiv = field("Arkiv RPC URL", s.arkivRpc)
        val issuer = field("Issuer URL (scan-batch upload only)", s.issuerUrl)

        label("This checkpoint accepts")
        val classes = listOf("Any class" to null, "2nd class and above" to 0, "1st class and above" to 1, "AC only" to 2)
        val group = RadioGroup(this)
        classes.forEachIndexed { i, (name, v) ->
            group.addView(RadioButton(this).apply { id = 100 + i; text = name; isChecked = v == s.requiredClass })
        }
        col.addView(group)

        col.addView(Button(this).apply {
            text = "Save"
            setOnClickListener {
                s.sepoliaRpc = sepolia.text.toString(); s.sepoliaRpcBackup = backup.text.toString()
                s.arkivRpc = arkiv.text.toString(); s.issuerUrl = issuer.text.toString()
                s.requiredClass = classes.getOrNull(group.checkedRadioButtonId - 100)?.second
                status.text = "Saved."
            }
        })
        col.addView(Button(this).apply {
            text = "Sync now"
            setOnClickListener {
                status.text = "Syncing…"
                io.execute {
                    val report = runCatching { SyncWorker.syncNow(applicationContext).toString() }.getOrElse { "sync failed (${it.javaClass.simpleName})" }
                    main.post { status.text = report; refresh() }
                }
            }
        })

        label("Scanner address (add it to the issuer's scanner list)")
        val address = TextView(this).apply { setTextIsSelectable(true); textSize = 13f }
        col.addView(address)
        status = TextView(this).apply { textSize = 13f; setPadding(0, dp(16), 0, 0) }
        col.addView(status)
        info = TextView(this).apply { textSize = 13f; setPadding(0, dp(12), 0, 0) }
        col.addView(info)

        setContentView(ScrollView(this).apply { addView(col) })
        io.execute {
            val a = ScannerKey(applicationContext).address
            main.post { address.text = a }
        }
        refresh()
    }

    private lateinit var info: TextView

    private fun refresh() {
        io.execute {
            val dao = ScannerDb.get(applicationContext).dao()
            val lines = dao.issuers().map {
                "Issuer ${it.address.take(10)}…  ${if (it.active) "active" else "SUSPENDED"}, floor ${it.floor}, " +
                    "latest root ${it.latestRootId} (Arkiv ${it.arkivRootId}), this scanner ${if (it.listed) "listed" else "not listed"}"
            }
            val text = buildString {
                appendLine(ResultText.syncAge(dao.get(RoomVerifierStore.K_LAST_SYNC)?.toLongOrNull() ?: 0, System.currentTimeMillis()))
                dao.get(RoomVerifierStore.K_SYNC_STATUS)?.let { appendLine("Last sync: $it") }
                appendLine("Verification key ${dao.get(RoomVerifierStore.K_VK_HASH)?.take(16) ?: "missing"}…")
                appendLine("Scans waiting to upload: ${dao.pendingEpochs().sumOf { dao.pending(it).size }}")
                lines.forEach { appendLine(it) }
            }
            main.post { info.text = text }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        io.shutdown()
    }
}
