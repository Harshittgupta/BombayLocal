# BombayLocal — Specification v0.3

Status: **frozen for build** (change only with a note in `docs/REVIEWS.md`).
All numbers in **bold** are parameters (see §9). Integers are big-endian, fixed width. Field = BN254 scalar field, modulus `r`. Hash = Poseidon (circomlib parameters) unless stated.

**v0.3 changes (Module 1 hostile review, see `docs/REVIEWS.md`):** circuit takes a single `pathIndex` and range-checks `depth` and `zoneClass`; scanner rejects non-canonical field values and enforces the exact root TTL; the phone checks the signed root against the Registry; per-issuer floor; signed-root encoding pinned; Arkiv tree rebuild made deterministic (`leafCount`, `revSeq`, expired batches zeroed); Arkiv reads filter on `$creator`/`$owner`; Arkiv expiry is in blocks; debounce only while the code stays in view; threat model corrected (anonymity set, lost phone, epoch boundary). Second review pass: the phone follows the issuer's latest on-chain root and floor via one `issuerState` call; root heartbeat; idempotent Arkiv writes; suspended issuers can't be re-added; passes capped at 90 days; Registry views, events and public-signal order pinned; proof points validated.

**Project rules** (full version with checks in `CLAUDE.md`):
- **R1** Auditable public repo.
- **R2** Proper, same-day commits.
- **R3** Review logged in `docs/REVIEWS.md` after every task.
- **R4** Two separate Android apps (passenger, scanner).
- **R5** Real web3, no mocks: Registry on Ethereum Sepolia with verified source, real Arkiv writes and reads, real Groth16 proving on the phone and verifying on the scanner. The only simulation is the mock pass purchase.
- **R6** Sponsors: Ethereum Foundation Best CROPS App and Arkiv Build on Arkiv only.

**Choices made in this spec** (each can be reopened, but only deliberately):
1. One secret per pass, generated on the phone; the issuer only ever sees the leaf commitment.
2. 10-minute epochs. Adjacent-epoch proofs are accepted only within 120 s of the boundary, not a full ±1 epoch.
3. Pass expiry and fare class are checked **inside the circuit**. Expiry stays private; only "still valid today" is proven. (v0.3: `zoneClass` is also constrained to {0, 1, 2}.)
4. **Changed in v0.3.** `rootId` is still a single **global counter** in the Registry, but the **floor is per issuer** (`floor[issuer]`). A global floor took down every issuer's passes to deal with one issuer's bad roots.
5. The passenger takes the signed root **from Arkiv, not from the issuer**, and (v0.3) accepts only the issuer's **latest on-chain root**, read from `Registry.issuerState`. This blocks root-tagging attacks and makes the on-chain `ROOT_INTERVAL` binding (§8).
6. The QR is Base45 text, not raw binary, so standard scanner libraries read it reliably.
7. Duplicates are caught per scanner. Cross-scanner audit **measures** sharing but cannot name the pass. That is the privacy price, stated openly.
8. **The issuer builds the leaf from the terms that were paid for** (v0.2 fix). The phone sends only `idCommitment = Poseidon1(secret)`, and the issuer computes the leaf with the `validUntilDay` and `zoneClass` the passenger paid for. Previously the phone built the whole leaf, so it could have written any expiry into it.
9. **Leaves are public on Arkiv, and the phone computes its own Merkle path** (v0.2). The issuer publishes leaf commitments and revocations to Arkiv. The phone rebuilds the tree and checks it against the signed root. Daily refresh then needs no issuer server (CROPS *C*), never reveals the passenger's `leafIndex` or IP to the issuer (CROPS *P*), and every phone computes the same root from public data, which rules out root tagging. (v0.3: the rebuild is made deterministic by `leafCount`/`revSeq`, and expired batches are zeroed so Arkiv expiry never breaks it.)

---

## 1. Goals and non-goals

**Goals**
- G1: The scanner learns one bit: *valid now / not valid*. It also sees the coarse fare class, which a TC sees anyway.
- G2: Verification runs fully offline, in under 1 s, using only data synced earlier.
- G3: No identifier links the same passenger across epochs, scanners or days. The signed root a phone carries places it in the set of phones that refreshed during the same root interval; that residual is stated in §8.
- G4: Any operator can become an issuer through a public registry. No shared commuter database.
- G5: Scanners keep verifying when the issuer server is down.

**Non-goals**
- Payments (purchase is mocked), fare calculation, entry/exit pairing, journey history.
- Preventing a passenger from lending the whole phone.
- Production trusted setup or a production multisig (both are demo-grade, documented in the README).

## 2. Actors

