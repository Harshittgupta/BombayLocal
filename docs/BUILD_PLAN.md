# Unlink: Build Plan (step by step, with prompts, reviews, model and effort)

Written for **Claude Code** (terminal, desktop or VS Code) on a paid Claude plan. Every module has a timebox, the model and effort to use, a copy-paste prompt, a "done when" check, and the review. Prompts are short on purpose: `CLAUDE.md` loads by itself, and the prompts point Claude at files instead of pasting them. That is the biggest token saving.

> **Check the event schedule first.** Public listings put ETHGlobal Mumbai at **6 Nov 2026**. ETHGlobal hackathons usually run about **36 hours** from "hacking starts" to "submissions due". Confirm the exact times on ethglobal.com and rewrite the `H+` times in §3 as clock times.

**Assumptions:**
- A solo builder with Claude Code. With teammates, see §8.
- A Windows laptop. Run all Node, Circom, Foundry and Rust tooling in **WSL2 Ubuntu**; run Android Studio on Windows.
- **Two physical Android phones**: one passenger, one scanner.

---

## 1. Which Claude, which effort, and why

Set the model with `/model opus`, `/model sonnet` or `/model haiku`. Set effort with `/effort <low|medium|high|xhigh|max>`; both commands also open pickers. Opus 5.5 and Sonnet 5.5 default to `medium`. Add the word **`ultrathink`** to a single prompt for one deep turn without raising the session's effort. **Never use `max`**: it burns usage and isn't needed here.

| Work | Model · effort | Why |
|---|---|---|
| Spec review, threat model, circuit **design** | **Opus 5.5 · xhigh** | One mistake here breaks everything later |
| Circuit **tests**, fixtures, build scripts | Sonnet 5.5 · medium | Mechanical once the design is right |
| Contract code and tests | Sonnet 5.5 · medium | Small, well-specified |
| Issuer service | Sonnet 5.5 · medium | Standard TypeScript |
| Arkiv integration (new SDK) | Sonnet 5.5 · **high** | Unfamiliar API; must read docs and not guess |
| Mobile ZK spike (prover and verifier on Android) | Sonnet 5.5 · high → **Opus 5.5 · xhigh** if stuck after 2 tries | Riskiest integration |
| Android UI, storage, workers | Sonnet 5.5 · medium | Standard Kotlin |
| Scanner `OfflineVerifier` | Sonnet 5.5 · high | Security-critical logic |
| Audit page, boilerplate, renames, formatting | Sonnet 5.5 · low (or Haiku 5.5 · low) | Cheap work |
| Cross-module bug that resists 2 attempts | Opus 5.5 · high | Needs reasoning across modules |
| **Hostile review** after each task | `hostile-reviewer` subagent: Opus · high (Sonnet · medium for M0, M8 and docs) | Fresh context, so the reviewer doesn't grade its own work |
| **Rule check** after each task | `rule-checker` subagent: Sonnet · low | It just runs commands |
| Docs research (Arkiv, mopro, Etherscan) | `docs-researcher` subagent: Sonnet · medium | Keeps page dumps out of your main context |
| README, `/arkiv` files | Sonnet 5.5 · medium | Writing from real data |
| Judge Q&A and final judge review | Opus 5.5 · high | Finds overclaims |

You don't need Fable 5.1 for this project.

**Optional paid deep review.** `/code-review ultra` runs a multi-agent cloud review and comes with **3 free runs** on Pro and Max. After those, it's billed as usage credits (typically $5–25 a run). Spend the free runs on the circuit (M2), the verifier (M7) and the final repo: put each on a branch, open a PR, and run `/code-review ultra <PR#>`.

### Token rules (follow them every module)
1. **One module = one session.** `/clear`, then the module prompt. Never carry a long thread forward.
2. **Plan mode first** for multi-file work: press `Shift+Tab` until "plan mode on" shows. Approve a plan of 10 bullets or fewer, then implement. Skip planning for one-line fixes.
3. **Point, don't paste.** "Read SPEC.md §4" beats pasting SPEC. `@file` references work in prompts.
4. **Subagents for reading.** Docs research, codebase exploration and reviews run in their own context and return a summary.
5. **Errors:** paste only the first 20 lines of a stack trace.
6. **After 2 failed corrections**, `/clear` and rewrite the prompt with what you learned. Don't argue in a polluted context.
7. **Use `/btw`** for side questions; the answer doesn't enter the conversation history.
8. **Use `/compact <what to keep>`** if a module runs long.
9. **`docs/HANDOFF.md`** carries state between modules (10 lines each), so nobody re-explains the project.
10. Put xhigh and `ultrathink` only where the table says.

---

## 2. Tonight, before hacking starts (no project code allowed)

**Rule:** before the start, only planning and config. No circuit, contract, app or issuer code in the repo. Check ETHGlobal's rules on this.

