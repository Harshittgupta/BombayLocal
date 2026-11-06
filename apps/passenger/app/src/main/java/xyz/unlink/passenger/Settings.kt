package xyz.unlink.passenger

import android.content.Context

/** The three endpoints a user may change (SPEC §8: RPC and Arkiv endpoints are configurable). Nothing else is config. */
class Settings(context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    var arkivRpcUrl: String
        get() = prefs.getString(KEY_ARKIV, null) ?: BuildConfig.ARKIV_RPC_DEFAULT
        set(v) = prefs.edit().putString(KEY_ARKIV, v.trim().ifEmpty { BuildConfig.ARKIV_RPC_DEFAULT }).apply()

    var sepoliaRpcUrl: String
        get() = prefs.getString(KEY_SEPOLIA, null) ?: BuildConfig.SEPOLIA_RPC_DEFAULT
        set(v) = prefs.edit().putString(KEY_SEPOLIA, v.trim().ifEmpty { BuildConfig.SEPOLIA_RPC_DEFAULT }).apply()

    var issuerUrl: String
        get() = prefs.getString(KEY_ISSUER, null) ?: BuildConfig.ISSUER_URL_DEFAULT
        set(v) = prefs.edit().putString(KEY_ISSUER, v.trim().ifEmpty { BuildConfig.ISSUER_URL_DEFAULT }).apply()

    private companion object {
        const val KEY_ARKIV = "arkivRpcUrl"
        const val KEY_SEPOLIA = "sepoliaRpcUrl"
        const val KEY_ISSUER = "issuerUrl"
    }
}
