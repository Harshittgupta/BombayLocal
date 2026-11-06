package xyz.unlink.passenger

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import xyz.unlink.passenger.prover.ProtocolEngine
import xyz.unlink.passenger.prover.WebAppEngine

/** The phone's Poseidon and LeanIMT must match fixtures/vectors.json exactly (invariant 5). */
@RunWith(AndroidJUnit4::class)
class ProtocolEngineTest {
    // Keeps the test process in the foreground: some OEM builds (vivo) freeze a process with no visible activity
    // about 10 s after start, which would stall long on-device proofs.
    @get:org.junit.Rule val foreground = androidx.test.ext.junit.rules.ActivityScenarioRule(xyz.unlink.passenger.ui.QrActivity::class.java)


    @Test
    fun poseidonAndTreeMatchFixtures() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val vectors = JSONObject(context.assets.open("vectors.json").bufferedReader().use { it.readText() })
        val protocol = ProtocolEngine(WebAppEngine.shared(context))

        val poseidon = vectors.getJSONObject("poseidon")
        for (n in 1..3) {
            val cases = poseidon.getJSONArray("poseidon$n")
            for (i in 0 until cases.length()) {
                val v = cases.getJSONObject(i)
                val inputs = v.getJSONArray("in").toStringList()
                assertEquals("poseidon$n case $i", v.getString("out"), protocol.poseidon(n, inputs))
            }
        }

        val case0 = vectors.getJSONArray("cases").getJSONObject(0)
        val leaves = case0.getJSONArray("leaves").toStringList()
        val proof = protocol.merkleProof(leaves, case0.getInt("leafIndex"))
        assertEquals("root", case0.getString("root"), proof.root)
        assertEquals("leaf", case0.getString("leaf"), proof.leaf)
        assertEquals("depth", case0.getInt("depth"), proof.depth)
        assertEquals("pathIndex", case0.getInt("pathIndex"), proof.pathIndex)
        assertEquals("siblings", case0.getJSONArray("siblings").toStringList(), proof.siblings)
    }

    private fun JSONArray.toStringList(): List<String> = (0 until length()).map { getString(it) }
}