**Accounts and funds.** These are the real-web3 blockers, so get them tonight:
- [ ] **GitHub** account. Run `gh auth login` in WSL.
- [ ] **Two fresh wallets**: *authority* and *issuer*. Never reuse a personal wallet. Keep the keys only in a `.env` that never gets committed.
- [ ] **Sepolia ETH** in both wallets, about 0.3 ETH each. Some faucets need a mainnet balance or an account, so try several tonight.
- [ ] **Etherscan API key**, for `forge verify-contract`.
- [ ] **Arkiv**: read https://docs.arkiv.network. Note the current testnet name, RPC URL, chain id and faucet, and fund the issuer wallet there. Optionally install Arkiv's AI tools (MCP and plugin) from https://hub.arkiv.network/ai-tools so Claude reads real Arkiv docs.
- [ ] A **Sepolia RPC URL**: a public RPC, plus one backup from a different provider (the demo shows that the RPC can be swapped).

**Tools (in WSL2 Ubuntu unless noted):**
- [ ] Node LTS (pin it in `.nvmrc`), and pnpm or npm.
- [ ] Rust (for circom and mopro). Build circom 2.x from source and note the version. `npm i -g snarkjs` (note the version).
- [ ] Foundry: `foundryup`.
- [ ] Android Studio, Android SDK and NDK (on Windows). `adb` must see both phones with USB debugging on.
- [ ] Optional toolchain smoke test: build **mopro's own example app** (not our code) from its docs, to see whether the Rust→Android toolchain works on your machine. If it fights you tonight, plan for the WebView fallback (§6).

**Phones:**
- [ ] Both are in developer mode. Note each phone's model and Android version; they go into SPEC §10.
- [ ] Charger, cable, mobile hotspot (venue Wi-Fi fails).

**Claude Code setup (config only, allowed):**
- [ ] Put `CLAUDE.md`, `SPEC.md`, `docs/*`, `.claude/agents/*` and `.claude/skills/finish-task/` in the repo folder.
- [ ] Run `claude`, then `/context`, to confirm CLAUDE.md loaded. Run `/agents` to confirm the 3 subagents are listed.

---

## 3. Timeline (≈36 h; replace H+ with real clock times)

| H+ | Module | Checkpoint / cut decision |
|---|---|---|
| 0:00–0:30 | **M0** Repo bootstrap | Repo public, first commit pushed |
| 0:30–1:30 | **M1** Spec hostile review and freeze | SPEC v0.3 committed |
| 1:30–5:30 | **M2** Circuit + protocol lib + fixtures | **Gate:** all circuit tests green, `fixtures/vectors.json` exists |
| 5:30–8:30 | **M3** Mobile ZK spike (riskiest, so done early) | **Decision at H+8:30:** native (mopro) or WebView (§6). No third option |
| 8:30–10:00 | **M4** Registry contract, deployed and verified | Etherscan link works |
| 10:00–13:30 | **M5** Issuer service | Purchase → root on-chain |
| 13:30–16:30 | **M6** Arkiv layer | Round trip on the real testnet. `friction.md` has entries |
| 16:30–19:30 | 💤 **Sleep 3 h** (non-negotiable; tired coding costs more than it saves) | — |
| 19:30–24:00 | **M7** Passenger app | Lock-screen QR from a real proof |
| 24:00–28:30 | **M8** Scanner app | Green, Amber and Red from real QRs in airplane mode |
| 28:30–29:30 | **M9** Audit page | Loads with only a public RPC |
| 29:30–32:00 | **M10** Integration, preflight, 3 rehearsals, measurements | 3 clean runs |
| 32:00–34:30 | **M11** README, `/arkiv` files, Q&A, video, submission | Submitted with ≥ 1 h left |
| 34:30–36:00 | Buffer | — |

**Cut order if you are behind at H+16:**
1. Audit-page polish.
2. Optional extras (aggregate stats).
3. The scanner settings screen (keep the endpoints in config).
4. Amber "near expiry" UI polish.

**Never cut:** the circuit, a real on-device proof, the offline verifier, the nullifier log, the kill-the-issuer demo, the 5 `/arkiv` files, the CROPS README section.

---

## 4. The ritual for every module

1. In the terminal: `/clear`, then `/model …` and `/effort …` from the table.
2. Paste the module prompt. It always starts by reading `docs/HANDOFF.md`.
3. Plan mode → approve the plan → implement → Claude runs the "done when" checks and **shows the output**.
4. Run **`/finish-task module-N <short name>`** (`.claude/skills/finish-task`). It runs:
   1. Tests.
   2. One small commit and push.
   3. A `hostile-reviewer` subagent on the diff.
   4. Fixes for confirmed findings only, committed separately.
   5. A `docs/REVIEWS.md` entry.
   6. The `rule-checker` subagent (R1–R6 plus the real-web3 audit).
   7. A 10-line handoff appended to `docs/HANDOFF.md`.
   8. A final push.
5. Any **FAIL** in the rule check means the module isn't done. Fix it before moving on.

---

## 5. Modules and prompts

### M0 · Repo bootstrap (30 min) · Sonnet 5.5 · low

