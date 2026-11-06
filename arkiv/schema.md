# Unlink on Arkiv: entity schema (SPEC v0.3 §3.1, §9)

Network: **Arkiv Rabdi testnet**, chain id 7794095, RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`, explorer `https://rabdi.explorer.arkiv.network`.
Code: `issuer/src/arkiv/` (`schemas.ts`, `writer.ts`, `reader.ts`, `codec.ts`, `expiry.ts`). SDK `@arkiv-network/sdk` 1.0.1.

## Trust rule (read this first)
Anyone can write an entity with any attributes. **The attributes prove nothing on their own.** Every reader (issuer
round-trip, passenger app, scanner, audit page) keeps only entities whose **`$creator` and `$owner` both equal the expected
writer**: an issuer address from the on-chain Registry, or the Registry authority for `VerifyKey`. The query filters on both
and the code checks them again on every row. A SignedRoot is additionally checked against its EIP-191 signature (§3.3) and the
on-chain `issuerState`. A rebuilt tree that does not hash to the signed root is rejected.

## Common attributes (all entities, all indexed)
| attribute | type | value |
|---|---|---|
| `app` | str | `unlink` |
| `v` | u64 | `1` (schema version) |
| `type` | str | `unlink.signedRoot` · `unlink.leafBatch` · `unlink.revocation` · `unlink.scannerList` · `unlink.verifyKey` |
| `issuer` | addr | the writer: the issuer EOA (for VerifyKey, the authority EOA) |
| `arkiv.schema` | str | added by the SDK's named schema; equals `type` |

## Entities
| entity | writer = $creator = $owner | extra attributes (↑ = indexed, used in filters) | payload (bytes) | expiry (SPEC §9) |
|---|---|---|---|---|
| **SignedRoot** | issuer | `rootId`↑ u64, `chainId` u64, `registry` addr, `root` str (0x bytes32), `issuedAt` u64, `expiresAt` u64, `leafCount` u64, `revSeq` u64, `txHash` str | `signature`: 65 B r‖s‖v | until `expiresAt` + 1 h |
| **LeafBatch** | issuer | `batchNo`↑ u64, `fromIndex`↑ u64, `count` u64, `lastValidDay` u64 | `leaves`: `count` × 32 B big-endian field elements, ≤ 2,000 leaves (64 KB < Arkiv's 128 KiB) | end of IST day `lastValidDay + 2` |
| **Revocation** | issuer | `seq`↑ u64, `fromIndex` u64, `count` u64, `reason`↑ str (`revoked` \| `expired`) | none | latest expiry of the batches it touches + 1 d |
| **ScannerList** | issuer | `listNo`↑ u64 | `keys`: 20 B scanner addresses, sorted, concatenated | 7 d, extended on re-publish |
| **VerifyKey** | authority | `vkSha256`↑ str (hex sha256 of the payload) | `vk`: exact bytes of `circuits/artifacts/verification_key.json` | 30 d, extended on re-publish |

Expiry is set in **blocks** (2 s each) through `ExpirationTime.fromSeconds(...)`. Every lifetime is ≥ 1 h and ≤ ~182.5 d (Arkiv's max); `MAX_PASS_DAYS` = 90 keeps a 90-day pass's batch well inside that.

## Why these entities
- **Leaves are public, holders are not.** A leaf is `Poseidon3(idCommitment, validUntilDay, zoneClass)`: a hiding commitment. Arkiv shows how many passes were sold and when. A batch's `lastValidDay` also reveals the longest validity in that batch, so a batch holding a single pass reveals that pass's product. It never reveals who bought it.
- **Expiry does the cleanup.** A batch is zeroed with an `expired` Revocation on day D+1, then drops off Arkiv at the end of D+2. Phones never need a gone batch; positions with no live batch rebuild as 0. Download stays proportional to *live* passes.
- **Idempotent writes.** Before each write the issuer queries for the same `batchNo` / `seq` / `rootId` / `listNo` / `vkSha256` (with creator = owner = itself). An identical entity is reused; a different one is an error. A create that times out and is retried can still leave two *byte-identical* entities; readers collapse those (SPEC §3.1 step 2).

## Publishing order (issuer, SPEC §3.1)
1. new `LeafBatch`es and `Revocation`s → 2. `Registry.postRoot(root)` on Sepolia → 3. sign with the on-chain `rootId`/`postedAt` → 4. `SignedRoot`.
So whenever a `rootId` exists on chain, the data needed to rebuild it is already on Arkiv.

## Read path (phone / scanner, plain JSON-RPC `arkiv_query`)
1. `eth_call Registry.issuerState(issuer)` → `latestRootId`, `latestRoot`, `latestPostedAt`.
2. `arkiv_query` the SignedRoot: `type = str('unlink.signedRoot') AND issuer = addr(I) AND rootId = <latestRootId> AND $creator = addr(I) AND $owner = addr(I)`.
3. `arkiv_query` every LeafBatch and Revocation for `I` (same creator/owner filter), 100 per page, `ORDER BY $key ASC` with `offset`.
4. Rebuild over `[0, leafCount)`, apply revocations with `seq ≤ revSeq`, compare with `root`.

## A query a judge can run
```sh
curl -s -X POST https://rpc.rabdi.db-chain.testnet.arkiv.network -H 'content-type: application/json' --data \
'{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["type = str('"'"'unlink.signedRoot'"'"') AND issuer = addr(0x8d3713FBad1A2E40F40de56D37eab09513cb060B) AND $creator = addr(0x8d3713FBad1A2E40F40de56D37eab09513cb060B) AND $owner = addr(0x8d3713FBad1A2E40F40de56D37eab09513cb060B) ORDER BY rootId:u64 DESC",{"select":{"key":true,"owner":true,"creator":true,"attributes":true},"limit":"0x1"}]}'
```
It returns the issuer's newest signed root; compare its `root` with `issuerState(0x8d37…060B).latestRoot` on the [Sepolia Registry](https://sepolia.etherscan.io/address/0xd13c3d5B02312AEFa4661aD1Fc8205807F255A16#readContract).

## Reproduce
`cd issuer && npm ci && npm run arkiv-roundtrip` (round trip: publish, read back, rebuild, compare) and `npm run arkiv-expiry` (a 2-minute entity disappears after its expiry block). Both need `../.env` (see `.env.example`). A recorded expiry run is in `arkiv/expiry-demo.txt`.