| Actor | Holds | Trust |
|---|---|---|
| **Authority** | Registry admin key (EOA for demo, multisig in prod) | Adds and suspends issuers, raises an issuer's floor |
| **Issuer** | Issuer EOA key, private DB, Merkle tree | Honest about who paid. *Not* trusted with privacy |
| **Passenger app** | Pass secret (Keystore-wrapped), path, signed root, cached proofs | Holds the pass |
| **TC scanner** | Local store: issuers, per-issuer floors, roots, vk, nullifier log; scanner key | Honest-but-curious about passengers |
| **Registry** | Issuer list, global `rootId` counter, per-issuer floor, latest root per issuer, `minRootInterval` (immutable, set in the constructor). Interface in §7.1 | Solidity contract on Ethereum Sepolia, source verified |
| **Arkiv** | Signed roots, leaf batches, revocations and scanner lists (created and owned by each issuer's wallet); the vk (created by the authority's wallet). All expire | Public data layer. Read by the passenger app, the scanner and the audit page |
| **Auditor** | Nothing secret | Anyone. Uses the audit page |

## 3. Data objects

### 3.1 Pass leaf
```
secret        random 248 bits (fits in the field), generated on the phone, never leaves it
idCommitment  = Poseidon1(secret)                                   computed on the phone
validUntilDay uint16, last valid day, inclusive (day numbering in §9)   set by the issuer
zoneClass     uint8 in {0, 1, 2} (0 = 2nd, 1 = 1st, 2 = AC)          set by the issuer
leaf          = Poseidon3(idCommitment, validUntilDay, zoneClass)   computed by the issuer
```
The phone sends `{idCommitment, product}` to `/purchase`. The issuer checks `idCommitment < r`, sets `validUntilDay` and `zoneClass` from the product that was paid for (validity ≤ **MAX_PASS_DAYS**), builds the leaf, appends it, and returns `{leafIndex, validUntilDay, zoneClass}`. The phone recomputes and stores the leaf, and rejects a `zoneClass` outside {0, 1, 2}.

The issuer stores `purchaseId ↔ leafIndex` (it needs this for refunds and lost-phone revocation) but never the secret. Without the secret, the issuer cannot compute nullifiers.

**Arkiv entities written by the issuer** (schema in `/arkiv/schema.md`):
- `LeafBatch {batchNo, fromIndex, count, leaves[]}`: consecutive new leaves, at most **LEAF_BATCH_MAX** per entity.
- `Revocation {seq, fromIndex, count, reason}`: sets leaves `[fromIndex, fromIndex+count)` to 0. `seq` increases by 1 per entity. `reason` is `revoked` (one pass: refund, lost phone, fraud) or `expired` (a whole `LeafBatch` once every leaf in it has `validUntilDay < day(now)`).
- `SignedRoot`: the §3.3 fields, plus the unsigned attributes `leafCount` (leaves the root covers) and `revSeq` (highest revocation `seq` applied). These need no signature: a wrong value makes the rebuilt root mismatch.

**Issuer duties:**
- **Publishing order:** (1) write the new `LeafBatch` and `Revocation` entities; (2) `Registry.postRoot(root)`; (3) sign the root with the on-chain `rootId` and `postedAt` (§3.3); (4) write the `SignedRoot`.
- **Idempotent writes:** before each write the issuer queries Arkiv for an existing entity with the same `batchNo`, `seq` or `rootId`, so a retried write never creates a second, different entity.
- **Heartbeat:** the issuer posts a root at least every **ROOT_HEARTBEAT**, and once within the first hour after 00:00 IST, even with no new purchases. This keeps roots from expiring. *Implementation note (UI module):* the issuer also auto-publishes about 30 s after a purchase (never sooner than the on-chain interval allows), so a new pass works within a minute or two. Privacy cost in §8, "Anonymity set of a root".
- **Zeroing:** in the first root after day `D + 1` begins, where `D` is a batch's latest `validUntilDay`, the issuer zeroes that batch with an `expired` revocation.

**Refresh: path from public data.** The phone:
1. Makes one `eth_call` to `Registry.issuerState(issuer)` → `(active, floor, latestRoot, latestRootId, latestPostedAt)`. It requires `active`, `latestRootId ≥ floor`, and `latestRootId ≥` the `rootId` it already holds. Otherwise it keeps its current root. If its current root is below `floor`, it drops that root's cached proofs and shows "Updating…".
2. Reads from Arkiv, keeping only entities whose `$creator` and `$owner` both equal the issuer address:
   - the `SignedRoot` with `rootId == latestRootId`,
   - all live `LeafBatch` entities,
   - all live `Revocation` entities.

   Byte-identical duplicates count as one. If that `SignedRoot` isn't on Arkiv yet, it retries later. If two different `SignedRoot`s exist for that `rootId`, it keeps its current root (§8, tagging).
