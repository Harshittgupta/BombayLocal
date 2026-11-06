package xyz.unlink.scanner.key

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.web3j.crypto.ECKeyPair
import org.web3j.crypto.Keys
import org.web3j.crypto.Sign
import java.io.File
import java.math.BigInteger
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The scanner's secp256k1 signing key for scan batches (SPEC §5). Android Keystore cannot hold secp256k1, so the
 * 32-byte private key is AES-256-GCM-wrapped by a Keystore key and only the wrapped bytes touch disk. The Keystore
 * key needs no unlock, so a background sync can sign. The private key is never logged or sent; only the address is
 * shown (the operator adds it to the issuer's ScannerList).
 */
class ScannerKey(context: Context, fileName: String = "scanner-key.bin", private val alias: String = "unlink-scanner-wrap") {
    private val file = File(context.filesDir, fileName)

    private fun wrapKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(alias, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    /**
     * Load or create the key under ONE process-wide lock (review fix): SyncWorker and the Settings screen each build
     * their own ScannerKey, and two concurrent first-time creations would otherwise race on the file and the
     * Keystore alias. The result is cached per file, so only the first call touches disk or the Keystore.
     */
    private fun keyPair(): ECKeyPair = synchronized(LOCK) {
        cache[file.path] ?: loadOrCreate().also { cache[file.path] = it }
    }

    private fun loadOrCreate(): ECKeyPair {
        if (file.exists()) {
            val blob = file.readBytes()
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, wrapKey(), GCMParameterSpec(128, blob.copyOfRange(0, 12)))
            return ECKeyPair.create(BigInteger(1, c.doFinal(blob.copyOfRange(12, blob.size))))
        }
        val rnd = SecureRandom()
        var d: BigInteger
        do {
            val b = ByteArray(32).also(rnd::nextBytes)
            d = BigInteger(1, b)
        } while (d.signum() == 0 || d >= Sign.CURVE_PARAMS.n)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, wrapKey())
        val raw = d.toByteArray().let { if (it.size > 32) it.copyOfRange(it.size - 32, it.size) else ByteArray(32 - it.size) + it }
        val tmp = File(file.path + ".tmp")
        tmp.writeBytes(c.iv + c.doFinal(raw))
        if (!tmp.renameTo(file)) error("could not store the scanner key")
        return ECKeyPair.create(d)
    }

    /** Lowercase 0x address of this scanner. */
    val address: String get() = "0x" + Keys.getAddress(keyPair().publicKey).lowercase()

    /** EIP-191 personal_sign over a 32-byte digest ("\n32" form): 65 bytes r ‖ s ‖ v (v ∈ {27, 28}, low s). */
    fun signDigest(digest: ByteArray): ByteArray {
        require(digest.size == 32)
        val s = Sign.signPrefixedMessage(digest, keyPair())
        return s.r + s.s + s.v
    }

    fun clear() = synchronized(LOCK) {
        cache.remove(file.path)
        file.delete()
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(alias)
    }

    companion object {
        private val LOCK = Any()
        private val cache = HashMap<String, ECKeyPair>()
    }
}
