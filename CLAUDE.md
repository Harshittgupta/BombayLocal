# CLAUDE.md — Unlink

Offline, privacy-preserving transit pass verification for ETHGlobal Mumbai. A passenger's phone proves "I hold a valid pass" with a Groth16 proof. A TC scanner checks it **offline** and learns one thing: **this pass is valid right now.**

Load these files on demand only; don't read them all every session:
- `SPEC.md` is the source of truth for parameters, byte layouts and verify steps. If it disagrees with this file, SPEC wins; flag the conflict.
- `docs/BUILD_PLAN.md`: modules, prompts, model and effort, timeline.
- `docs/BOUNTIES.md`: sponsor checklists, CROPS README draft, the demo. Read it at module reviews and in Module 10.
- `docs/HANDOFF.md`: read at the start of each module, append at the end.
- `docs/REVIEWS.md`: review log.

## IMPORTANT: Project rules (check at the end of EVERY task)

| # | Rule | Check |
|---|---|---|
| R1 | **Auditable public repo.** A stranger can build and run everything from the README alone. Pinned versions. No secrets in git | Fresh-clone test. `.env.example` exists and `.env` is gitignored. `git ls-files` has no keys |
| R2 | **Proper, timely commits.** One small commit per finished task, pushed the same day. Honest timestamps, no squash dumps. Message: `module-N: what changed` | `git log --format='%h %ad %s' --date=iso`. `git status` is clean |
| R3 | **Review after every task.** A hostile review by the `hostile-reviewer` subagent (fresh context) is logged in `docs/REVIEWS.md` with the commit hash | Every finished task has an entry |
| R4 | **Two separate Android apps.** `apps/passenger/` and `apps/scanner/`, each with its own Gradle project, `applicationId` and APK. No mode toggle. No cross-imports | Both build with `./gradlew assembleDebug` |
| R5 | **Real web3, no mocks.** Contract on Ethereum Sepolia with verified source. Real Arkiv writes **and** reads. Real Groth16 proving on the phone and verifying on the scanner. **Only** the pass purchase is simulated, and the README says so | Real-web3 audit below |
| R6 | **Two sponsors only.** EF *Best CROPS App* and *Build on Arkiv (from scratch)*. Hedera and World ID are out. Every feature serves one of the two | Feature-cut question before building |

**Real-web3 audit.** Any "no" is a blocker. Run it with the `rule-checker` subagent.
1. `deployments.json` address is verified on Sepolia Etherscan and has real txs.
2. The issuer calls `postRoot` on-chain.
3. Scanner sync reads the contract over RPC; nothing is hardcoded.
4. The issuer writes to Arkiv with the SDK, and the apps and page read back from Arkiv.
5. Proofs are generated **on the device** from the compiled circuit.
6. The scanner runs a **real** Groth16 verify; no `return true` or debug bypass.
7. `grep -rniE "mock|fake|stub|dummy|hardcod"` outside tests turns up only the documented mock purchase.
8. The README claims only what the demo shows.

**Never replace a real component with a mock to get past a blocker.** Stop, log the blocker in `docs/REVIEWS.md`, and tell the user. Allowed fallbacks are only other *real* implementations (see BUILD_PLAN §Fallbacks).

**Hackathon rule.** The project must be built from scratch during ETHGlobal Mumbai. Before hacking starts, only planning and config docs are allowed. No app, contract, circuit or issuer code.

## Invariants

1. **Privacy.** Nothing links a person across scans. No device ID, account ID, pass ID or leafIndex in the QR, scanner log, scan batches or any log line.
2. **Secret hygiene.** The secret is wrapped by Android Keystore. Never log or send it. `allowBackup=false`.
3. **Offline verification.** The scanner's verifier has **no networking imports**. Sync is a separate worker.
4. **No trackers.** No analytics, Firebase or Crashlytics. CI grep enforces this.
5. **Circuit ↔ JS ↔ Kotlin agreement.** Poseidon and the LeanIMT hashing and index rules must match across the circuit, `@zk-kit/lean-imt` and the phone. Shared fixtures live in `fixtures/vectors.json`. This is the #1 project killer.
6. **No under-constrained signals.** Use `<==` or `===`, never `<--` alone. Range checks on day values. Keep under 20k constraints.
7. **Honest claims.** State limitations before judges find them: per-scanner duplicate detection, demo-grade trusted setup, EOA authority.

## Core protocol (summary of SPEC.md v0.3)

- `idCommitment = Poseidon1(secret)` is computed on the phone; the secret never leaves it. The **issuer** builds `leaf = Poseidon3(idCommitment, validUntilDay, zoneClass)` from the paid product. `zoneClass ∈ {0,1,2}`.
- The tree is a Poseidon LeanIMT with MAX_DEPTH 20. Leaves (`LeafBatch`) and revocations (`Revocation`, with `seq`) are published to **Arkiv**. **The phone rebuilds the tree and computes its own path** from `leafCount` and `revSeq` on the `SignedRoot`, checks the signature, and accepts only the issuer's latest on-chain root (one `Registry.issuerState(issuer)` call; never moves backwards; respects the floor). The issuer posts a root at least every 6 h; passes are ≤ 90 days. Expired batches are zeroed, so Arkiv expiry never breaks the rebuild. Readers filter on `$creator` = `$owner` = issuer. The issuer is contacted only at purchase.
- Circuit private inputs: `secret, validUntilDay, depth, pathIndex, siblings[20]`. `pathIndex` is LeanIMT's compressed `proof.index`, not the leaf index; `depth = proof.siblings.length` and is constrained ≤ 20.
- `nullifier = Poseidon2(secret, epochId)`. EPOCH is 600 s. Adjacent epochs are accepted only within 120 s of the boundary.
- Public inputs, in order: `root, nullifier, epochId, currentDay, zoneClass`.
- Signed root: `{issuer, rootId, root, issuedAt, expiresAt, sig}`, EIP-191 over a 32-byte digest (encoding pinned in SPEC §3.3). `issuedAt` = on-chain `postedAt`, `expiresAt = issuedAt + 36 h` exactly. `rootId` is a global counter; the **floor is per issuer**.
- QR: 427 B, Base45, 641 chars, alphanumeric mode, version 16-M. Byte layout in SPEC §3.4. The scanner rejects non-canonical (≥ r) `root`/`nullifier`.
- Scanner steps are in SPEC §5. Results are Green, Amber or Red with a reason. Debounce only while the code stays in view (gap < 1 s).

