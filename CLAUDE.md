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

## Core protocol (summary of SPEC.md v0.2)

- `idCommitment = Poseidon1(secret)` is computed on the phone; the secret never leaves it. The **issuer** builds `leaf = Poseidon3(idCommitment, validUntilDay, zoneClass)` from the paid product.
- The tree is a Poseidon LeanIMT with MAX_DEPTH 20. Leaves and revocations are published to **Arkiv**. **The phone rebuilds the tree and computes its own path**, and checks it against the signed root from Arkiv. The issuer is contacted only at purchase.
- `nullifier = Poseidon2(secret, epochId)`. EPOCH is 600 s. Adjacent epochs are accepted only within 120 s of the boundary.
- Public inputs, in order: `root, nullifier, epochId, currentDay, zoneClass`.
- Signed root: `{issuer, rootId, root, issuedAt, expiresAt, sig}`, EIP-191 signed, ROOT_TTL 36 h. `rootId` is a global counter in the Registry.
- QR: 427 B, Base45, 641 chars. Byte layout in SPEC §3.4.
- Scanner steps are in SPEC §5. Results are Green, Amber or Red with a reason.

## Interfaces (keep stable)

- **Registry**:
  - `addIssuer(address)`, `suspendIssuer(address)` (authority only).
  - `postRoot(bytes32) returns (uint64 rootId)` (active issuer; global counter).
  - `setMinRootId(uint64)` (authority only; never decreases).
  - Views: `isActive`, `latestRoot(address)`, `floor()`. Events on every change.
- **Issuer HTTP**: `POST /purchase {idCommitment, product}` → `{leafIndex, validUntilDay, zoneClass}`. `POST /scan-batches`. `POST /admin/revoke`. `POST /admin/publish-root`. No refresh endpoint.
- **Arkiv**:
  - Writer: `publishRoot`, `publishLeafBatch`, `publishRevocation`, `publishScannerList`, `publishVk`.
  - Reader: latest signed root per issuer, plus leaf batches and revocations.
- **Passenger**: `ProverService`, `KeystoreSecretStore`, `PassRepository`, `RefreshWorker`, `EpochScheduler`.
- **Scanner**: `OfflineVerifier.verify(qrText, now) → Result(Green|Amber|Red, reason)`, `LocalStore`, `SyncWorker`.

## Repo layout

`SPEC.md`, `README.md`, `DEMO.md`, `LICENSE` (MIT), `deployments.json`, `fixtures/`, `circuits/`, `contracts/`, `issuer/`, `apps/passenger/`, `apps/scanner/`, `audit/index.html`, `arkiv/` (schema, friction, reach, why-arkiv, how-you-use-arkiv), `scripts/`, `docs/`, `.claude/agents/`, `.claude/skills/`. Create folders only when their module starts.

## Commands (fill these in only after they've actually run)

```
# circuits:  TBD (Module 2)
# contracts: TBD (Module 3)
# issuer:    TBD (Module 4)
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
