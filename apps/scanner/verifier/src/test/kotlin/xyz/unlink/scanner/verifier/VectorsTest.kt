package xyz.unlink.scanner.verifier

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigInteger

/** Invariant 5: the Kotlin scanner reproduces the shared JS vectors (fixtures/sign-vectors.json, qr-vectors.json). */
class VectorsTest {
    private val sign = JSONObject(Repo.file("fixtures/sign-vectors.json").readText())
    private val qr = JSONObject(Repo.file("fixtures/qr-vectors.json").readText())

    private fun digestOf(f: JSONObject) = SignedRoot.digest(
        f.getLong("chainId"), Hex.bytes(f.getString("registry"), 20), Hex.bytes(f.getString("issuer"), 20),
        f.getLong("rootId"), Hex.bytes(f.getString("root"), 32), f.getLong("issuedAt"), f.getLong("expiresAt"),
    )

    @Test
    fun signedRootDigestAndSigner() {
        val sr = sign.getJSONObject("signedRoot")
        val f = sr.getJSONObject("fields")
        val pre = SignedRoot.preimage(
            f.getLong("chainId"), Hex.bytes(f.getString("registry"), 20), Hex.bytes(f.getString("issuer"), 20),
            f.getLong("rootId"), Hex.bytes(f.getString("root"), 32), f.getLong("issuedAt"), f.getLong("expiresAt"),
        )
        assertEquals(sr.getInt("preimageBytes"), pre.size)
        val d = digestOf(f)
        assertEquals(sr.getString("digest"), Hex.of(d))
        assertEquals(sr.getString("signer").lowercase(), SignedRoot.recoverSigner(d, Hex.bytes(sr.getString("eip191Signature"), 65)))
    }

    @Test
    fun scanBatchSignerRecovers() {
        val sb = sign.getJSONObject("scanBatch")
        assertEquals(sb.getString("signer").lowercase(), SignedRoot.recoverSigner(Hex.bytes(sb.getString("digest"), 32), Hex.bytes(sb.getString("eip191Signature"), 65)))
    }

    @Test
    fun malleableAndBadVSignaturesAreRefused() {
        val sr = sign.getJSONObject("signedRoot")
        val d = digestOf(sr.getJSONObject("fields"))
        val sig = Hex.bytes(sr.getString("eip191Signature"), 65)
        val n = BigInteger("fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141", 16)
        val high = sig.copyOf()
        System.arraycopy(SignedRoot.uint(n - BigInteger(1, sig.copyOfRange(32, 64)), 32), 0, high, 32, 32)
        high[64] = if (sig[64].toInt() == 27) 28 else 27
        assertNull("high s", SignedRoot.recoverSigner(d, high))
        for (v in listOf(0, 1, 26, 29, 35)) assertNull("v=$v", SignedRoot.recoverSigner(d, sig.copyOf().also { it[64] = v.toByte() }))
    }

    @Test
    fun qrVectorDecodesToTheSameFields() {
        val text = qr.getString("base45")
        assertEquals(641, text.length)
        val bytes = Base45.decode(text)!!
        assertEquals(qr.getString("payloadHex"), Hex.of(bytes))
        assertEquals(text, Base45.encode(bytes))
        val q = QrPayload.parse(text)!!
        val f = qr.getJSONObject("signedRoot").getJSONObject("fields")
        assertEquals(qr.getInt("zoneClass"), q.zoneClass)
        assertEquals(qr.getLong("epochId"), q.epochId)
        assertEquals(BigInteger(qr.getString("nullifier")), q.nullifier)
        assertEquals(f.getString("issuer").lowercase(), q.issuerHex)
        assertEquals(f.getLong("rootId"), q.rootId)
        assertArrayEquals(Hex.bytes(f.getString("root"), 32), q.root)
        assertEquals(f.getLong("issuedAt"), q.issuedAt)
        assertEquals(f.getLong("expiresAt"), q.expiresAt)
        val pb = qr.getJSONObject("proof").getJSONArray("pi_b")
        assertEquals(BigInteger(pb.getJSONArray(0).getString(0)), q.proof.bx.c0) // EIP-197 x.c1, x.c0 decoded back to c0, c1
        assertEquals(BigInteger(pb.getJSONArray(0).getString(1)), q.proof.bx.c1)
        val ps = qr.getJSONArray("publicSignals").let { a -> (0 until a.length()).map { BigInteger(a.getString(it)) } }
        assertEquals(ps, listOf(q.rootValue, q.nullifier, BigInteger.valueOf(q.epochId), BigInteger.valueOf(Params.dayOfEpoch(q.epochId)), BigInteger.valueOf(q.zoneClass.toLong())))
        assertEquals(qr.getJSONObject("signedRoot").getString("signer").lowercase(), SignedRoot.recoverSigner(digestOf(f), q.signature))
        assertTrue("real proof verifies", NodeSnarkjsEngine.verify(Repo.vkJson, q.proof, ps))
    }

    @Test
    fun dayOfEpochMatchesFixtureTimeVectors() {
        val v = JSONObject(Repo.file("fixtures/vectors.json").readText())
        val c = v.getJSONArray("cases").getJSONObject(0)
        val signals = c.getJSONArray("publicSignals")
        assertEquals(signals.getString(3).toLong(), Params.dayOfEpoch(signals.getString(2).toLong()))
    }
}