3. Verifies the signature (§3.3). It requires `root == latestRoot`, `issuedAt == latestPostedAt` and `expiresAt == issuedAt + ROOT_TTL`.
4. Rebuilds the LeanIMT over indices `[0, leafCount)`:
   - Each position takes its value from the live `LeafBatch` covering it, or 0 if none does (that batch expired and was zeroed).
   - Overlapping, non-identical batches mean rejection, and so does any leaf `≥ r`.
   - It then applies every `Revocation` with `seq ≤ revSeq`.
5. Checks that the computed root equals `signedRoot.root`. On any failure it keeps the previous root and shows "Couldn't update; your pass still works until <time>".
6. Derives its own path with `generateProof(leafIndex)`:
   - If `leafIndex ≥ leafCount`, it shows "Pass activates at the next update".
   - If the tree's leaf there is 0, it shows "Pass revoked".
   - If the tree's leaf differs from the leaf it stored at purchase, it shows "Pass mismatch, contact the issuer".

**When the phone refreshes:** on app open and on unlock when online (at most once per **ROOT_INTERVAL**), plus a daily background job. Before each pre-prove batch (§6) it tries to move to the newest root, so phones converge on the same root.

**Contact and visibility:** the issuer server is contacted **only at purchase**. Leaves are hiding commitments; to an outsider they show only how many passes were sold and when.

**Scale:** the download is 32 B per **live** leaf, because expired batches are zeroed and drop off Arkiv. The rebuild still hashes all `leafCount` positions, and one tree holds at most 2^20 passes **issued over its lifetime**. Production needs delta sync and tree rotation (§8).

### 3.2 Merkle tree
Poseidon LeanIMT (`@zk-kit/lean-imt`, pinned), **MAX_DEPTH = 20**, so up to 1,048,576 passes per issuer. Internal node = `Poseidon2(left, right)`. A node with no right sibling is promoted, not hashed. A 0 leaf is an ordinary value, hashed with its sibling, so a revoked or zeroed leaf keeps the tree shape and every other index.

The circuit uses zk-kit's `BinaryMerkleRoot(MAX_DEPTH)` (`@zk-kit/binary-merkle-root.circom`, pinned), which follows the same promotion rule. Its inputs come straight from LeanIMT's `generateProof`:
- `depth = proof.siblings.length`: the number of levels that had a sibling. It can be smaller than the tree depth.
- `pathIndex = proof.index`: a **compressed** path index with one bit per level that had a sibling. It is **not** the leaf index.
- `siblings = proof.siblings`, padded with 0 up to 20 entries.

### 3.3 Signed root
```
issuer    address (20 B)    issuer EOA, same key that calls postRoot
rootId    uint64            global id assigned by Registry.postRoot
root      bytes32           tree root (field element, nonzero, < r)
issuedAt  uint32            = Registry postedAt (block.timestamp of the postRoot tx)
expiresAt uint32            = issuedAt + ROOT_TTL, exactly
signature 65 B              r ‖ s ‖ v, v ∈ {27, 28}, s ≤ secp256k1n/2
```
**Encoding (pinned; a shared vector lives in `fixtures/vectors.json`):**
```
digest = keccak256(abi.encodePacked(
           "UNLINK-ROOT-v1",            // 14 ASCII bytes, no length prefix
           chainId   uint256 (32 B),
           registry  address (20 B),
           issuer    address (20 B),
           rootId    uint64  (8 B),
           root      bytes32 (32 B),
           issuedAt  uint32  (4 B),
           expiresAt uint32  (4 B)))    // 134-byte preimage
signature = secp256k1 sign of keccak256("\x19Ethereum Signed Message:\n32" ‖ digest)
```
In ethers v6 this is `wallet.signMessage(getBytes(digest))`. Never sign the hex string: that produces the `\n66` prefix. Kotlin encodes every integer at its exact width (no `BigInteger.toByteArray` sign byte or stripping). A shared vector (test key) is in `/fixtures/sign-vectors.json`: the Kotlin scanner must reproduce `digest` and recover `signer`.

The issuer posts the root on-chain first, reads `rootId` and `postedAt` from the `RootPosted` event, signs, and then publishes to Arkiv.

### 3.4 QR payload (427 bytes → 641 Base45 chars)

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | `version` = 0x01 |
| 1 | 1 | `zoneClass` |
| 2 | 4 | `epochId` (uint32) |
| 6 | 32 | `nullifier` |
| 38 | 64 | proof `A` (G1: x, y) |
| 102 | 128 | proof `B` (G2: x.c1, x.c0, y.c1, y.c0; EIP-197 order) |
| 230 | 64 | proof `C` (G1: x, y) |
| 294 | 20 | `issuer` |
| 314 | 8 | `rootId` |
| 322 | 32 | `root` |
| 354 | 4 | `issuedAt` |
| 358 | 4 | `expiresAt` |
| 362 | 65 | `signature` (r, s, v) |

