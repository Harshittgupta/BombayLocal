package xyz.unlink.scanner.verifier

import java.math.BigInteger

/** A Groth16 proof as carried in the QR: A, C in G1 (x, y); B in G2 with Fp2 coordinates (c0 + c1·u). */
class Groth16Proof(
    val ax: BigInteger, val ay: BigInteger,
    val bx: Bn254.Fp2, val by: Bn254.Fp2,
    val cx: BigInteger, val cy: BigInteger,
) {
    /** snarkjs JSON (pi_b[i] = [c0, c1]; projective z = 1). Numbers only, so plain string building is safe. */
    fun toSnarkjsJson(): String =
        """{"pi_a":["$ax","$ay","1"],"pi_b":[["${bx.c0}","${bx.c1}"],["${by.c0}","${by.c1}"],["1","0"]],""" +
            """"pi_c":["$cx","$cy","1"],"protocol":"groth16","curve":"bn128"}"""
}

/** The SPEC §3.4 QR payload (427 bytes). Integers are unsigned at their exact width. */
class QrPayload(
    val zoneClass: Int,
    val epochId: Long,
    val nullifier: BigInteger,
    val proof: Groth16Proof,
    /** 20 bytes. */
    val issuer: ByteArray,
    /** uint64, held in a Long; compare with java.lang.Long.compareUnsigned. */
    val rootId: Long,
    /** 32 bytes. */
    val root: ByteArray,
    val issuedAt: Long,
    val expiresAt: Long,
    /** 65 bytes r ‖ s ‖ v. */
    val signature: ByteArray,
) {
    val issuerHex: String get() = Hex.of(issuer)
    val rootValue: BigInteger get() = BigInteger(1, root)

    companion object {
        /**
         * SPEC §5 step 1. Returns null (MALFORMED) unless: valid Base45, 427 bytes, version 1, zoneClass ≤ 2, root
         * nonzero and < r, nullifier < r, every coordinate < p, A and C on G1, B on G2 and in its prime-order subgroup.
         */
        fun parse(qrText: String): QrPayload? {
            val b = Base45.decode(qrText) ?: return null
            if (b.size != Params.QR_BYTES) return null
            if ((b[0].toInt() and 0xFF) != Params.QR_VERSION) return null
            val zoneClass = b[1].toInt() and 0xFF
            if (zoneClass > 2) return null
            var o = 2
            fun take(n: Int): ByteArray = b.copyOfRange(o, o + n).also { o += n }
            fun uint(n: Int): BigInteger = BigInteger(1, take(n))
            val epochId = uint(4).toLong()
            val nullifier = uint(32)
            val ax = uint(32); val ay = uint(32)
            val bx1 = uint(32); val bx0 = uint(32); val by1 = uint(32); val by0 = uint(32) // EIP-197 order
            val cx = uint(32); val cy = uint(32)
            val issuer = take(20)
            val rootId = uint(8).toLong() // two's-complement view of the uint64; compared unsigned
            val root = take(32)
            val issuedAt = uint(4).toLong()
            val expiresAt = uint(4).toLong()
            val signature = take(65)

            val rootV = BigInteger(1, root)
            if (rootV.signum() == 0 || rootV >= Params.FIELD_R) return null
            if (nullifier >= Params.FIELD_R) return null
            val bx = Bn254.Fp2(bx0, bx1)
            val by = Bn254.Fp2(by0, by1)
            // isOnG1 / isOnTwist also reject any coordinate >= p.
            if (!Bn254.isOnG1(ax, ay) || !Bn254.isOnG1(cx, cy)) return null
            if (!Bn254.isInG2(bx, by)) return null
            return QrPayload(
                zoneClass, epochId, nullifier, Groth16Proof(ax, ay, bx, by, cx, cy),
                issuer, rootId, root, issuedAt, expiresAt, signature,
            )
        }
    }
}

object Hex {
    fun of(b: ByteArray): String {
        val sb = StringBuilder(2 + b.size * 2).append("0x")
        for (x in b) sb.append(Character.forDigit((x.toInt() shr 4) and 0xF, 16)).append(Character.forDigit(x.toInt() and 0xF, 16))
        return sb.toString()
    }

    /** Exactly `len` bytes from 0x-hex, or IllegalArgumentException. */
    fun bytes(hex: String, len: Int): ByteArray {
        val h = hex.removePrefix("0x").removePrefix("0X")
        require(h.length == len * 2) { "expected $len bytes" }
        return ByteArray(len) { i ->
            val hi = Character.digit(h[2 * i], 16)
            val lo = Character.digit(h[2 * i + 1], 16)
            require(hi >= 0 && lo >= 0) { "bad hex" }
            ((hi shl 4) or lo).toByte()
        }
    }
}