```
Module 0: repo bootstrap. Read CLAUDE.md only. Do exactly this, no app code:
1. git init (branch main) if needed. Create a PUBLIC GitHub repo "unlink" with gh and set origin.
2. LICENSE: MIT, 2026, holder "<YOUR NAME>".
3. .gitignore: node_modules, .env, *.keystore, *.jks, local.properties, build/, .gradle/,
   .idea/, *.ptau, circuits/build/tmp/, out/, cache/. Do NOT ignore final circuit artifacts
   (pass.wasm, pass_final.zkey, verification_key.json): they get committed in M2 so the repo builds alone (R1).
4. .env.example with commented keys: SEPOLIA_RPC_URL, SEPOLIA_RPC_URL_BACKUP, ETHERSCAN_API_KEY,
   AUTHORITY_PRIVATE_KEY, ISSUER_PRIVATE_KEY, ARKIV_RPC_URL, ARKIV_CHAIN_ID, ISSUER_PORT.
5. .nvmrc with the Node version I have (run node -v).
6. .github/workflows/ci.yml with two jobs that run on push:
   - no-trackers: fail if grep -rniE "analytics|firebase|crashlytics|mixpanel|amplitude|sentry|mlkit" apps/ matches.
   - no-mocks: fail if grep -rniE "mock|fake|stub|dummy|hardcod" outside test dirs, fixtures/ and docs/
     matches anything except issuer/src/purchase.ts.
   Later modules append their own test jobs.
7. README.md skeleton with ONLY these headings: Problem, How it works, Quickstart, Demo, CROPS,
   Arkiv, Threat model and limitations, Path to production, AI-use disclosure, License.
8. Add an AI-use line to the README now: "Built with Claude Code (Anthropic); see docs/REVIEWS.md."
Commit "module-0: repo bootstrap", push, show git log -1 and the repo URL.
```
**Done when:** the repo URL opens and CI runs green.
**Review:** `/finish-task module-0 bootstrap`, with the reviewer on **sonnet**.

---

### M1 · Spec hostile review and freeze (1 h) · Opus 5.5 · xhigh

```
Module 1: freeze SPEC.md. Read docs/HANDOFF.md, then SPEC.md fully.
Use the hostile-reviewer subagent on SPEC.md. ultrathink about these specifically:
a) Soundness: is the nullifier bound to the SAME secret as the leaf? Can any public input be
   chosen freely to fake validity (currentDay, zoneClass, epochId)?
b) @zk-kit/lean-imt: does it allow updating a leaf to 0 for revocation? Use the docs-researcher
   subagent to check the current README and source. If not, propose the smallest change.
c) QR: recount the 427 bytes against §3.4; confirm Base45 length and that no field is a stable ID.
d) Global rootId plus a global floor with several issuers: any ordering attack?
e) Arkiv expiry: is it in seconds or blocks in the current docs? Fix §9 to match.
f) The Registry needs ROOT_INTERVAL enforced on-chain as a constructor parameter (demo value 60 s,
   documented). Add it to §9.
Output: a findings table (issue, severity, fix). Then apply ONLY the accepted fixes to SPEC.md,
bump it to v0.3, and update the CLAUDE.md "Core protocol" lines if anything changed.
```
**Done when:** SPEC v0.3 is committed, and every item in its "Choices" list still holds or was explicitly changed.
**Review:** `/finish-task module-1 spec-freeze`.

---

### M2 · Circuit, protocol library and fixtures (4 h)

**Step 2a: design and build.** Opus 5.5 · xhigh · plan mode.
```
Module 2a: circuit. Read docs/HANDOFF.md and SPEC.md §3.1, §3.2, §4, §6, §9.
Build, in WSL paths:
1. protocol/  (TypeScript npm package, used by circuits tests, issuer, scripts and audit page):
   constants from SPEC §9; day(t) and epochId(t) with DAY_OFFSET; poseidon1/2/3 via poseidon-lite
   (pin the exact version); buildTree(leaves) with @zk-kit/lean-imt using poseidon2 (pin);
   merkleProof(tree, index) → {depth, indices[20], siblings[20]} padded EXACTLY the way the circuit
   template expects; nullifier(secret, epochId). Unit tests with vitest.
2. circuits/pass.circom (circom 2.x, pinned): circomlib Poseidon, plus the zk-kit binary-merkle-root
   circom template. Before using it, read its source in node_modules: confirm the template name,
   signal names and how padding and depth work.
   Public inputs in this exact order: root, nullifier, epochId, currentDay, zoneClass.
   Private inputs: secret, validUntilDay, depth, indices[20], siblings[20].
   Constraints exactly as SPEC §4. No signal assigned with <-- alone.
3. circuits/package.json scripts, all reproducible:
   compile (r1cs, wasm, sym) → info (print the constraint count) → ptau (download the smallest Hermez
   powers-of-tau file that fits, with sha256 check; the URL comes from the snarkjs README) →
   setup (groth16) → contribute (one contribution, entropy from /dev/urandom, documented as demo-grade)
   → export vkey → copy pass.wasm, pass_final.zkey and verification_key.json into circuits/artifacts/
   (committed).
4. circuits/scripts/prove-sample.ts: 8-leaf tree, prove leaf 3 with snarkjs groth16.fullProve,
   verify, print the public signals and proving time.
Pin every dependency to an exact version. Run everything and show the outputs.
```

