package xyz.unlink.passenger.pass

import android.util.Log
import xyz.unlink.passenger.net.IssuerClient
import xyz.unlink.passenger.prover.ProtocolEngine

/**
 * SPEC §3.1 purchase. The phone makes a fresh secret, keeps it in Keystore, sends ONLY idCommitment = Poseidon1(secret)
 * and the product name. The issuer decides validUntilDay and zoneClass from what was paid for (the payment itself is
 * simulated, README / R5). The phone recomputes the leaf it expects to find in the tree later.
 */
class Purchaser(
    private val repo: PassRepository,
    private val secrets: KeystoreSecretStore,
    private val protocol: ProtocolEngine,
    private val issuer: IssuerClient,
    private val clock: () -> Long = { System.currentTimeMillis() / 1000 },
) {
    suspend fun buy(product: String): Pass {
        val secret = secrets.createSecret()
        val idCommitment = protocol.idCommitment(secret)
        val r = issuer.purchase(idCommitment, product)
        val leaf = protocol.passLeaf(idCommitment, r.validUntilDay, r.zoneClass)
        val pass = Pass(product, r.leafIndex, r.validUntilDay, r.zoneClass, leaf, clock())
        repo.savePass(pass)
        Log.i("Unlink", "purchase ok")
        return pass
    }
}
