package xyz.unlink.scanner.verifier

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigInteger

class Base45Bn254Test {

    /** RFC 9285 §4.3 / §4.4 examples. */
    @Test
    fun base45RfcVectors() {
        for ((plain, enc) in listOf("AB" to "BB8", "Hello!!" to "%69 VD92EX0", "base-45" to "UJCLQE7W581", "ietf!" to "QED8WEX0")) {
            assertEquals(enc, Base45.encode(plain.toByteArray()))
            assertArrayEquals(plain.toByteArray(), Base45.decode(enc))
        }
        assertNull("bad char", Base45.decode("GGw"))
        assertNull("length 1 mod 3", Base45.decode("BB8B"))
        assertNull("triple > 65535", Base45.decode("GGW"))
        assertNull("pair > 255", Base45.decode("::"))
        assertNull("non-ASCII", Base45.decode("BBé"))
        assertArrayEquals(ByteArray(0), Base45.decode(""))
    }

    private val g2x = Bn254.Fp2(
        BigInteger("10857046999023057135944570762232829481370756359578518086990519993285655852781"),
        BigInteger("11559732032986387107991004021392285783925812861821192530917403151452391805634"),
    )
    private val g2y = Bn254.Fp2(
        BigInteger("8495653923123431417604973247489272438418190587263600148770280649306958101930"),
        BigInteger("4082367875863433681332203403145435568316851327593401208105741076214120093531"),
    )

    @Test
    fun twistCoefficientMatchesNoble() {
        assertEquals(BigInteger("19485874751759354771024239261021720505790618469301721065564631296452457478373"), Bn254.B_TWIST.c0)
        assertEquals(BigInteger("266929791119991161246907387137283842545076965332900288569378510910307636690"), Bn254.B_TWIST.c1)
    }

    @Test
    fun generatorsAreValid() {
        assertTrue(Bn254.isOnG1(BigInteger.ONE, BigInteger.TWO))
        assertTrue("G2 generator on twist", Bn254.isOnTwist(g2x, g2y))
        assertTrue("G2 generator in subgroup", Bn254.isInG2(g2x, g2y))
    }

    @Test
    fun invalidPointsAreRejected() {
        assertFalse(Bn254.isOnG1(BigInteger.ONE, BigInteger.valueOf(3)))
        assertFalse("infinity", Bn254.isOnG1(BigInteger.ZERO, BigInteger.ZERO))
        assertFalse("x >= p", Bn254.isOnG1(BigInteger.ONE + Params.FIELD_P, BigInteger.TWO))
        assertFalse("G2 off twist", Bn254.isInG2(g2x, g2y + Bn254.Fp2.ONE))
        assertFalse("G2 infinity", Bn254.isInG2(Bn254.Fp2.ZERO, Bn254.Fp2.ZERO))
        // The fixture's on-twist point outside the prime-order subgroup.
        val bad = QrFixture.named("malformed-b-not-in-subgroup")
        val b = Base45.decode(bad.qrText)!!
        fun w(o: Int) = BigInteger(1, b.copyOfRange(o, o + 32))
        val x = Bn254.Fp2(w(134), w(102))
        val y = Bn254.Fp2(w(198), w(166))
        assertTrue("on the twist", Bn254.isOnTwist(x, y))
        assertFalse("not in the subgroup", Bn254.isInG2(x, y))
    }

    @Test
    fun realProofPointsAreValid() {
        val q = QrPayload.parse(QrFixture.named("valid").qrText)!!
        assertTrue(Bn254.isOnG1(q.proof.ax, q.proof.ay))
        assertTrue(Bn254.isInG2(q.proof.bx, q.proof.by))
        assertTrue(Bn254.isOnG1(q.proof.cx, q.proof.cy))
    }
}