**Step 2b: tests and fixtures.** `/clear` · Sonnet 5.5 · medium.
```
Module 2b: circuit tests and fixtures. Read docs/HANDOFF.md, SPEC.md §4 and §6, circuits/pass.circom, protocol/.
Write mocha or vitest tests in circuits/test/ (real proofs, no mocks):
1 valid proof verifies; 2 wrong secret fails; 3 wrong path fails; 4 wrong root fails;
5 changing epochId changes the nullifier; 6 same secret + epoch → same nullifier;
7 different epochs → different nullifiers; 8 validUntilDay < currentDay → cannot prove;
9 wrong zoneClass → fails; 10 tampering any one public signal → verify false;
11 LeanIMT agreement: trees of 1, 2, 3, 5, 8 and 1000 leaves, prove the first, middle and LAST leaf
   (the last leaf of an odd tree is the promotion case);
12 a revoked (0) neighbour leaf doesn't break other leaves' proofs;
13 nullifier from protocol/ equals the circuit's public nullifier;
14 public-signal order equals SPEC §4.
Print the constraint count and median proving time over 5 runs; write both into SPEC.md §10.
Then write scripts/make-fixtures.ts → fixtures/vectors.json with 5 cases. Each case has:
secret, idCommitment, validUntilDay, zoneClass, leaf, leaves[], leafIndex, root, depth,
indices, siblings, epochId, currentDay, nullifier, proof (snarkjs JSON), publicSignals.
Add poseidon1/2/3 test vectors. The Kotlin apps test against this file.
Add a CI job: circuits tests + protocol tests.
```
**Done when:**
- All 14 tests pass, including the negative ones.
- The constraint count (< 20k) and prove time are in SPEC §10.
- `fixtures/vectors.json` is committed.
- CI is green.

**Review:** `/finish-task module-2 circuit`. The reviewer prompt adds: under-constrained signals, `Num2Bits` aliasing, boolean constraints on `indices`, the depth bound, and that the secret is < 2^248. Optional: `/code-review ultra` on the M2 PR (free run 1).

---

### M3 · Mobile ZK spike (3 h, strict timebox) · Sonnet 5.5 · high (→ Opus 5.5 · xhigh after 2 failed tries)

**Goal:** prove that a **real** proof can be made on the phone and verified on the phone, and that Poseidon and tree building on the phone match `fixtures/vectors.json`. Only then build the apps.

**Step 3a: research.**
```
Module 3a: use the docs-researcher subagent to write docs/notes/mobile-zk.md (≤ 60 lines,
exact commands and URLs, nothing invented) comparing, for Circom + Groth16 on Android (Kotlin):
A) mopro (zkmopro): setup, the circom adapter, generating Kotlin bindings, ABIs, prove AND verify APIs,
   whether it exposes Poseidon.
B) snarkjs + pass.wasm running on-device in an Android WebView (or androidx.javascriptengine if it
   supports WASM): bundling with esbuild, passing inputs and outputs, prove and verify.
For each: what we need for Poseidon1/2/3 and LeanIMT rebuild on the phone. Prefer running the SAME
protocol/ JS bundle on the phone, so hashing matches by construction (CLAUDE.md invariant 5).
```

**Step 3b: build the spike** inside `apps/passenger/` as the real start of `ProverService`, not throwaway code.
```
Module 3b: read docs/notes/mobile-zk.md and fixtures/vectors.json case 0. Plan in 8 bullets, then build:
1. apps/passenger/ Android project (Kotlin, Compose, minSdk 28, applicationId xyz.unlink.passenger).
2. ProverService(input) → {proof, publicSignals} using option A (mopro) first.
3. An instrumented test: prove fixture case 0 on the real phone, assert publicSignals == fixture,
   verify on-device, and log the proving time (no secrets in logs).
4. ProtocolEngine: poseidon1/2/3 and buildTree + merkleProof on the phone; test that it equals the fixtures.
Timebox: if A isn't producing a verified proof by H+7:30, switch to option B and say so.
Record the result and proving time in SPEC §10 and write the decision to docs/HANDOFF.md.
```
**Done when:** a proof generated on the phone verifies, the phone's Poseidon and tree output equals the fixtures, and proving time is recorded.

**Decision:** native or WebView. **Both are real on-device Groth16; neither is a mock.** The scanner uses the same engine for verify.

**Review:** `/finish-task module-3 mobile-zk-spike`.

---

### M4 · Registry contract (1.5 h) · Sonnet 5.5 · medium