The payload is encoded as Base45 (RFC 9285): 213 two-byte groups → 639 chars, plus 1 trailing byte → 2 chars, for 641. The QR is encoded in **alphanumeric mode** at error-correction level M, which needs **version 16** (capacity 658). `currentDay` is not sent: the scanner derives it from `epochId`.

**No stable identifier across epochs:** `issuer`, `rootId`, `root`, `issuedAt`, `expiresAt` and `signature` are shared by every phone carrying that root. `zoneClass` takes 3 values. `nullifier` changes every epoch. Groth16 proofs are re-randomised on every proving run. **Anonymity set:** the phones that carry the same root and class. See §8 for how big that set is and how it is kept large.

## 4. Circuit statement (`circuits/pass.circom`)

**Public inputs, in order:** `root, nullifier, epochId, currentDay, zoneClass`
**Private inputs:** `secret, validUntilDay, depth, pathIndex, siblings[20]`

The main template has **no output signals**. It declares its `signal input`s in exactly the public order above, followed by the private ones, and the main component is `component main {public [root, nullifier, epochId, currentDay, zoneClass]}`. snarkjs orders public signals as outputs first, then public inputs in declaration order. A fixture test asserts the order.

**Constraints:**
1. `leaf = Poseidon3(Poseidon1(secret), validUntilDay, zoneClass)`
2. `Num2Bits(5)(depth)` and `LessEqThan(5)(depth, 20) === 1`. The template outputs 0 for `depth > MAX_DEPTH`, so this check is the caller's job.
3. `root === BinaryMerkleRoot(20)(leaf, depth, pathIndex, siblings)`. The template decomposes `pathIndex` with `Num2Bits(20)` internally, so the path bits are boolean.
4. `nullifier === Poseidon2(secret, epochId)`: the same `secret` signal as in step 1.
5. `Num2Bits(16)` on `validUntilDay` and `currentDay`, then `LessEqThan(16)(currentDay, validUntilDay) === 1`.
6. `zoneClass · (zoneClass − 1) · (zoneClass − 2) === 0`.
7. Every signal is fixed by `<==` or `===`. No signal is assigned with `<--` alone.

**Why the public inputs can't be faked:** `root` must carry a valid issuer signature and match on-chain state. `nullifier` is bound to the leaf's secret. `epochId` is checked against the scanner clock. `currentDay` is computed by the scanner from `epochId` and never read from the QR. `zoneClass` is inside the leaf. An internal tree node can't be passed off as a leaf: leaves are `Poseidon3` outputs and nodes are `Poseidon2` outputs, so doing so needs a Poseidon preimage.

Target: under 20k constraints (estimate about 6.5k). Record the measured value in §10.

## 5. Scanner verification algorithm

`verify(qrText, now)` uses only the local store and has no network code. The checks run in order, and the first failure returns its result.

1. **Parse.** Decode Base45. Otherwise **Red** `MALFORMED` unless all of these hold:
   - Length is 427 and `version` is 1.
   - `zoneClass ≤ 2`.
   - `root` is nonzero and `< r`; `nullifier` is `< r`. Without this check, `nullifier + k·r` would verify as a fresh nullifier.
   - Every proof coordinate is `< p` (the base-field modulus).
   - `A` and `C` are on G1.
   - `B` is on G2 and in its prime-order subgroup.
2. **Epoch.** Let `e = floor(now / EPOCH)` and `t = now mod EPOCH`. Accept `epochId == e`, or `epochId == e-1` when `t ≤ SKEW`, or `epochId == e+1` when `EPOCH − t ≤ SKEW`. Otherwise **Red** `WRONG_EPOCH`.
3. **Scanner freshness.** If `now − lastSync > STALE_MAX`, **Red** `SCANNER_STALE`. The TC must sync.
4. **Issuer.** `issuer` must be active in the local store. Otherwise **Red** `ISSUER_INACTIVE`.
5. **Signed root.**
   - The signature (§3.3 encoding, `v ∈ {27, 28}`, low `s`) must recover to `issuer`. Otherwise **Red** `BAD_SIGNATURE`.
   - `rootId ≥ floor[issuer]`, else **Red** `BELOW_FLOOR`.
   - `expiresAt − issuedAt == ROOT_TTL`, else **Red** `BAD_ROOT_TTL`.
   - `issuedAt ≤ now + SKEW` and `now < expiresAt`, else **Red** `ROOT_EXPIRED`.
   - A `rootId` the scanner has never seen is **accepted** if all of these checks pass.
6. **Proof.** Set `currentDay = day(epochId)` (see §9). Run Groth16 verify with the local `vk` on `[root, nullifier, epochId, currentDay, zoneClass]`. Failure is **Red** `BAD_PROOF`.
7. **Class.** If this checkpoint requires a fare class, check that `zoneClass` is at least that class. Otherwise **Red** `WRONG_CLASS`.
8. **Nullifier.** Look up `nullifier` in the local log:
   - The same nullifier read again while the code has stayed in view (no decode gap ≥ **DEBOUNCE_GAP** since its last read) is the same showing. Keep the current result on screen and don't count it. The camera keeps decoding while a result is shown, so a code held steadily in view keeps refreshing its last-read time.
   - Not seen → count = 1.
   - Seen once → count = 2 → **Amber** `SEEN_BEFORE`.
   - Seen two or more times → **Red** `DUPLICATE`.
