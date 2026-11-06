package xyz.unlink.scanner.verifier

import java.math.BigInteger

/**
 * The BN254 (alt_bn128) point checks SPEC §5 step 1 needs before Groth16 runs: A and C on G1, and B on the G2 twist
 * AND in its prime-order subgroup. G1 has cofactor 1, so on-curve is enough there; G2 does not, so B is checked with
 * [r]B = O. The point at infinity, (0, 0) in EIP-197 encoding, is rejected: an honest proof never contains it.
 */
object Bn254 {
    private val P = Params.FIELD_P
    private val R = Params.FIELD_R
    private val THREE = BigInteger.valueOf(3)

    /** Fp2 = Fp[u] / (u² + 1); element c0 + c1·u. */
    data class Fp2(val c0: BigInteger, val c1: BigInteger) {
        operator fun plus(o: Fp2) = Fp2(c0.add(o.c0).mod(P), c1.add(o.c1).mod(P))
        operator fun minus(o: Fp2) = Fp2(c0.subtract(o.c0).mod(P), c1.subtract(o.c1).mod(P))
        operator fun times(o: Fp2) = Fp2(
            c0.multiply(o.c0).subtract(c1.multiply(o.c1)).mod(P),
            c0.multiply(o.c1).add(c1.multiply(o.c0)).mod(P),
        )
        fun times(k: Int) = Fp2(c0.multiply(BigInteger.valueOf(k.toLong())).mod(P), c1.multiply(BigInteger.valueOf(k.toLong())).mod(P))
        fun sq() = this * this
        fun isZero() = c0.signum() == 0 && c1.signum() == 0

        companion object {
            val ZERO = Fp2(BigInteger.ZERO, BigInteger.ZERO)
            val ONE = Fp2(BigInteger.ONE, BigInteger.ZERO)
        }
    }

    /** Twist coefficient b' = 3 / (9 + u) = 3·(9 − u) / 82. */
    val B_TWIST: Fp2 = run {
        val inv82 = BigInteger.valueOf(82).modInverse(P)
        Fp2(BigInteger.valueOf(27).multiply(inv82).mod(P), BigInteger.valueOf(-3).multiply(inv82).mod(P))
    }

    fun inField(x: BigInteger) = x.signum() >= 0 && x < P

    /** y² = x³ + 3 over Fp, coordinates canonical, not the point at infinity. */
    fun isOnG1(x: BigInteger, y: BigInteger): Boolean {
        if (!inField(x) || !inField(y)) return false
        if (x.signum() == 0 && y.signum() == 0) return false
        return y.multiply(y).mod(P) == x.multiply(x).multiply(x).add(THREE).mod(P)
    }

    fun isOnTwist(x: Fp2, y: Fp2): Boolean {
        if (!inField(x.c0) || !inField(x.c1) || !inField(y.c0) || !inField(y.c1)) return false
        if (x.isZero() && y.isZero()) return false
        return y.sq() == x.sq() * x + B_TWIST
    }

    /** B is a valid G2 element: on the twist and [r]B is the point at infinity. */
    fun isInG2(x: Fp2, y: Fp2): Boolean = isOnTwist(x, y) && mulIsInfinity(x, y, R)

    /** Jacobian (X, Y, Z) over Fp2; Z = 0 is the point at infinity. */
    private class Jac(val x: Fp2, val y: Fp2, val z: Fp2)

    private fun double(p: Jac): Jac {
        if (p.z.isZero()) return p
        // dbl-2009-l (a = 0)
        val a = p.x.sq()
        val b = p.y.sq()
        val c = b.sq()
        val d = ((p.x + b).sq() - a - c).times(2)
        val e = a.times(3)
        val f = e.sq()
        val x3 = f - d.times(2)
        val y3 = e * (d - x3) - c.times(8)
        val z3 = (p.y * p.z).times(2)
        return Jac(x3, y3, z3)
    }

    /** p + q, q affine (madd-2007-bl). */
    private fun addAffine(p: Jac, qx: Fp2, qy: Fp2): Jac {
        if (p.z.isZero()) return Jac(qx, qy, Fp2.ONE)
        val z1z1 = p.z.sq()
        val u2 = qx * z1z1
        val s2 = qy * p.z * z1z1
        val h = u2 - p.x
        val rr = (s2 - p.y).times(2)
        if (h.isZero()) return if (rr.isZero()) double(p) else Jac(Fp2.ONE, Fp2.ONE, Fp2.ZERO)
        val hh = h.sq()
        val i = hh.times(4)
        val j = h * i
        val v = p.x * i
        val x3 = rr.sq() - j - v.times(2)
        val y3 = rr * (v - x3) - (p.y * j).times(2)
        val z3 = (p.z + h).sq() - z1z1 - hh
        return Jac(x3, y3, z3)
    }

    private fun mulIsInfinity(x: Fp2, y: Fp2, k: BigInteger): Boolean {
        var acc = Jac(Fp2.ONE, Fp2.ONE, Fp2.ZERO)
        for (bit in k.bitLength() - 1 downTo 0) {
            acc = double(acc)
            if (k.testBit(bit)) acc = addAffine(acc, x, y)
        }
        return acc.z.isZero()
    }
}