```
Module 4: Registry. Read docs/HANDOFF.md, SPEC.md §2, §3.3, §7, §9, and the Registry interface in CLAUDE.md.
contracts/ with Foundry (pin the solc version, ^0.8.24, no upgradeability, no owner transfer):
- constructor(address authority, uint64 minRootInterval)
- addIssuer, suspendIssuer (authority only); re-adding a suspended issuer is allowed.
- postRoot(bytes32 root) returns (uint64 rootId): active issuer only; rootId = ++nextRootId (global);
  requires block.timestamp >= lastPost[issuer] + minRootInterval; stores latest {root, rootId, postedAt}.
- setMinRootId(uint64): authority only, must be > the current floor.
- Views: isActive(address), latestRoot(address) → (root, rootId, postedAt), floor(), nextRootId().
- Custom errors; events IssuerAdded, IssuerSuspended, RootPosted(issuer, rootId, root, postedAt),
  FloorRaised(old, new); NatSpec on everything. Nothing per pass.
Foundry tests: access control on all 3 authority functions; a suspended issuer cannot post; rootId
strictly increases across 2 issuers; interval enforced; floor cannot decrease or stay equal; views and
events correct; fuzz test on postRoot ordering. Run forge test -vv and forge snapshot.
script/Deploy.s.sol: deploy with minRootInterval=60 (demo, documented) and addIssuer(ISSUER address).
Then actually deploy to Sepolia with --broadcast --verify using .env. Write deployments.json:
{ sepolia: { chainId, registry, authority, issuer, deployTx, addIssuerTx, block, minRootInterval } }.
Fill in the contracts line of the CLAUDE.md Commands section. Show the Etherscan URL.
```
**Done when:**
- Tests are green.
- The contract is deployed with **verified source**, and the `addIssuer` tx shows on Etherscan.
- `postRoot` gas is in SPEC §10.
- The CI job is added.

**Review:** `/finish-task module-4 registry`. The reviewer is Opus · high; check access control, the floor logic, and that storage is never per pass.

---

### M5 · Issuer service (3.5 h) · Sonnet 5.5 · medium

```
Module 5: issuer. Read docs/HANDOFF.md, SPEC.md §3, §5 (scan batch), §7, §9, deployments.json, protocol/.
issuer/ (TypeScript, Fastify, better-sqlite3, ethers v6, pino; exact versions; uses ../protocol):
DB tables (nothing personal, ever):
  purchases(id, product, createdAt, leafIndex)   -- no name, phone, email or IP
  leaves(leafIndex, leaf, validUntilDay, revoked)
  roots(rootId, root, issuedAt, expiresAt, signature, txHash)
  scan_nullifiers(epochId, nullifier, scannerPubKey)   -- only what batches contain
Products config (products.json): day-pass (1 day, class 0), month-pass (30 days, class 0),
month-first (30 days, class 1).
Endpoints:
  POST /purchase {idCommitment, product}: validate idCommitment < field; SIMULATED payment
    (src/purchase.ts header comment says so); compute validUntilDay from day(now) + duration;
    leaf = poseidon3(idCommitment, validUntilDay, zoneClass); append; return {leafIndex, validUntilDay, zoneClass}.
  POST /admin/revoke {leafIndex} and POST /admin/publish-root: admin-token header from .env.
  POST /scan-batches {scannerPubKey, epochId, nullifiers[], sig}: verify sig; accept only scanner keys
    in our published list; store; return duplicate count.
Publisher: rebuild the tree (revoked leaves = 0), call Registry.postRoot on Sepolia, wait for the receipt,
read rootId from the RootPosted event, sign per SPEC §3.3 (EIP-191, exact packed encoding), store.
Expose an internal hook publishToArkiv(signedRoot, newLeaves, revocations); Module 6 implements it.
Logging: pino with redact. Log lines contain counts and rootIds only, never idCommitment, leaf or leafIndex.
Tests (vitest, real Sepolia only in an opt-in e2e test):
 a path for a purchased leaf proves in the circuit (use protocol/ and circuits/artifacts);
 standalone signature verify recovers the issuer address; a revoked leaf is absent from the next root;
 malformed idCommitment is rejected; no column in the schema can hold personal data;
 log output for a purchase contains no idCommitment.
Run the publisher once against Sepolia for real and show the tx hash.
```
**Done when:** all 6 review-gate checks pass, a real `postRoot` tx is on Etherscan, and the log sample shows nothing identifying.

**Review:** `/finish-task module-5 issuer`.

---

### M6 · Arkiv data layer (3 h) · Sonnet 5.5 · high

**Step 6a: docs first.**
```
Module 6a: use the docs-researcher subagent to read https://docs.arkiv.network and the
@arkiv-network/sdk README (and the Arkiv AI tools/MCP if installed). Write docs/notes/arkiv.md (≤ 60 lines):
current testnet name, chain id, RPC URL, faucet, SDK install, create entity (payload, attributes,
expiry and its UNIT), update/delete rules and ownership, query syntax with filters, payload size limits,
JSON-RPC equivalents for Kotlin reads, one example query. Quote URLs. Mark anything unclear UNKNOWN.
Start arkiv/friction.md now: log every surprise as Expected / Actual / Repro / Suggestion.
```

