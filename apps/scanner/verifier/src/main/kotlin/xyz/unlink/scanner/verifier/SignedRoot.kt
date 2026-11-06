package xyz.unlink.scanner.verifier

import org.web3j.crypto.Hash
import org.web3j.crypto.Keys
import org.web3j.crypto.Sign
import java.math.BigInteger
import java.security.SignatureException

/** SPEC §3.3 signed-root digest and EIP-191 signer recovery (web3j crypto only). */
object SignedRoot {
    private val TAG = "UNLINK-ROOT-v1".toByteArray(Charsets.US_ASCII) // 14 bytes, no length prefix
    private val SECP256K1_N = BigInteger("fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141", 16)
    private val HALF_N = SECP256K1_N.shiftRight(1)

    /** Big-endian unsigned `v` in exactly `len` bytes (no BigInteger.toByteArray sign byte). */
    fun uint(v: BigInteger, len: Int): ByteArray {
        require(v.signum() >= 0 && v.bitLength() <= len * 8) { "value does not fit in $len bytes" }
        val raw = v.toByteArray()
        val out = ByteArray(len)
        val n = minOf(raw.size, len)
        System.arraycopy(raw, raw.size - n, out, len - n, n)
        return out
    }

    fun uint(v: Long, len: Int): ByteArray =
        uint(if (v >= 0) BigInteger.valueOf(v) else BigInteger.valueOf(v).add(BigInteger.ONE.shiftLeft(64)), len)

    /** The exact 134-byte preimage. chainId and registry come from the scanner's own config, never from the QR. */
    fun preimage(
        chainId: Long, registry: ByteArray, issuer: ByteArray, rootId: Long, root: ByteArray, issuedAt: Long, expiresAt: Long,
    ): ByteArray {
        require(registry.size == 20 && issuer.size == 20 && root.size == 32)
        return TAG + uint(chainId, 32) + registry + issuer + uint(rootId, 8) + root + uint(issuedAt, 4) + uint(expiresAt, 4)
    }

    fun digest(
        chainId: Long, registry: ByteArray, issuer: ByteArray, rootId: Long, root: ByteArray, issuedAt: Long, expiresAt: Long,
    ): ByteArray = Hash.sha3(preimage(chainId, registry, issuer, rootId, root, issuedAt, expiresAt))

    /**
     * The lowercase 0x address that produced an EIP-191 personal_sign over the 32-byte `digest` ("\n32" prefix), or
     * null. Enforces SPEC §3.3: 65 bytes, v ∈ {27, 28}, 1 ≤ r < n, 1 ≤ s ≤ n/2 (low s).
     */
    fun recoverSigner(digest: ByteArray, sig: ByteArray): String? {
        if (digest.size != 32 || sig.size != 65) return null
        val v = sig[64].toInt() and 0xFF
        if (v != 27 && v != 28) return null
        val r = BigInteger(1, sig.copyOfRange(0, 32))
        val s = BigInteger(1, sig.copyOfRange(32, 64))
        if (r.signum() == 0 || r >= SECP256K1_N || s.signum() == 0 || s > HALF_N) return null
        return try {
            val pub = Sign.signedPrefixedMessageToKey(digest, Sign.SignatureData(v.toByte(), sig.copyOfRange(0, 32), sig.copyOfRange(32, 64)))
            "0x" + Keys.getAddress(pub).lowercase()
        } catch (e: SignatureException) {
            null
        } catch (e: IllegalArgumentException) {
            null
        }
    }
}
