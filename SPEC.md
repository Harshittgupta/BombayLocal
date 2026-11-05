# Unlink — Specification v0.2

Status: **frozen for build** (change only with a note in `docs/REVIEWS.md`).
All numbers in **bold** are parameters (see §9). Integers are big-endian. Field = BN254 scalar field. Hash = Poseidon (circomlib parameters) unless stated.

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
3. Pass expiry and fare class are checked **inside the circuit**. Expiry stays private; only "still valid today" is proven.
4. `rootId` is a single **global counter** in the Registry, so one floor applies to every issuer.
5. The passenger takes the signed root **from Arkiv, not from the issuer**. This blocks root-tagging attacks (§8).
6. The QR is Base45 text, not raw binary, so standard scanner libraries read it reliably.
7. Duplicates are caught per scanner. Cross-scanner audit **measures** sharing but cannot name the pass. That is the privacy price, stated openly.
8. **The issuer builds the leaf from the terms that were paid for** (v0.2 fix). The phone sends only `idCommitment = Poseidon1(secret)`, and the issuer computes the leaf with the `validUntilDay` and `zoneClass` the passenger paid for. Previously the phone built the whole leaf, so it could have written any expiry into it.
9. **Leaves are public on Arkiv, and the phone computes its own Merkle path** (v0.2). The issuer publishes leaf commitments and revocations to Arkiv. The phone rebuilds the tree and checks it against the signed root. Daily refresh then needs no issuer server (CROPS *C*), never reveals the passenger's `leafIndex` or IP to the issuer (CROPS *P*), and every phone computes the same root from public data, which rules out root tagging.

---

## 1. Goals and non-goals

**Goals**
- G1: The scanner learns one bit: *valid now / not valid*. It also sees the coarse fare class, which a TC sees anyway.
- G2: Verification runs fully offline, in under 1 s, using only data synced earlier.
- G3: No identifier links the same passenger across epochs, scanners or days.
- G4: Any operator can become an issuer through a public registry. No shared commuter database.
- G5: Scanners keep verifying when the issuer server is down.

**Non-goals**
- Payments (purchase is mocked), fare calculation, entry/exit pairing, journey history.
- Preventing a passenger from lending the whole phone.
- Production trusted setup or a production multisig (both are demo-grade, documented in the README).

## 2. Actors

| Actor | Holds | Trust |
|---|---|---|
| **Authority** | Registry admin key (EOA for demo, multisig in prod) | Adds and suspends issuers, raises the floor |
| **Issuer** | Issuer EOA key, private DB, Merkle tree | Honest about who paid. *Not* trusted with privacy |
| **Passenger app** | Pass secret (Keystore-wrapped), path, signed root, cached proofs | Holds the pass |
| **TC scanner** | Local store: issuers, floor, roots, vk, nullifier log; scanner key | Honest-but-curious about passengers |
| **Registry** | Issuer list, global `rootId`, floor, latest root per issuer | Solidity contract on Ethereum Sepolia, source verified |
| **Arkiv** | Signed roots, leaf batches, revocations, scanner list, vk. All are owned by the writer's wallet and all expire | Public data layer. Read by the passenger app, the scanner and the audit page |
| **Auditor** | Nothing secret | Anyone. Uses the audit page |

## 3. Data objects

### 3.1 Pass leaf
```
secret        random 248 bits (fits in the field), generated on the phone, never leaves it
idCommitment  = Poseidon1(secret)                                   computed on the phone
validUntilDay uint16, last valid day, inclusive (day numbering in §9)   set by the issuer
zoneClass     uint8, fare class (0 = 2nd, 1 = 1st, 2 = AC; others reserved)   set by the issuer
leaf          = Poseidon3(idCommitment, validUntilDay, zoneClass)   computed by the issuer
```
The phone sends `{idCommitment, product}` to `/purchase`. The issuer sets `validUntilDay` and `zoneClass` from the product that was paid for, builds the leaf, appends it, and returns `{leafIndex, validUntilDay, zoneClass}`.

The issuer stores `purchaseId ↔ leafIndex` (it needs this for refunds and lost-phone revocation) but never the secret. Without the secret, the issuer cannot compute nullifiers.