**Step 6b: build.**
```
Module 6b: read docs/notes/arkiv.md, SPEC.md §3.1, §3.3, §9, issuer/src (publishToArkiv hook).
Implement issuer/src/arkiv/ with ONLY API calls shown in the notes:
 writer: publishRoot(signedRoot), publishLeafBatch(leaves, fromIndex), publishRevocation(leafIndex),
   publishScannerList(pubKeys), publishVk(vk). Every entity has attributes app="unlink", v=1,
   type, issuer, plus rootId / batchNo / fromIndex / leafIndex as relevant. Expiry per SPEC §9.
   Split leaf batches to fit the payload limit.
 reader: latestSignedRoot(issuer), leafBatches(issuer), revocations(issuer), scannerList(), vk().
Wire publishToArkiv into the publisher. scripts/arkiv-roundtrip.ts runs on the REAL testnet:
publish → read back → rebuild the tree from Arkiv data with protocol/ → assert root == signed root
→ print entity keys, the writer address and ONE query a judge can run (copy it into README later).
Show that an entity with a 2-minute expiry is gone after it expires.
Write arkiv/schema.md (entities, attributes we filter on, owner, expiry, payload). Add friction notes.
```
**Done when:**
- The round trip works on the real testnet, and the rebuilt root matches.
- Expiry is shown working.
- `schema.md` exists and `friction.md` has at least 3 real entries.

**Review:** `/finish-task module-6 arkiv`.

---

### M7 · Passenger app (4.5 h) · Sonnet 5.5 · medium

```
Module 7: passenger app. Read docs/HANDOFF.md, SPEC.md §3, §6, §8 (lost phone), docs/notes/arkiv.md,
docs/notes/mobile-zk.md, and apps/passenger/ as it stands. Plan in 10 bullets, then build:
1. KeystoreSecretStore: an AES-GCM key in Android Keystore wraps the 248-bit secret. Never logged.
   allowBackup=false plus dataExtractionRules excluding everything.
2. Purchase screen (plain words: "Buy day pass", "Buy month pass"; the word "simulated payment" shown):
   generate secret → idCommitment (ProtocolEngine) → POST /purchase → store {leafIndex, validUntilDay, zoneClass}.
3. RefreshWorker (WorkManager, daily + on app open + a manual "Refresh" button): read from Arkiv over
   JSON-RPC ONLY (never the issuer server): latest signed root for our issuer, leaf batches, revocations →
   rebuild the tree → require computed root == signedRoot.root and a valid issuer signature →
   store path + signed root. On mismatch keep the old root and show "Couldn't update; your pass still works until <time>".
4. EpochScheduler: on unlock (ACTION_USER_PRESENT) and app start, pre-generate proofs for the current and
   the next 12 epochs (SPEC PREPROVE) → build the 427-byte QR payload (SPEC §3.4) → Base45 → cache in
   app-private storage. Never generate proofs for past epochs.
5. Lock-screen QR: QrActivity with setShowWhenLocked(true) and setTurnScreenOn(true), max brightness,
   QR (ZXing core, error correction M), opened from a persistent lock-screen-visible notification.
   It shows the cached proof for the current epoch. Test on the real phone that it opens WITHOUT
   unlocking; if the notification route needs unlock on this phone, try a Quick Settings tile and report.
6. Pass screen: "Valid until <date>", "Ready offline ✓", last refreshed time. No crypto words anywhere.
7. Settings: Arkiv RPC URL and issuer URL (defaults from BuildConfig); no other config.
8. Zero analytics; logs only state names, never secret, leaf, leafIndex or nullifier.
Tests: instrumented — fixture case 0 → QR payload decodes back to the same fields; refresh rejects a
tampered root; secret absent from logcat (assert via a log capture). Build the debug APK.
```
**Done when:**
- A real proof is shown on the lock screen with the phone locked.
- With airplane mode on, the pass still shows and the QR renders.
- The CI tracker grep is clean.
- The proving time on the real phone is in SPEC §10.

**Review:** `/finish-task module-7 passenger-app`.

---

### M8 · Scanner app (4.5 h)

**Step 8a: OfflineVerifier.** Sonnet 5.5 · high · plan mode.
```
Module 8a: verifier. Read docs/HANDOFF.md, SPEC.md §3.3, §3.4, §5, §6, §9, docs/notes/mobile-zk.md.
Create apps/scanner/ as its OWN Android project (applicationId xyz.unlink.scanner; never import passenger code).
Inside it, a pure Kotlin/JVM Gradle module :verifier with NO android.* and NO networking dependency
(add a test that fails if java.net, okhttp or ktor are on its classpath).
OfflineVerifier.verify(qrText, now, store): implement SPEC §5 steps 1–10 EXACTLY, in order, with the
reason codes as an enum. Groth16 verify via the engine chosen in M3 (behind an interface the app provides).
EIP-191 recover via org.web3j:crypto only. Base45 decode.
Write scripts/make-qr-fixtures.ts (TypeScript, uses protocol/ and a test issuer key) → fixtures/qr/*.json,
each with qrText, now, storeState and expected {result, reason}. Cases: valid; expired root; root near expiry
(Amber); suspended issuer; below floor; unknown higher rootId accepted; bad signature; bad proof;
tampered nullifier; wrong epoch; skew boundary at ±119 s accepted and ±121 s rejected; 2nd showing Amber;
3rd showing Red; debounce within 30 s; scanner stale 25 h Amber and 49 h Red; wrong class; malformed.
Unit tests run every fixture through verify() and assert. Measure verify latency.
```