## Interfaces (keep stable)

- **Registry**: pinned in SPEC §7.1. Summary:
  - `constructor(address authority, uint64 minRootInterval)`.
  - `addIssuer(address)` (never re-adds a suspended address), `suspendIssuer(address)`, `setMinRootId(address issuer, uint64 newFloor)`: authority only.
  - `postRoot(bytes32 root) returns (uint64 rootId)`: active issuer, `root != 0`, ids start at 1, interval skipped once after a floor raise.
  - Views: `issuers()`, `issuerState(address) → (active, floor, latestRoot, latestRootId, latestPostedAt)`, `isActive`, `floor(address)`, `rootCount()`.
  - Events: `IssuerAdded`, `IssuerSuspended`, `RootPosted(issuer, rootId, root, postedAt)`, `FloorRaised(issuer, old, new)`.
- **Issuer HTTP**: `POST /purchase {idCommitment, product}` → `{leafIndex, validUntilDay, zoneClass}`. `POST /scan-batches`. `POST /admin/revoke`. `POST /admin/publish-root`. No refresh endpoint.
- **Arkiv**:
  - Writer: `publishRoot`, `publishLeafBatch`, `publishRevocation`, `publishScannerList`, `publishVk`.
  - Reader: latest signed root per issuer, plus leaf batches and revocations, always filtered on `$creator` = `$owner` = issuer.
- **Passenger**: `ProverService`, `KeystoreSecretStore`, `PassRepository`, `RefreshWorker`, `EpochScheduler`.
- **Scanner**: `OfflineVerifier.verify(qrText, now) → Result(Green|Amber|Red, reason)`, `LocalStore`, `SyncWorker`.

## Repo layout

`SPEC.md`, `README.md`, `DEMO.md`, `LICENSE` (MIT), `deployments.json`, `fixtures/`, `circuits/`, `contracts/`, `issuer/`, `apps/passenger/`, `apps/scanner/`, `audit/index.html`, `arkiv/` (schema, friction, reach, why-arkiv, how-you-use-arkiv), `scripts/`, `docs/`, `.claude/agents/`, `.claude/skills/`. Create folders only when their module starts.

## Commands (fill these in only after they've actually run)

```
# protocol:  cd protocol && npm ci && npm test            (vitest; also: npm run typecheck)
# circuits:  cd circuits && npm ci && npm run build       (needs circom 2.2.3 on PATH; compile → info → ptau → setup → contribute → vkey → artifacts)
#            cd circuits && npm run prove-sample           (proves + verifies with committed circuits/artifacts/)
# contracts: cd contracts && forge test -vv            (needs foundry; forge snapshot for gas)
#            forge create src/Registry.sol:Registry --rpc-url $SEPOLIA_RPC_URL_BACKUP \
#              --private-key 0x$AUTHORITY_PRIVATE_KEY --broadcast --verify \
#              --etherscan-api-key $ETHERSCAN_API_KEY --constructor-args <authority> 60
#            (use the publicnode RPC; the Alchemy key under-estimates creation gas. deployments.json has the live address)
# issuer:    cd issuer && npm ci && npm test            (vitest; node:sqlite, real circuit proof)
#            cd issuer && npm start                      (Fastify + 6 h heartbeat; reads ../.env: ISSUER_PRIVATE_KEY, ADMIN_TOKEN, SEPOLIA_RPC_URL_BACKUP, ARKIV_*)
#            cd issuer && npm run publish-root           (Arkiv batches/revocations -> postRoot on Sepolia via publicnode -> Arkiv SignedRoot)
# arkiv:     cd issuer && npm run arkiv-roundtrip        (REAL Rabdi + Sepolia: publish, read back, rebuild == signed == on-chain root)
#            cd issuer && npm run arkiv-expiry           (2-minute entity, gone after its expiry block; ~2.5 min)
# apps:      ./gradlew assembleDebug   (inside each app)
```

## Working rules

- One module per session. Start with `/clear`, then read `docs/HANDOFF.md`.
- **Plan mode** first for multi-file work: a plan of 10 bullets or fewer, approval, then code. Skip the plan for one-line changes.
- Read only the SPEC sections the module needs. Use subagents for doc research and exploration, so their output stays out of the main context.
- Give files or diffs, not essays. Don't regenerate unrelated files. No placeholder TODOs in delivered code.
- For unfamiliar tools (Arkiv, mopro, faucets), read the current docs first and never invent API calls.
- Debug from the first 20 lines of a stack trace.
- **Finish every task with `/finish-task`**: tests → commit and push → hostile review → REVIEWS.md → rule check → HANDOFF.md.
- When compacting, preserve: the module number, files changed, test commands, open blockers.
