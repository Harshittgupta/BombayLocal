package xyz.unlink.scanner.verifier

import org.web3j.crypto.Hash
import java.math.BigInteger

/**
 * SPEC §5 scan batch digest: keccak256(abi.encodePacked("UNLINK-SCANBATCH-v1", scannerPubKey address,
 * epochId uint32, nullifiers uint256[])). Nullifiers are sorted ascending first, so a batch doesn't reveal scan order.
 * Pure computation; the app signs it (EIP-191, "\n32") and uploads it during sync.
 */
object ScanBatch {
    private val TAG = "UNLINK-SCANBATCH-v1".toByteArray(Charsets.US_ASCII)

    fun sorted(nullifiers: Collection<BigInteger>): List<BigInteger> = nullifiers.distinct().sorted()

    fun digest(scanner: ByteArray, epochId: Long, sortedNullifiers: List<BigInteger>): ByteArray {
        require(scanner.size == 20)
        require(sortedNullifiers.zipWithNext().all { (a, b) -> a < b }) { "nullifiers must be strictly ascending" }
        var out = TAG + scanner + SignedRoot.uint(epochId, 4)
        for (n in sortedNullifiers) out += SignedRoot.uint(n, 32)
        return Hash.sha3(out)
    }
}