**Step 8b: app.** `/clear` · Sonnet 5.5 · medium.
```
Module 8b: scanner app. Read docs/HANDOFF.md, apps/scanner/verifier API, docs/notes/arkiv.md, deployments.json.
1. LocalStore (Room): issuers(active), floor, latest rootIds, vk (+ hash), nullifier log
   {nullifier, epochId, count, firstSeen} with a purge of epochId < e-1, lastSync.
2. SyncWorker (online only, never called by verify): Registry over JSON-RPC eth_call/eth_getLogs
   (web3j or raw) for issuers, floor and rootIds; Arkiv for signed roots, scanner list and vk; reject a vk
   whose hash != BuildConfig.VK_HASH; upload pending scan batches signed with the scanner key
   (secp256k1 key encrypted by a Keystore AES key; Keystore can't hold secp256k1).
   Settings has editable RPC and Arkiv URLs plus a backup RPC (demo: swap the provider).
3. Camera: CameraX ImageAnalysis + ZXing decoding (NOT Google ML Kit, so CROPS has no third-party SDK
   question), continuous, debounced (same text within 30 s → re-show the last result).
4. Result screen: full-screen GREEN / AMBER / RED, large plain-words reason ("Valid pass",
   "Shown twice — check", "Expired"), haptic, back to scanning after 2 s. A sync status chip:
   "Synced 2 h ago". A hidden long-press shows verify latency (for measurements).
5. Logs: result and reason code only. Build the debug APK.
Test on the device: scan the passenger phone in airplane mode → Green; again → Amber; again → Red.
```
**Done when:**
- All fixture cases pass.
- The `:verifier` no-network test passes.
- Real phone-to-phone scans work in airplane mode.
- Latency (< 1 s) is in SPEC §10.

**Review:** `/finish-task module-8 scanner-app`. The reviewer is Opus · high; focus on SPEC §5 order, reason codes and privacy of the log. Optional: `/code-review ultra` (free run 2).

---

### M9 · Audit page (1 h) · Sonnet 5.5 · low

```
Module 9: audit page. Read docs/HANDOFF.md, deployments.json, docs/notes/arkiv.md, SPEC §9.
audit/index.html: ONE file, no build step, ethers pinned to an exact version from cdnjs, Arkiv read via
JSON-RPC fetch (or the SDK as a pinned ESM URL if the notes show one). No analytics, no wallet, no cookies.
Shows: active issuers (from Registry events) and suspended ones; floor; per issuer the latest on-chain
rootId vs the latest Arkiv SignedRoot with an expiry countdown; a root-rate flag if more than 1 root per
minRootInterval; leaf count and revocation count; scanner keys; vk hash vs the pinned hash (✓/✗);
"how to verify this yourself" with the Arkiv query and the Etherscan link.
Light and dark mode, readable on a phone, a clear error card when a source is unreachable,
and an RPC URL field to swap providers. Publish via GitHub Pages and put the URL in the README.
```
**Done when:** it loads with only a public RPC, and a judge can check the claims in 30 seconds.
**Review:** `/finish-task module-9 audit-page`, with the reviewer on **sonnet**.

---

### M10 · Integration, preflight, rehearsals (2.5 h) · Sonnet 5.5 · medium (Opus · high for a stubborn cross-module bug)

```
Module 10: integration. Read docs/HANDOFF.md, docs/BOUNTIES.md §4 (demo), deployments.json.
1. scripts/preflight.ts prints PASS/FAIL for: both RPCs reachable; Registry bytecode at the address;
   issuer active; issuer Sepolia and Arkiv balances above a threshold; latest Arkiv SignedRoot not expiring
   within 6 h; vk hash equal across circuits/artifacts, the scanner BuildConfig and audit/index.html; both APKs
   exist; the CI status of main is green.
2. scripts/demo-setup.sh: start the issuer, publish a fresh root, print the URLs.
3. DEMO.md: exact commands, expected output for every step of the 3-minute script, and the top 5 live
   failures each with a fallback (venue Wi-Fi → hotspot; Sepolia slow → show a pre-made tx; phone dies →
   second phone; QR won't scan → brightness/distance; everything fails → backup video).
Run the full demo 3 times from a clean state. Fix only blocking bugs. Record all measurements in SPEC §10
with the device and date.
```
**Done when:** 3 clean runs, preflight is all PASS, and SPEC §10 is filled.
**Review:** `/finish-task module-10 integration`. In the rule check, the real-web3 audit must be **all PASS**.

---

### M11 · README, Arkiv files, Q&A, video, submission (2.5 h)

