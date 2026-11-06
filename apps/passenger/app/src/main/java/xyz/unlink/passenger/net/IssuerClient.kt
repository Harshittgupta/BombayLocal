package xyz.unlink.passenger.net

import org.json.JSONObject

data class PurchaseResult(val leafIndex: Int, val validUntilDay: Int, val zoneClass: Int)

/**
 * The ONLY call the phone ever makes to the issuer: `POST /purchase {idCommitment, product}` (SPEC §3.1). The payment
 * is simulated (README, R5). After this, refresh uses public data only; the issuer is never contacted again.
 */
class IssuerClient(private val baseUrl: String) {

    suspend fun purchase(idCommitment: String, product: String): PurchaseResult {
        val r = postJson("${baseUrl.trimEnd('/')}/purchase", JSONObject().put("idCommitment", idCommitment).put("product", product))
        val zone = r.getInt("zoneClass")
        require(zone in 0..2) { "issuer returned an invalid class" } // SPEC §3.1: the phone rejects zoneClass ∉ {0,1,2}
        return PurchaseResult(r.getInt("leafIndex"), r.getInt("validUntilDay"), zone)
    }
}