9. **Store** `{nullifier, epochId, count, firstSeen, lastRead}`. Purge entries once `epochId < e − 1`. Nothing else is written.
10. **Result.** **Green**, unless one of these Amber conditions applies: the nullifier count is 2; `expiresAt − now < EXPIRY_WARN` (`ROOT_NEAR_EXPIRY`); or `now − lastSync > STALE_WARN` (`SCANNER_UNSYNCED`).

*Implementation note (M8a):* the reason codes are the `Reason` enum in `apps/scanner/verifier`. Several Amber conditions can apply at once: the reason shown is the first in the order above, and the scanner keeps all of them as warnings. There is one code that is not listed above: **Red** `VERIFIER_ERROR`. It covers a Groth16 engine that fails or times out, or a store that holds no `vk`. Such a scan fails closed and is never reported as `BAD_PROOF`. The cases in `fixtures/qr/` are the conformance suite for this section.

*Implementation note (M8b):*
- **Clock changes.** A negative debounce gap (the clock moved back) counts as a new showing. A `lastSync` more than `SKEW` in the future is **Red** `SCANNER_STALE`. A clock change can therefore never hide a repeat or extend freshness.
- **Upload queue.** Besides the step 9 log, a nullifier's **first** sighting is queued as `(epochId, nullifier)` and nothing else, for the scan-batch upload. Each nullifier is therefore uploaded at most once.
  - Only **closed** epochs (`< e − 1`) are uploaded, so a batch never splits an epoch in time.
  - The entry is deleted once the issuer accepts the batch.
  - Entries older than **24 h** are dropped unsent: a scanner that can't upload doesn't keep nullifiers past that limit.
- **Purging.** The log is also purged at app start and on every sync, not only during scans.
- **Two providers must agree.** Sync reads `issuers()` and `issuerState` from **two independent Sepolia providers at the same block**. Nothing is applied unless they return identical state, so one lying RPC can't add an issuer, suspend one, or raise a floor.
- **Rollback guards.** The merge never lowers a floor or a `latestRootId`, and never re-activates a suspended issuer.
- **Time resync (§8).** Each sync compares the device clock with the agreed newest block timestamp. If they differ by more than 60 s (block lag is about 12 s), the scanner stores the offset and applies it to every `verify`.

**Sync.** Sync is online only and never blocks verification. It reads from the Registry: `issuers()`, then `issuerState(issuer)` for each one. It reads from Arkiv: each issuer's `ScannerList` and the authority's `VerifyKey`, filtered on `$creator`/`$owner`. The vk hash must match the hash bundled in the APK; if it doesn't, the new vk is rejected. Sync then uploads scan batches.