**Path from public data.** The issuer publishes every leaf to Arkiv (`LeafBatch`) and every revocation (`Revocation`). On refresh, the phone:
1. Reads the issuer's latest signed root, its leaf batches and its revocations from Arkiv.
2. Rebuilds the LeanIMT with revoked leaves set to 0.
3. Checks that the computed root equals `signedRoot.root`. If not, it rejects the root and keeps the previous one.
4. Derives its own path.

The issuer server is contacted **only at purchase**. Leaves are hiding commitments; to an outsider they show only how many passes were sold and when. Scale note: 32 B per leaf. That is fine for the demo; at 1M passes production needs delta sync (§8, limitations).

### 3.2 Merkle tree
Poseidon LeanIMT (`@zk-kit/lean-imt`), **MAX_DEPTH = 20**, so up to 1,048,576 passes per issuer. The circuit uses zk-kit's `BinaryMerkleRoot(MAX_DEPTH)` because it has the same variable-depth rule as LeanIMT: a node with no sibling is promoted, not hashed. To revoke a pass, its leaf is set to `0`, so the other leaves keep their indices.

### 3.3 Signed root
```
issuer    address (20 B)    issuer EOA, same key that calls postRoot
rootId    uint64            global id assigned by Registry.postRoot
root      bytes32           tree root (field element)
issuedAt  uint32            unix seconds
expiresAt uint32            issuedAt + ROOT_TTL
signature 65 B              EIP-191 personal_sign over
  keccak256(abi.encodePacked("UNLINK-ROOT-v1", chainId:uint256, registry:address,
                             issuer, rootId, root, issuedAt, expiresAt))
```
The issuer posts the root on-chain first, then signs it using the returned `rootId`, then publishes it to Arkiv.

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

The payload is encoded as Base45 (RFC 9285) in a QR code at error-correction level M. `currentDay` is not sent: the scanner derives it from `epochId`.

**No stable identifier:** `issuer` and `root` are shared by every passenger on that root. `zoneClass` takes 3 values. `nullifier` changes every epoch. Groth16 proofs are re-randomised on every proving run.

## 4. Circuit statement (`circuits/pass.circom`)

**Public inputs, in order:** `root, nullifier, epochId, currentDay, zoneClass`
**Private inputs:** `secret, validUntilDay, depth, indices[20], siblings[20]`

**Constraints:**
1. `leaf = Poseidon3(Poseidon1(secret), validUntilDay, zoneClass)`
2. `root === BinaryMerkleRoot(20)(leaf, depth, indices, siblings)`
3. `nullifier === Poseidon2(secret, epochId)`
4. `Num2Bits(16)` on `validUntilDay` and `currentDay`, then `LessEqThan(16)(currentDay, validUntilDay) === 1`
5. Every signal is fixed by `<==` or `===`. No signal is assigned with `<--` alone.

Target: under 20k constraints. The estimate is about 6.5k. Record the measured value in §10.

## 5. Scanner verification algorithm

`verify(qrText, now)` uses only the local store and has no network code. The checks run in order, and the first failure returns its result.

1. **Parse.** Decode Base45. Length must be 427 and `version` must be 1. Otherwise **Red** `MALFORMED`.
2. **Epoch.** Let `e = floor(now / EPOCH)` and `t = now mod EPOCH`. Accept `epochId == e`, or `epochId == e-1` when `t ≤ SKEW`, or `epochId == e+1` when `EPOCH − t ≤ SKEW`. Otherwise **Red** `WRONG_EPOCH`.
3. **Scanner freshness.** If `now − lastSync > STALE_MAX`, **Red** `SCANNER_STALE`. The TC must sync.
4. **Issuer.** `issuer` must be active in the local store. Otherwise **Red** `ISSUER_INACTIVE`.
5. **Signed root.** The signature must recover to `issuer`. Otherwise **Red** `BAD_SIGNATURE`. `rootId ≥ floor`, else **Red** `BELOW_FLOOR`. `issuedAt ≤ now + SKEW`, and `now < expiresAt`, else **Red** `ROOT_EXPIRED`. A `rootId` the scanner has never seen is **accepted** if all of these checks pass.
6. **Proof.** Set `currentDay = day(epochId)` (see §9). Run Groth16 verify with the local `vk` on `[root, nullifier, epochId, currentDay, zoneClass]`. Failure is **Red** `BAD_PROOF`.
7. **Class.** If this checkpoint requires a fare class, check that `zoneClass` is at least that class. Otherwise **Red** `WRONG_CLASS`.
8. **Nullifier.** Look up `nullifier` in the local log:
   - Seen within **DEBOUNCE** → this is the same scan repeating. Show the previous result again and don't count it.
   - Not seen → count = 1.
   - Seen once → count = 2 → **Amber** `SEEN_BEFORE`.
   - Seen two or more times → **Red** `DUPLICATE`.
