package xyz.unlink.scanner

import android.content.Context

/** Editable endpoints and checkpoint config (SPEC §8: RPC and Arkiv endpoints are configurable). */
class Settings(context: Context) {
    private val p = context.applicationContext.getSharedPreferences("scanner-settings", Context.MODE_PRIVATE)

    var sepoliaRpc: String
        get() = p.getString("sepoliaRpc", null) ?: BuildConfig.SEPOLIA_RPC_DEFAULT
        set(v) = p.edit().putString("sepoliaRpc", v.trim()).apply()
    var sepoliaRpcBackup: String
        get() = p.getString("sepoliaRpcBackup", null) ?: BuildConfig.SEPOLIA_RPC_BACKUP_DEFAULT
        set(v) = p.edit().putString("sepoliaRpcBackup", v.trim()).apply()
    var arkivRpc: String
        get() = p.getString("arkivRpc", null) ?: BuildConfig.ARKIV_RPC_DEFAULT
        set(v) = p.edit().putString("arkivRpc", v.trim()).apply()
    var issuerUrl: String
        get() = p.getString("issuerUrl", null) ?: BuildConfig.ISSUER_URL_DEFAULT
        set(v) = p.edit().putString("issuerUrl", v.trim().trimEnd('/')).apply()

    /** Show decode and verify time on the result screen (also toggled by a long-press on the status chip). */
    var showLatency: Boolean
        get() = p.getBoolean("showLatency", false)
        set(v) = p.edit().putBoolean("showLatency", v).apply()

    /** Minimum fare class this checkpoint accepts (0 2nd, 1 1st, 2 AC), or null for any. */
    var requiredClass: Int?
        get() = p.getInt("requiredClass", -1).takeIf { it >= 0 }
        set(v) = p.edit().putInt("requiredClass", v ?: -1).apply()
}
