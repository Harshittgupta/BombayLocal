package xyz.unlink.passenger.pass

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
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
 * Each sealed secret has its own Keystore key, created with setUnlockedDeviceRequired(true): the secret can be
 * unwrapped only while the phone is unlocked. So proofs are generated only after an unlock, and a thief holding a
 * locked phone gets only the proofs already cached (≤ PREPROVE epochs; SPEC §6, §8). The secret is never logged, never
 * sent, never backed up (allowBackup=false + data_extraction_rules exclude everything).
 *
 * Buying a new pass is two-phase: [createPending] seals a fresh secret beside the active one, and [commitPending]
 * swaps it in only after the issuer accepted the purchase. A failed purchase ([discardPending]) leaves the current
 * pass fully usable.
 *
 * File format: "UNK1" ‖ aliasLen (1 B) ‖ alias (UTF-8) ‖ IV (12 B) ‖ AES-GCM ciphertext. Files without the magic
 * (first M7 build) used the fixed default alias with the IV at offset 0.
 */
class KeystoreSecretStore(context: Context, fileName: String = "secret.bin", private val alias: String = ALIAS) {

    private val active = File(context.filesDir, fileName)
    private val pending = File(context.filesDir, "$fileName.pending")

    fun hasSecret(): Boolean = active.exists()

    /** Seals a fresh secret under a new Keystore key WITHOUT touching the active one; returns it (decimal). */
    fun createPending(): String {
        discardPending()
        val bytes = ByteArray(SECRET_BYTES)
        var secret: BigInteger
        do {
            SecureRandom().nextBytes(bytes)
            secret = BigInteger(1, bytes)
        } while (secret.signum() == 0)
        val keyAlias = "$alias-${System.nanoTime()}"
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, newKey(keyAlias))
        val name = keyAlias.toByteArray()
        val sealed = MAGIC + byteArrayOf(name.size.toByte()) + name + cipher.iv + cipher.doFinal(bytes)
        bytes.fill(0)
        val tmp = File(pending.path + ".tmp")
        tmp.writeBytes(sealed)
        if (!tmp.renameTo(pending)) throw IllegalStateException("could not stage the new pass key")
        return secret.toString()
    }

    /** Makes the staged secret the active one (atomic rename), then deletes the old key. */
    fun commitPending() {
        val oldAlias = if (active.exists()) parse(active.readBytes()).first else null
        val newAlias = parse(pending.readBytes()).first
        if (!pending.renameTo(active)) throw IllegalStateException("could not activate the new pass key")
        if (oldAlias != null && oldAlias != newAlias) keyStore().deleteEntry(oldAlias)
    }

    /** Throws away a staged secret and its key (e.g. the purchase failed). */
    fun discardPending() {
        if (!pending.exists()) return
        runCatching { keyStore().deleteEntry(parse(pending.readBytes()).first) }
        pending.delete()
    }

    /** Creates and activates a fresh secret in one step. */
    fun createSecret(): String = createPending().also { commitPending() }

    /** Unwraps the active secret. Throws while the phone is locked (UnlockedDeviceRequired) or if none exists. */
    fun readSecret(): String {
        val (keyAlias, ivAndCt) = parse(active.readBytes())
        val key = keyStore().getKey(keyAlias, null) as? SecretKey ?: throw IllegalStateException("no pass key")
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, ivAndCt, 0, IV_BYTES))
        val bytes = cipher.doFinal(ivAndCt, IV_BYTES, ivAndCt.size - IV_BYTES)
        val secret = BigInteger(1, bytes).toString()
        bytes.fill(0)
        return secret
    }

    fun clear() {
        discardPending()
        if (active.exists()) {
            runCatching { keyStore().deleteEntry(parse(active.readBytes()).first) }
            active.delete()
        }
    }

    /** (key alias, IV ‖ ciphertext) */
    private fun parse(file: ByteArray): Pair<String, ByteArray> {
        if (file.size > 5 && file.copyOfRange(0, 4).contentEquals(MAGIC)) {
            val n = file[4].toInt() and 0xff
            return String(file, 5, n) to file.copyOfRange(5 + n, file.size)
        }
        return alias to file // first M7 build: fixed alias, IV at offset 0
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun newKey(keyAlias: String): SecretKey {
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        gen.init(
            KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
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
        private val MAGIC = "UNK1".toByteArray()
        const val SECRET_BYTES = 31 // 248 bits (SPEC §3.1)
    }
}
