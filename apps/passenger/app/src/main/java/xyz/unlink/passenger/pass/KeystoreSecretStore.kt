package xyz.unlink.passenger.pass

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.math.BigInteger
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The pass secret (SPEC §3.1: 248 random bits, generated on the phone, never leaves it), wrapped by an AES-256-GCM
 * key that lives in Android Keystore and never leaves it either.
 *
 * The key is created with setUnlockedDeviceRequired(true): the secret can be unwrapped only while the phone is
 * unlocked. So proofs are generated only after an unlock, and a thief holding a locked phone gets only the proofs
 * already cached (≤ PREPROVE epochs; SPEC §6, §8). The secret is never logged, never sent, never backed up
 * (allowBackup=false + data_extraction_rules exclude everything).
 */
class KeystoreSecretStore(context: Context, fileName: String = "secret.bin", private val alias: String = ALIAS) {

    private val file = AtomicFile(File(context.filesDir, fileName))

    fun hasSecret(): Boolean = file.baseFile.exists()

    /** Creates a fresh secret, wraps and stores it (replacing any old one), and returns it as a decimal string. */
    fun createSecret(): String {
        val bytes = ByteArray(SECRET_BYTES)
        var secret: BigInteger
        do {
            SecureRandom().nextBytes(bytes)
            secret = BigInteger(1, bytes)
        } while (secret.signum() == 0)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, newKey())
        val sealed = cipher.iv + cipher.doFinal(bytes)
        bytes.fill(0)
        val out = file.startWrite()
        try {
            out.write(sealed)
            file.finishWrite(out)
        } catch (e: Exception) {
            file.failWrite(out)
            throw e
        }
        return secret.toString()
    }

    /** Unwraps the secret. Throws while the phone is locked (UnlockedDeviceRequired) or if none exists. */
    fun readSecret(): String {
        val sealed = file.readFully()
        val key = keyStore().getKey(alias, null) as? SecretKey ?: throw IllegalStateException("no pass key")
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, sealed, 0, IV_BYTES))
        val bytes = cipher.doFinal(sealed, IV_BYTES, sealed.size - IV_BYTES)
        val secret = BigInteger(1, bytes).toString()
        bytes.fill(0)
        return secret
    }

    fun clear() {
        file.delete()
        keyStore().deleteEntry(alias)
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun newKey(): SecretKey {
        keyStore().deleteEntry(alias)
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        gen.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUnlockedDeviceRequired(true)
                .build(),
        )
        return gen.generateKey()
    }

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val ALIAS = "unlink-pass-secret"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_BYTES = 12
        const val SECRET_BYTES = 31 // 248 bits (SPEC §3.1)
    }
}
