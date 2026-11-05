# Review log

One entry per finished task (rule R3). Newest at the top. A task without an entry here is **not done**.

## Entry template

```
### <date> · module-N · <task name>
Commit: <hash>  (pushed: yes/no)
Reviewer: fresh session, <model>
Findings: bugs / privacy leaks / security holes / SPEC deviations (short bullets)
Fixed in: <hash(es)>
Still open: <bullets or "none">

Rule check:
- R1 auditable repo ............ pass/fail  (fresh-clone tested? y/n)
- R2 commits proper + same day . pass/fail
- R3 this review logged ........ pass
- R4 two separate apps ......... pass/fail/n.a. yet
- R5 real web3, no mocks ....... pass/fail  (list which audit items were checked)
- R6 CROPS / Arkiv only ........ pass/fail  (which prize this task serves)
Blockers: <anything real that is blocked; never replaced by a mock>
```

---

### 2026-11-06 · module-3 · mobile-zk-spike (apps/passenger, on-device Groth16)
Commit: afefde1 (spike), 69838f7 (review fix)  (pushed: yes)
Reviewer: hostile-reviewer subagent (Opus), fresh context, on 18fe7e8..afefde1
Gate: REAL Groth16 proof generated AND verified on the physical phone (Nothing A142, Android 16); publicSignals == fixture case 0; ProtocolEngine poseidon1/2/3 + merkleProof == fixtures; 2/2 instrumented tests; cold prove 3,653 ms. Verdict: SOUND (real, verified on-device, no mocks).
Decision: Option B (snarkjs + protocol/ bundle in a WebView). Not mopro (needs Rust+NDK, Windows-undocumented, and still needs a WebView for hashing).
Findings:
- [MAJOR] invariant-5 parity was hand-enforced: no CI job kept apps/passenger assets in sync with protocol/src, circuits/artifacts, fixtures; instrumented tests (the only drift check) don't run in CI (no device) → FIXED: pinned esbuild 0.28.2, prepare-assets uses it, new CI job "passenger-assets" regenerates and `git diff --exit-code`s the assets
- [MINOR] new WebView per self-test tap (leak) → deferred to M7 (real UI)
- [MINOR] no timeout on call()/create(); a failed JS load hangs the coroutine → deferred to M7
- [MINOR] secret transits as a stringified evaluateJavascript arg; JS error path returns a stack → deferred to M7 (secret never leaves device or is logged today; M7 must scrub errors + move secret off the stringified channel, invariant 2)
Confirmed REAL by reviewer: prove = snarkjs.groth16.fullProve with committed wasm/zkey on device; verify = snarkjs.groth16.verify vs bundled vk; test asserts both verified AND publicSignalsMatch; no fake chain, no server proving, no hardcoded result; no INTERNET permission, assets served locally fail-closed.
Fixed in: 69838f7
Still open (for M7): WebView reuse, timeouts, secret-in-error-path hardening; measure a warm/pre-proved proof (cold is 3.65 s > 3 s target; lock-screen uses pre-generated proofs so it's off the scan path).

Rule check: see below
Blockers: none

### 2026-11-05 · module-2 · circuit (2a protocol + circuit + setup, 2b tests + fixtures)
Commit: dba0471 (2a), 29d5081 (2b), 045a232 (review fixes)  (pushed: yes; CI green on all 4 jobs)
Reviewer: hostile-reviewer subagent (Opus), fresh context, on 371e89c..29d5081; focus: under-constrained signals, Num2Bits aliasing, path-bit booleanity, depth bound, secret < 2^248
Findings:
- Circuit itself: no bug found. No `<--` in pass.circom; largest Num2Bits is 20 bits (no aliasing); comparators get range-checked inputs; path bits boolean via Num2Bits(20) inside BinaryMerkleRoot, LSB = level 0 matching LeanIMT; depth 0 and 20 correct; secret < 2^248 only needed in protocol/ (nothing bit-decomposes it); TS ↔ circuit formulas, order and padding agree
- [MAJOR] negative tests only exercised the wasm witness generator's asserts, and expectCannotProve swallowed any error → R1CS-level tampered-witness tests (own .wtns encoder) with a control case; only "Assert Failed" counts
- [MAJOR] constraint 4 (nullifier) had no negative test; deleting it would keep CI green → nullifier+1 / epochId+1 tests at witness and R1CS level
- [MAJOR] nothing tied committed wasm/zkey/vk to pass.circom; "<20k" test read a manifest it couldn't contradict → scripts/verify-artifacts.ts + CI "Circuit artifacts match source" (sha256-pinned circom 2.2.3, fresh compile, zkey verify vs r1cs + ptau, vk re-export equality, sha256)
- [MINOR] range guards untested → depth = r-1 and day ≥ 2^16 rejected; depth = 20 synthetic path accepted
- [MINOR] fixture circuitInput unchecked → compared with buildCircuitInput
- [NIT] `npm run setup` alone skipped the ptau hash check → setup runs ptau first
Also found while fixing: snarkjs 0.7.6 already rejects public signals ≥ r (test 10b pins it); the Kotlin scanner still needs SPEC §5 step 1.
Fixed in: 045a232
Not fixed (deliberate):
- committed pass.wasm is not byte-compared with a fresh compile: wasm determinism across OSes is unverified; the wasm is bound to the circuit indirectly because its witnesses produce proofs that verify under the provenance-checked vk
- npm audit: `ws` (high) via @zk-kit/lean-imt → @zk-kit/utils → ethers; WebSocket server code never runs here
- a mutation run (drop constraint 4, re-setup, run tests) was reasoned about, not executed; the control case shows the tampered-witness path works
Still open: signed-root signature vector (SPEC §3.3) belongs in fixtures/vectors.json; lands with the issuer key in M5/M8a

Rule check (rule-checker subagent, Sonnet):
- R1 auditable repo ............ PASS  (.env ignored and untracked, no key/Alchemy URL in tracked files; exact pins + lockfiles; artifacts committed; README Quickstart still a skeleton, owned by M11; CLAUDE.md Commands work)
- R2 commits proper + same day . PASS  (4 module-2 commits, 2026-11-05, pushed; the one FAIL was this pending HANDOFF entry, closed by the review log + handoff commit)
- R3 this review logged ........ PASS  (hashes resolve)
- R4 two separate apps ......... N/A yet
- R5 real web3, no mocks ....... PASS  (real snarkjs Groth16 proofs from the compiled circuit; provenance job; no mocks or `return true`; Sepolia/Arkiv items N/A yet)
- R6 CROPS / Arkiv only ........ PASS
- Invariant 5 (circuit ↔ JS) ... PASS  (fixtures/vectors.json tested in CI)
- Invariant 6 (constraints) .... PASS  (no `<--`; 5,697 < 20k, checked against a fresh compile in CI)
Blockers: none

### 2026-11-05 · module-1 · spec-freeze (SPEC v0.2 → v0.3)
Commit: 3d8363d (v0.3) + 191ce58 (review fixes)  (pushed: yes)
Reviewer: hostile-reviewer subagent (Opus), two fresh-context passes: on v0.2, then on the v0.3 diff. docs-researcher (Sonnet) for facts → docs/notes/m1-research.md
Findings, pass 1 (v0.2):
- [CRITICAL] §4 `indices[20]` is the old template API; non-boolean path bits forge membership → single `pathIndex`; current template runs Num2Bits(20) inside
- [CRITICAL] `depth` not range-checked (template outputs 0 when depth > 20) → `depth ≤ 20` in circuit; root 0 rejected by postRoot and scanner
- [CRITICAL] LeafBatch expiry on Arkiv breaks every phone's rebuild → `expired` zeroing revocations; missing ranges = 0
- [CRITICAL] on-chain ROOT_INTERVAL not binding; "root shared by every passenger" overclaimed → phone checks root on-chain; anonymity-set row in §8; G3 qualified
- [MAJOR] rebuild nondeterministic → `leafCount`/`revSeq` on SignedRoot, `seq` on revocations, publishing order
- [MAJOR] Arkiv injection via attribute filter → `$creator` = `$owner` = issuer
- [MAJOR] non-canonical nullifier (n + k·r) → reject ≥ r
- [MAJOR] unbounded root TTL; zoneClass tag → exact TTL check (`BAD_ROOT_TTL`); zoneClass ∈ {0,1,2} in circuit
- [MAJOR] global floor blast radius, unbounded → per-issuer floor ≤ rootCount()+1, interval bypass (Choice 4 changed)
- [MAJOR] 30 s debounce lets a queue reuse one screenshot → debounce only while in view (DEBOUNCE_GAP 1 s)
- [MINOR] EIP-191 encoding ambiguity → pinned (134 B preimage, \n32, v∈{27,28}, low-s); lost-phone row, boundary, midnight documented
- Facts: LeanIMT 2.2.5 update(i, 0n) OK, 0 hashed normally; Arkiv expiry is in BLOCKS (2 s); QR 427 B / 641 chars, alphanumeric v16-M
Findings, pass 2 (v0.3 diff):
- [MAJOR] phone could be steered to an older valid root; phone ignored floor → one `issuerState` call; latest on-chain root only; never backwards
- [MAJOR] Arkiv 182.5 d max < long-pass batch life → MAX_PASS_DAYS 90
- [MAJOR] no root cadence → ROOT_HEARTBEAT 6 h + post after 00:00 IST
- [MAJOR] retried writes create duplicates that brick rebuilds → idempotent writes; byte-identical duplicates count once
- [MAJOR] pre-signed roots revive on re-add → suspended addresses can never be re-added
- [MINOR] revocation/batch expiry race → revocation +1 d; Registry interface pinned (§7.1: issuers(), events, ids from 1); public-signal declaration order; proof-point validation; pending/mismatch leaf states; sorted scan batches; lifetime tree capacity; leaves < r; VerifyKey written by authority
Fixed in: 3d8363d, 191ce58
Not fixed (deliberate): Poseidon2 shared by nullifier and tree nodes (NIT; no exploit, same as Semaphore v4)
Still open:
- verify on the Arkiv testnet in M6 that `$owner` = `$creator` = tx sender at create, and the exact `addr(...)` query syntax (docs-researcher marked both UNKNOWN)
- BUILD_PLAN M2/M4 prompts still name the v0.2 API (`indices[20]`, `setMinRootId(uint64)`, `floor()`, `nextRootId()`). SPEC v0.3 wins

Rule check (rule-checker subagent, Sonnet):
- R1 auditable repo ............ PASS  (no keys in git ls-files; .env ignored; .env.example present; nothing to pin yet)
- R2 commits proper + same day . PASS  (3 module-1 commits, 2026-11-05, pushed, small)
- R3 this review logged ........ PASS  (hashes 3d8363d, 191ce58 resolve)
- R4 two separate apps ......... N/A yet
- R5 real web3, no mocks ....... PASS  (no code; SPEC still requires real Sepolia, Arkiv writes+reads, on-device proving, real Groth16 verify; only the purchase is simulated)
- R6 CROPS / Arkiv only ........ PASS  (spec freeze serves both prizes)
- SPEC v0.3 ↔ CLAUDE.md consistency PASS (Core protocol + Registry interface match §7.1)
Blockers: none

### 2026-11-05 · module-0 · bootstrap
Commit: 7f6b331, 8509b47 (bootstrap + CI fix)  (pushed: yes)
Reviewer: hostile-reviewer subagent, Sonnet
Findings:
- [MAJOR] no-trackers passes silently when apps/ missing — fixed: guard with `test -d apps`
- [MAJOR] no-mocks hits binaries, node_modules, lockfiles, Foundry lib, androidTest — fixed: added `-I`, `--exclude-dir` for node_modules/lib/androidTest, excluded lockfiles
- [MAJOR] .env.example missing ADMIN_TOKEN — fixed: added
- [MINOR] .gitignore missing keystore.properties, *.apk, *.log — fixed: added
- [MINOR] Unanchored build/out/cache/ in .gitignore — not fixed: no collision with circuit artifacts path
- [MINOR] CI actions not SHA-pinned — not fixed: hackathon repo, @v4 is standard
- [MINOR] No pull_request trigger — not fixed: solo builder on main
- [MINOR] Tracker grep won't catch transitive deps — deferred to M7/M8 Gradle dep-tree check
Fixed in: f4eac91
Still open: none

Rule check:
- R1 auditable repo ............ PASS  (.env.example exists, .env gitignored, no keys in git, .nvmrc pinned)
- R2 commits proper + same day . PASS  (all module-0: prefixed, pushed 2026-11-05)
- R3 this review logged ........ PASS  (this entry)
- R4 two separate apps ......... N/A yet
- R5 real web3, no mocks ....... N/A yet (no code; mock grep clean)
- R6 CROPS / Arkiv only ........ PASS  (bootstrap serves both prizes)
Blockers: none