9. **Store** `{nullifier, epochId, count, firstSeen}`. Purge entries once `epochId < e − 1`. Nothing else is written.
10. **Result.** **Green**, unless one of these Amber conditions applies: the nullifier count is 2; `expiresAt − now < EXPIRY_WARN` (`ROOT_NEAR_EXPIRY`); or `now − lastSync > STALE_WARN` (`SCANNER_UNSYNCED`).

**Sync.** Sync is online only and never blocks verification. It reads from the Registry: active issuers, `floor`, the latest `rootId` per issuer. It reads from Arkiv: signed roots, the scanner list, and `vk`. The vk hash must match the hash bundled in the APK; if it doesn't, the new vk is rejected. Sync then uploads scan batches.

**Scan batch.** `{scannerPubKey, epochId, nullifiers[]}`, signed by the scanner key. Batches are grouped per epoch and contain no timestamps finer than the epoch.

## 6. Nullifier and epoch rules

- `epochId = floor(unixSeconds / EPOCH)`, and `nullifier = Poseidon2(secret, epochId)`.
- The same pass in the same epoch gives the same nullifier at every scanner. This is what makes duplicates detectable.
- Across epochs, nullifiers can't be linked without the secret. The issuer doesn't have it either.
- A repeated nullifier means **the same pass was shown more than once in one epoch**. Usually that is a shared screenshot; occasionally it is a TC re-checking.
- **Pre-prover.** The phone generates proofs for the current epoch and the next **PREPROVE** epochs, only after the device has been unlocked. The lock-screen QR shows only proofs already cached. Proofs are never generated for past epochs.

## 7. Revocation

| Case | Mechanism | Takes effect |
|---|---|---|
| Lost phone, refund, fraud | Issuer sets the leaf to 0, writes a `Revocation` entity to Arkiv, and publishes the next root | Synced scanners and refreshed phones get the new root; the old root still works until its `expiresAt` (≤ **ROOT_TTL**) |
| Issuer key compromised | Authority calls `suspendIssuer` | At the scanner's next sync |
| Bad roots in circulation | Authority calls `setMinRootId(newFloor)`. The floor never decreases. It is global, so every active issuer must repost at once | At the scanner's next sync |

Shared screenshots are **not** revocable. Audit can count duplicates but cannot map a nullifier to a leaf.

## 8. Threat model

