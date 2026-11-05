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

Rule check: see below
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