**Scan batch.** `{scannerPubKey, epochId, nullifiers[]}`, signed by the scanner key. Nullifiers are sorted ascending (so a batch doesn't reveal scan order), and the scanner signs that sorted array. Batches are grouped per epoch and contain no timestamps finer than the epoch. Digest (EIP-191 over the 32-byte hash): `keccak256(abi.encodePacked("UNLINK-SCANBATCH-v1", scannerPubKey:address, epochId:uint32, nullifiers:uint256[]))`. Shared vector in `/fixtures/sign-vectors.json`.

## 6. Nullifier and epoch rules

- `epochId = floor(unixSeconds / EPOCH)`, and `nullifier = Poseidon2(secret, epochId)`.
- The same pass in the same epoch gives the same nullifier at every scanner. This is what makes duplicates detectable.
- Across epochs, nullifiers can't be linked without the secret. The issuer doesn't have it either.
- A repeated nullifier means **the same pass was shown more than once in one epoch**. Usually that is a shared screenshot; occasionally it is a TC re-checking.
- Within **SKEW** of an epoch boundary, two epochs are accepted, so one pass has two valid nullifiers for up to 120 s (§8).
- **Pre-prover.** The phone generates proofs for the current epoch and the next **PREPROVE** epochs, only after the device has been unlocked. When online it first tries to refresh to the newest root (§3.1). The lock-screen QR shows only proofs already cached. Proofs are never generated for past epochs. *Implementation note (UI module):* the ongoing notification also carries the cached code for the **current** epoch (expanded view), re-posted at each epoch boundary, on screen-on and after each pre-prove; with nothing cached for the current epoch it shows no code. Privacy cost in §8 (lost or stolen phone) and the README.

## 7. Revocation

| Case | Mechanism | Takes effect |
|---|---|---|
| Lost phone, refund, fraud | Issuer writes a `Revocation` (`reason = revoked`) to Arkiv, sets the leaf to 0 and publishes the next root | Synced scanners and refreshed phones get the new root; the old root still works until its `expiresAt` (≤ **ROOT_TTL**) unless the authority raises that issuer's floor |
| Issuer key compromised | Authority calls `suspendIssuer`. Suspension blocks `postRoot` immediately | At the scanner's next sync |
| Bad roots in circulation from one issuer | Authority calls `setMinRootId(issuer, newFloor)`. Requires `floor[issuer] < newFloor ≤ rootCount() + 1`, so the floor never decreases and never strands the issuer. That issuer's next `postRoot` skips the `ROOT_INTERVAL` wait | At the scanner's next sync. Phones pick up the issuer's next root (§3.1 step 1). Other issuers are unaffected |
| Suspended issuer | **Can't be re-added.** Roots signed in advance with a stolen key (any `rootId`, future `issuedAt`) would otherwise come back. The operator registers a new issuer address | — |

Shared screenshots are **not** revocable. Audit can count duplicates but cannot map a nullifier to a leaf.

### 7.1 Registry interface (pinned)
- `constructor(address authority, uint64 minRootInterval)`. Both are immutable; there is no owner transfer and no upgradeability.
- `addIssuer(address)`, authority only. Reverts if the address is already active or was ever suspended. The initial floor is 0.
- `suspendIssuer(address)`, authority only. Reverts unless the address is active.
- `postRoot(bytes32 root) returns (uint64 rootId)`, active issuer only.
  - Requires `root != 0`.
  - Requires `block.timestamp ≥ lastPostedAt + minRootInterval`, unless the issuer's latest `rootId < floor[issuer]` (the first post skips this).
  - `rootId = ++rootCount`, so ids start at 1.
- `setMinRootId(address issuer, uint64 newFloor)`, authority only. Requires `floor[issuer] < newFloor ≤ rootCount() + 1`.
- Views:
  - `issuers() → address[]`: every address ever added.
  - `issuerState(address) → (bool active, uint64 floor, bytes32 latestRoot, uint64 latestRootId, uint64 latestPostedAt)`.
  - `isActive(address)`, `floor(address)` and `rootCount()`.
- Events:
  - `IssuerAdded(address indexed issuer)`
  - `IssuerSuspended(address indexed issuer)`
  - `RootPosted(address indexed issuer, uint64 indexed rootId, bytes32 root, uint64 postedAt)`
  - `FloorRaised(address indexed issuer, uint64 oldFloor, uint64 newFloor)`
- Storage is per issuer and per counter only; nothing per pass. `postedAt` is `uint64` on-chain and `uint32` in the signed root (valid until 2106).

## 8. Threat model

| Attack | Mitigation | Residual risk |
|---|---|---|
| **Screenshot / QR sharing** | Per-epoch nullifier. A second showing at the same scanner is Amber, a third is Red. Epochs are 10 min, and the skew window is only 120 s. Debounce ignores repeats only while the code stays in view (gap < **DEBOUNCE_GAP**) | Detected **per scanner only**. Cross-scanner sharing is visible in audit as a statistic, but can't be attributed to a pass. A friend at a different gate in the same epoch passes. Swapping two phones in front of the camera in under 1 s counts as one showing. Within 120 s of an epoch boundary, owner and friend can each use a different epoch's proof |
| **Forged membership** | `BinaryMerkleRoot` constrains path bits; `depth ≤ 20` is constrained in the circuit; `postRoot` rejects root 0; the scanner rejects root 0 and non-canonical field values | None known beyond Groth16 soundness and the trusted setup |
| **Replay of an old signed root** | Scanner checks `expiresAt`, the exact TTL, `rootId ≥ floor[issuer]`, and that the issuer is active | A revoked pass still works on its old root for up to **ROOT_TTL**, or until that issuer's floor is raised |
| **Malicious issuer: tagging** (a unique root per passenger, to recognise them at scans) | The phone accepts only the issuer's latest on-chain root (`issuerState`), never moves backwards, and its rebuilt tree must match. So every accepted root was posted on-chain, at most 1 per **ROOT_INTERVAL**, and `issuedAt`/`expiresAt` are fixed by the chain. An Arkiv endpoint can't steer a phone to an older root. If an issuer publishes two `SignedRoot`s for one `rootId` (for example, different ECDSA signatures), phones refuse to switch, and the audit page flags it as public evidence. `zoneClass` is limited to 3 values in the circuit | An issuer can still split users across consecutive roots: up to 96 roots a day in production (1,440 at the demo's 60 s). Users converge on the latest root at each refresh |
| **Anonymity set of a root** | Phones refresh to the newest root on open, on unlock when online, and before each pre-prove batch | The set is the phones that carry the same root and class. A phone that stays offline carries an older root that fewer phones share. Right after a purchase, the newest root is held only by phones that refreshed since it was posted. Demo-scale sets are tiny. An issuer colluding with scanners could narrow a passenger down to "refreshed in that interval". **Auto-publish (UI module) sharpens this:** the issuer publishes a root about 30–60 s after a purchase, and the buyer's phone moves to it at once; at low traffic the buyer is the only holder of that root until other phones refresh (on unlock, at most once per ROOT_INTERVAL), so an issuer that knows who paid, colluding with a TC who reads the rootId in the QR, can link that buyer's scans until the next root. Bounded by ROOT_INTERVAL (one root per issuer per interval on chain); production should publish on a fixed ROOT_INTERVAL cadence instead, so a root follows the clock, not a purchase |
| **Malicious issuer: minting / long-lived roots** | It can only mint its own passes. Scanners require `expiresAt − issuedAt == ROOT_TTL`. The authority can suspend it, permanently. The audit page flags `SignedRoot`s with no matching `RootPosted` event | Fake passes from a rogue issuer last until suspension plus the next sync |
| **Arkiv data injection / withholding** | Readers keep only entities whose `$creator` and `$owner` equal the expected writer. The target root comes from the chain, and everything else is rebuilt and checked against it | An Arkiv RPC provider that withholds or reorders entities only causes "Couldn't update" (the old root keeps working until it expires) |
| **Scanner log linkability** | The log stores only the nullifier, epoch, count and read times, purged after 2 epochs. Batches have epoch granularity | Scanners that collude can link one pass **within one epoch**. That is by design and needed for audit |
| **Lost or stolen phone** | Secret is Keystore-wrapped and `allowBackup=false`. The lock screen shows only cached proofs (≤ **PREPROVE** epochs). User reports the loss and the issuer revokes | A thief with a locked phone gets about 2 h, from the tile or the notification. An app with notification access can read the current code from the notification (valid for its 10-min epoch only). A thief with an unlocked phone keeps the pass until the old root expires (≤ **ROOT_TTL**), unless the authority raises that issuer's floor |
| **Clock skew / day boundary** | Adjacent epochs are accepted only within **SKEW** of the boundary. Scanners resync time at each online sync | Scanner drift above 120 s gives false Reds, shown as reason `WRONG_EPOCH`. A pass that expired yesterday is accepted for up to 120 s after midnight IST |
| **Forged proof / vk swap** | Groth16 soundness. The vk hash is pinned in the APK and shown on the audit page | Demo-grade trusted setup: one phase-2 contribution |
| **Issuer server down, or refusing a passenger** (CROPS *C*) | Scanners verify from local data. Phones refresh paths from Arkiv and the Registry, not from the issuer. The issuer can't single out one passenger, because refresh never contacts it | Existing passes keep working until the last signed root expires (≤ **ROOT_TTL**). New purchases and new roots stop. The authority can register a replacement issuer. This is the demo |
| **Network observers / RPC providers** (CROPS *P*) | Scanner RPC reads only public Registry state and learns nothing about passengers. The passenger app reads Arkiv and makes one Registry `eth_call`; every passenger of an issuer sends the same queries, with no leafIndex. RPC and Arkiv endpoints are configurable | The Arkiv and RPC providers see the phone's IP and which issuer it uses, at most once per **ROOT_INTERVAL** while the phone is in use. Optional mitigation: anon-rpc or a user-chosen endpoint |
| **Scale limits** (stated in README) | Leaf download is 32 B × live passes; expired batches are zeroed and drop off Arkiv | About 32 MB at 1M live passes. The rebuild hashes every position ever issued, and a tree holds at most 2^20 passes over its lifetime. Production needs per-day delta batches (or a private path service) and tree rotation |

## 9. Parameters

| Name | Default | Notes |
|---|---|---|
| `MAX_DEPTH` | 20 | ~1M passes per tree, counted over its lifetime (zeroed leaves keep their slots). `depth ≤ MAX_DEPTH` is constrained in the circuit |
| `EPOCH` | 600 s | Balances screenshot window against proving/battery cost |
| `SKEW` | 120 s | Adjacent-epoch acceptance near the boundary |
| `DEBOUNCE_GAP` | 1 s | A repeat read counts as a new showing once the code has been out of view this long |
| `PREPROVE` | 12 epochs | 2 h of cached proofs |
| `ROOT_TTL` | 36 h | Daily refresh plus 12 h grace. `expiresAt − issuedAt` must equal it exactly |
| `ROOT_INTERVAL` | 15 min (production); **60 s in the demo deployment** | Minimum time between roots per issuer. Enforced **on-chain** by the Registry constructor parameter `minRootInterval` (immutable), shown on the audit page. Binding on phones because they accept only the issuer's latest on-chain root (§3.1). Skipped once when the issuer's latest root is below its floor |
| `EXPIRY_WARN` | 2 h | Amber when the root is this close to expiry |
| `STALE_WARN` | 24 h | Amber when the scanner hasn't synced for this long |
| `STALE_MAX` | 48 h | Red after this: the scanner must sync |
| `DAY_OFFSET` | 19,800 s (IST) | `day(t) = floor((t + DAY_OFFSET) / 86400)`, and `day(epochId) = day(epochId·EPOCH)`. 600 divides 19,800, so day boundaries fall on epoch boundaries |
| QR size | 427 B / 641 chars, alphanumeric mode, version 16-M | Limit is 1.5 KB |
| `LEAF_BATCH_MAX` | 2,000 leaves | Keeps a `LeafBatch` well under Arkiv's 128 KiB per entity |
| Arkiv expiry unit | **blocks**, 2 s per block | Set with the SDK's `ExpirationTime` helpers from the durations below. Maximum lifetime about 182.5 days per create or extension |
| Arkiv expiry | `SignedRoot`: until `expiresAt` + 1 h. `LeafBatch`: until the end of day `D + 2`, where `D` is the batch's latest `validUntilDay`. `Revocation`: the latest expiry among the batches it touches, + 1 d. `ScannerList`: 7 d. `VerifyKey`: 30 d | The issuer zeroes a batch (`expired` revocation) during day `D + 1`, so phones never need an expired batch. **MAX_PASS_DAYS** keeps every entity under Arkiv's ~182.5 d maximum. The writer extends `ScannerList` and `VerifyKey` before expiry |
| Arkiv entities | `SignedRoot`, `LeafBatch`, `Revocation`, `ScannerList` (issuer's wallet); `VerifyKey` (authority's wallet) | Readers require `$creator` = `$owner` = the expected writer (an issuer from the Registry, or the authority), then filter on `type` and `rootId`. Full schema in `/arkiv/schema.md` |
| `MAX_PASS_DAYS` | 90 | Longest product (covers quarterly season passes) |
| `ROOT_HEARTBEAT` | 6 h | The issuer posts at least this often, plus once in the first hour after 00:00 IST |

## 10. Measurements (fill in from real runs)

| Metric | Target | Measured | Device / date |
|---|---|---|---|
| Constraint count | < 20k | 5,697 (non-linear, 0 linear; 5 public, 24 private inputs, 0 outputs) | circom 2.2.3 `--O2` / 2026-11-05 |
| Proving time, laptop (snarkjs 0.7.6, Node) | reference only | 957 ms median of 5 warm runs (920–994); verify 24 ms | Intel i5-8350U ×8, Node 22.13.1, Windows / 2026-11-05 |
| Proving time, mid-range Android | < 3 s | 3,653 ms (cold first proof: WebView+snarkjs init + 3.3 MB zkey load + prove, single-thread). Warm/pre-proved proofs expected lower; lock-screen shows pre-generated proofs so this isn't on the scan path | Nothing Phone A142 (Android 16, arm64, 7.6 GB), snarkjs 0.7.6 in WebView / 2026-11-06 |
| Proving time, pre-prove batch (warm, per proof) | < 3 s | 3,467 ms average over 13 proofs (first of the batch 3,578 ms); about 45 s for the whole 2 h PREPROVE window, run after unlock, never on the scan path. The lock-screen QR opens instantly from cache | vivo Y100 V2222 (Android 15), snarkjs 0.7.6 in WebView, real root 8 / 2026-11-06 |
| Verify latency (steps 1–10) | < 1 s | **50.7 ms** median over 20 runs (41–79 ms) for the full `verify()`: Kotlin steps 1–10 plus snarkjs 0.7.6 `groth16.verify` in a WebView. Step 1 parse with the G1/G2 and subgroup checks takes 12 ms. Laptop reference: 22.6 ms (JVM, with snarkjs via Node). With the app's Room store: 62.5 ms median (51–78 ms). Real phone-to-phone run: the vivo passenger in airplane mode showed its lock-screen QR (root 9) to the A142 scanner, which gave Green, Amber, then Red. The next sync uploaded the signed batch, and the issuer stored it | Nothing Phone A142 (Android 16), instrumented `OnDeviceVerifierTest`; laptop i5-8350U / 2026-11-06 |
| QR version at level M | ≤ 20 (computed: 16) | 16, alphanumeric mode (ZXing `Encoder` on device, 641 Base45 chars from the 427-byte payload) | vivo Y100 V2222 (Android 15), instrumented QrPayloadTest / 2026-11-06 |
| `postRoot` gas | small | 351,411 first post (cold storage); 57,651 warm (issuer reposting). Real Sepolia receipts; Sepolia runs Pectra so these exceed the local `cancun` gas-report | Sepolia tx 0xbc44…7e32 (cold), 0x2a9b…f73d (warm, via issuer service) / 2026-11-06 |