| Attack | Mitigation | Residual risk |
|---|---|---|
| **Screenshot / QR sharing** | Per-epoch nullifier. A second showing at the same scanner is Amber, a third is Red. Epochs are 10 min, and the skew window is only 120 s | Detected **per scanner only**. Cross-scanner sharing is visible in audit as a statistic, but can't be attributed to a pass. A friend at a different gate in the same epoch passes |
| **Replay of an old signed root** | Scanner checks `expiresAt`, `rootId ≥ floor`, and that the issuer is active | A revoked pass still works on its old root for up to **ROOT_TTL**, or until the floor is raised |
| **Malicious issuer: tagging** (a unique root per passenger, to recognise them at scans) | The passenger only accepts a signed root that it fetched **from Arkiv** and that its path verifies against. Root rate is limited to 1 per **ROOT_INTERVAL**. The audit page flags issuers that exceed it | An issuer could still split users across consecutive roots. That is bounded at 96 roots a day, and users converge to the latest root on refresh |
| **Malicious issuer: minting** | It can only mint its own passes. The authority can suspend it | Fake passes from a rogue issuer last until suspension plus the next sync |
| **Scanner log linkability** | The log stores only the nullifier, epoch and count, purged after 2 epochs. Batches have epoch granularity | Scanners that collude can link one pass **within one epoch**. That is by design and needed for audit |
| **Lost or stolen phone** | Secret is Keystore-wrapped and `allowBackup=false`. The lock screen shows only cached proofs (≤ **PREPROVE** epochs). User reports the loss and the issuer revokes | A thief with a locked phone gets about 2 h. A thief with an unlocked phone gets the pass until the next root takes effect |
| **Clock skew** | Adjacent epochs are accepted only within **SKEW** of the boundary. Scanners resync time at each online sync | Scanner drift above 120 s gives false Reds. Shown as reason `WRONG_EPOCH` |
| **Forged proof / vk swap** | Groth16 soundness. The vk hash is pinned in the APK and shown on the audit page | Demo-grade trusted setup: one phase-2 contribution |
| **Issuer server down, or refusing a passenger** (CROPS *C*) | Scanners verify from local data. Phones refresh paths from Arkiv, not from the issuer. The issuer can't single out one passenger, because refresh never contacts it | Existing passes keep working until the last signed root expires (≤ **ROOT_TTL**). New purchases and new roots stop. The authority can register a replacement issuer. This is the demo |
| **Network observers / RPC providers** (CROPS *P*) | Scanner RPC reads only public Registry state and learns nothing about passengers. Passenger app reads Arkiv; every passenger of an issuer sends the same query, with no leafIndex. RPC and Arkiv endpoints are configurable | The Arkiv/RPC provider sees the phone's IP and which issuer it uses, about once a day. Optional mitigation: anon-rpc or a user-chosen endpoint |
| **Scale limits** (stated in README) | Leaf download is 32 B × passes | About 32 MB at 1M passes. Production needs per-day delta batches or a private path service |

## 9. Parameters

| Name | Default | Notes |
|---|---|---|
| `MAX_DEPTH` | 20 | ~1M passes per issuer |
| `EPOCH` | 600 s | Balances screenshot window against proving/battery cost |
| `SKEW` | 120 s | Adjacent-epoch acceptance near the boundary |
| `DEBOUNCE` | 30 s | Same QR re-read by the camera |
| `PREPROVE` | 12 epochs | 2 h of cached proofs |
| `ROOT_TTL` | 36 h | Daily refresh plus 12 h grace |
| `ROOT_INTERVAL` | 15 min (production); **60 s in the demo deployment** | Minimum time between roots per issuer. Enforced **on-chain** by a Registry constructor parameter, and shown on the audit page |
| `EXPIRY_WARN` | 2 h | Amber when the root is this close to expiry |
| `STALE_WARN` | 24 h | Amber when the scanner hasn't synced for this long |
| `STALE_MAX` | 48 h | Red after this: the scanner must sync |
| `DAY_OFFSET` | 19,800 s (IST) | `day(t) = floor((t + DAY_OFFSET) / 86400)`, and `day(epochId) = day(epochId·EPOCH)`. 600 divides 19,800, so day boundaries fall on epoch boundaries |
| QR size | 427 B / 641 chars | Limit is 1.5 KB |
| Arkiv expiry | signed root: `expiresAt` + 1 h; leaf batch and revocation: latest `validUntilDay` in the batch + 1 d; scanner list: 7 d; vk: 30 d | The writer republishes before expiry. Expired passes drop out of public data on their own |
| Arkiv entities | `SignedRoot`, `LeafBatch`, `Revocation`, `ScannerList`, `VerifyKey` | Owner = writer's wallet (the issuer's address). Readers filter by `type`, `issuer` (an active issuer from the Registry), `rootId`. Full schema in `/arkiv/schema.md` |

## 10. Measurements (fill in from real runs)

| Metric | Target | Measured | Device / date |
|---|---|---|---|
| Constraint count | < 20k | — | — |
| Proving time, mid-range Android | < 3 s | — | — |
| Verify latency (steps 1–10) | < 1 s | — | — |
| QR version at level M | ≤ 20 | — | — |
| `postRoot` gas | small | — | — |