**Step 11a: README and Arkiv files.** Sonnet 5.5 · medium.
```
Module 11a: docs. Read docs/BOUNTIES.md, SPEC.md (§8 and §10), DEMO.md, deployments.json, arkiv/*.
Write README.md (≤ 1,000 words + tables): the problem with Mumbai numbers; the one-question framing;
how it works (diagram image at docs/architecture.png); quickstart (exact commands, all tested on a fresh
clone); demo; a section titled exactly "CROPS" (C, O, P, S, 1–2 lines each, per BOUNTIES §1, updated
with real facts); Arkiv (writer wallet address, one runnable query, links to the 5 files); threat model
and limitations (per-scanner duplicates, demo trusted setup, EOA authority, leaf download size,
simulated purchase); path to production; AI-use disclosure (where Claude Code was used, that every task
was human-reviewed and logged in docs/REVIEWS.md); license.
Then write arkiv/reach.md, arkiv/why-arkiv.md and arkiv/how-you-use-arkiv.md answering EVERY question in
BOUNTIES §2 with links, numbers or runnable queries from our real data. Finalise friction.md (no
invented issues). Do a fresh-clone test in /tmp following the README only; fix any step that fails.
```

**Step 11b: judge pass.** `/clear` · Opus 5.5 · high.
```
Module 11b: act as an EF CROPS judge and an Arkiv judge in a subagent with fresh context.
Read README.md, SPEC.md, arkiv/*, docs/BOUNTIES.md. Score every judging criterion /10 with one line each;
list the 5 claims a judge could disprove; check every qualification item as PASS/FAIL. Then, as a skeptical
ZK engineer and a Mumbai railway official, write docs/QA.md: 15 hardest questions with 2-sentence honest
answers (screenshot sharing, replay, trusted setup, issuer collusion, scanner log linkability, revocation
delay, Arkiv or chain outage, battery, why not a signed QR, why not an NFC card, why blockchain at all,
leaf download size, stolen phone, clock skew, cost per check).
Fix overclaims in the README first.
```

**Step 11c: you (human).**
- Record the ≤ 3:00 video following BOUNTIES §4. One take per scene; screen-record plus a phone camera. Make the moment you kill the issuer server visible.
- Create a GitHub Release with both debug APKs and the audit page link.
- Optionally run `/code-review ultra` on the final PR (free run 3).
- Fill in the ETHGlobal submission: pick the EF CROPS prize and the Arkiv "Build on Arkiv" prize, add the video, repo, APKs and audit page link.

**Done when:** every box in docs/BOUNTIES.md is ticked, and the final rule check is all PASS.
**Review:** `/finish-task module-11 submission`.

---

## 6. Fallbacks (only real ones; rule R5)

| If this breaks | Real fallback | Never do |
|---|---|---|
| mopro won't build or run | snarkjs + pass.wasm in an on-device WebView / JS engine (still on-device Groth16) | Prove on a server; ship a pre-baked proof |
| Native verify on the scanner | The same JS engine runs `groth16.verify` | `return true` |
| Sepolia faucet dry | A second faucet, or ask a mentor or sponsor booth. As a last resort, another **Ethereum** testnet, logged in REVIEWS.md | A local Anvil chain in the demo |
| Etherscan verify fails | `forge verify-contract` retry; Sourcify verification | Skip verification silently |
| Arkiv SDK issue | Arkiv JSON-RPC directly (docs); ask at the Arkiv booth; **log it in friction.md** | Write to a local DB and call it Arkiv |
| Lock-screen launch blocked | Quick Settings tile → ShowWhenLocked activity | Claim lock-screen in the README without it working |
| Phone too slow to prove | Cache more epochs on unlock; measure and state honestly | Shrink the security (e.g. drop the expiry check) silently |

---

## 7. The `/finish-task` routine (what the skill does)

1. Run the module's tests and show a pass/fail summary. Stop on failure.
2. `git add` only this task's files, then commit `module-N: <what changed>`, then `git push`.
3. Run the `hostile-reviewer` subagent on `git show HEAD`, with the SPEC sections the module names. Use Sonnet for M0, M9 and docs.
4. Fix **confirmed** correctness, privacy, security or SPEC findings only. Commit `module-N: review fixes`, then push.
5. Append the entry to `docs/REVIEWS.md` using its template, with the real hashes.
6. Run the `rule-checker` subagent: R1–R6 plus the real-web3 audit, as a PASS/FAIL table with evidence.
7. Append a ≤ 10-line handoff to `docs/HANDOFF.md`: what exists, paths, interfaces, open issues, next module.
8. Commit `module-N: review log + handoff`, then push. Report the table to the user.

---

## 8. With teammates (2–4 people)

Lanes run in parallel, each in its own git **worktree** and Claude session. Merge to `main` at checkpoints.
- **Lane A, ZK and protocol:** M1 → M2 → help M3 → M8a fixtures.
- **Lane B, Android:** M3 → M7 → M8.
- **Lane C, chain and data:** M4 → M5 → M6 → M9.
- **Lane D, story** (if a 4th person): Mumbai numbers, the README, the `/arkiv` files, the video, rehearsals.

Sync every 4 hours: each lane reads the others' HANDOFF entries, not their code.
