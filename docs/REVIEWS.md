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

### 2026-11-06 · module-9 · audit-page (audit/index.html on GitHub Pages)
Commit: 9ffe64b (build)  (pushed: yes; the "Audit page" Pages workflow succeeded, https://harshittgupta.github.io/Unlink/ returns HTTP 200)
Reviewer: hostile-reviewer subagent (Sonnet, effort medium per finish-task for module-9), fresh context, on 9ffe64b; it re-ran `node scripts/check-audit.mjs`
Evidence:
- `node scripts/check-audit.mjs` runs the page's own logic block against LIVE Sepolia + Arkiv with the exact pinned ethers file (SRI verified). All 8 claims pass:
  - the Registry is deployed;
  - the authority matches;
  - the issuer is active;
  - 10 roots, fastest gap 120 s against the 60 s limit;
  - rootId 10 is the same on chain and on Arkiv;
  - the signature recovers to the issuer;
  - the root is still accepted (about 33 h left);
  - the vk sha256 equals the pinned hash.
- Headless Edge renders:
  - desktop, light, from file:// and from the live Pages URL;
  - 390 px dark, in an iframe, with no horizontal overflow;
  - an unreachable Sepolia URL (error card, Arkiv checks still run);
  - a malicious `?arkiv=` link (rejected, default used) plus a custom Sepolia URL (warning banner).
Findings:
- [MAJOR] "Passes on that root are still accepted" ignored issuer state: it showed green for a suspended issuer or a root below the floor. Fixed: it now requires `active && latestRootId >= floor`, with its own detail text.
- [MAJOR] The copyable curl/cast commands embedded the raw `?arkiv=`/`?sepolia=` values, so a crafted link could put shell commands into the clipboard. Fixed: `safeUrl()` allows only plain http(s) URLs (no quotes, `$`, backticks, spaces or shell metacharacters), invalid values fall back to the defaults with an error card, and commands single-quote the URL.
- [MAJOR] A custom RPC link could serve fake "all green" state silently. Fixed: a red "Custom data source in use" banner names the non-default endpoint(s).
- [MINOR] "Only the stated authority can add or suspend issuers" overstated what the page checks (it only compares `authority()`). Fixed anyway, since honest claims are project policy (invariant 7): now "The Registry's authority is the stated address", pointing to the verified source.
- [MINOR] Not fixed, all low impact on a judge-facing read-only page:
  - The rate check exempts any gap that straddles a floor raise; the contract enforces the real rule, so there can be no false pass today.
  - getLogs is sequential with no retry; failure shows an error card.
  - No CSP; the footer discloses that cdnjs and the RPCs see the visitor's IP.
  - Pages actions are pinned to major tags.
  - The `labelled === pinned` vk comparison is redundant with the query filter; the computed sha256 is the real check.
- XSS: none. All rendering uses textContent; Arkiv `txHash` goes only into a fixed-prefix href.
- R5: clean. Real reads and real signature recovery, no bypass.
Fixed in: 957e45f
Still open: the MINORs above; M10 preflight should also check that the vk hash is equal across circuits/artifacts, the scanner BuildConfig and `audit/index.html` (`PINNED_VK_SHA256`).

Rule check (rule-checker subagent, on 957e45f):
- R1 auditable repo ............ PASS  (no keys in git; .env.example; ethers pinned 6.17.0 + SRI; README links the live page, which returns HTTP 200)
- R2 commits proper + same day . PASS  (module-9: 9ffe64b, 957e45f; small; pushed)
- R3 this review logged ........ PASS  (this entry; hashes resolve)
- R4 two separate apps ......... PASS  (unchanged: separate Gradle projects and applicationIds, no cross-imports)
- R5 real web3, no mocks ....... PASS  (live check-audit: all claims real against Sepolia + Arkiv; mock grep finds only issuer/src/purchase.ts, plus benign hits: onRenderProcessGone's `return true`, the bundled protocol.js comment from @noble's "fake accumulator" (already excluded in CI since M7), and audit/index.html's warning about a custom RPC returning fake data; README audit line matches what the page checks)
- R6 CROPS / Arkiv only ........ PASS
- Invariants:
  - 1 PASS: the page reads only public issuer, root, scanner and vk data; no storage, no cookies.
  - 4 PASS: no trackers in apps/ or audit/.
  - allowBackup=false in both manifests; no networking in :verifier.
RULE CHECK: PASS
Blockers: none

### 2026-11-06 · module-8b · scanner-app (CameraX + ZXing, Room store, SyncWorker, scanner key, result screens)
Commit: eca9644 (build)  (pushed: yes)
Reviewer: hostile-reviewer subagent (Opus, effort high per BUILD_PLAN), fresh context, on 3cf67a6..eca9644; it re-ran `:verifier:test`
Evidence:
- **JVM:** 90/90, including 73 fixtures; 4 are new: clock-backwards debounce, lastSync in the future at 120 s and 121 s, and no vk → VERIFIER_ERROR.
- **Device (Nothing A142):** 7/7 at eca9644. After the fixes, 10/10, run via `adb install -r` + `am instrument` so the installed apps and their data stay. The tests cover:
  - all fixtures through the app's Room store and upload queue, plus a logcat check;
  - the scanner key and its batch signature;
  - rollback-safe merge, purge and queue behaviour;
  - a LIVE sync against two real providers and Arkiv;
  - a provider that lies about issuers(): nothing applied;
  - the clock offset.
- **Verify latency:** median 62.5–77.5 ms with the Room store.
- **Real phone-to-phone run:**
  - the vivo passenger in airplane mode showed its lock-screen QR (root 9) to the A142 scanner: Green, then Amber, then Red (DB count 4);
  - the next sync uploaded the signed batch and the issuer accepted it (`stored 1, duplicates 0`);
  - ScannerList 1 is on Arkiv (tx 0x8a65…0ad6) and the scanner shows `listed`;
  - a month pass was then bought: root 10 (tx 0x740b…7870); both apps left installed for standalone demos;
  - after the fixes, a real app sync gave `registry=ok clock=ok vk=ok scannerList=listed`.
Findings:
- [MAJOR] **Scanner key race.** ScannerKey's `@Synchronized` lock was per instance. A first-launch race between SyncWorker and Settings could create two keys, so the address shown would differ from the one stored. Fixed: one process-wide lock plus a per-file cache.
- [MAJOR] **Upload queue kept nullifiers indefinitely** while uploads failed, so a seized scanner could keep its scan history. Fixed:
  - only a nullifier's first sighting is queued (this also removes the re-upload duplicate inflation and the debounced re-queue MINORs);
  - only closed epochs (`< e − 1`) are uploaded (this also removes the finer-than-epoch timing MINOR);
  - entries older than 24 h are dropped unsent, at sync and at app start.
- [MAJOR] **One RPC was trusted for the Registry.** A lying provider could add an attacker issuer (forged passes Green) or ratchet a floor or suspension. Fixed: both configured providers are read at the same block (min head − 2), and state is applied only if they agree; otherwise `registry=failed`, nothing applied, lastSync unchanged. A device test exercises this with a provider that rewrites issuers().
- [MAJOR] **SPEC §8 "scanners resync time at each online sync" was not implemented.** Fixed: the agreed newest block timestamp gives a clock offset (applied when it exceeds 60 s), and verify, lastSync and the sync chip all use device time + offset.
- [MINOR] **SPEC §8 "purged after 2 epochs" vs the queue.** Resolved by the 24 h cap; SPEC §5 M8b note updated.
- [MINOR] Not fixed:
  - `seedVk` doesn't re-seed when VK_HASH changes in a new APK;
  - a Red code held in view logs and vibrates every frame (steps 1–7 never set `sameShowing`).
- Found during the fixes: `sepolia.drpc.org` no longer serves Sepolia on its free plan (HTTP 400). The backup default is now `https://sepolia.gateway.tenderly.co`; it was checked live for eth_blockNumber, getBlockByNumber and block-pinned eth_call.
- R5: clean (real Registry, Arkiv, Groth16 and issuer).
Fixed in: d7e59e2
Not fixed (deliberate, MINOR, for M10 integration): the `seedVk` re-seed on a VK_HASH change; the per-frame Red log and haptic.
Still open:
- The issuer upload is cleartext to localhost via `adb reverse` (demo only); production needs an HTTPS issuer URL.
- Settings can be edited by whoever holds the scanner. The two-provider rule limits the damage, but there's no settings PIN.
- The trusted setup is demo-grade, and the authority is an EOA (both known; stated in the README in M11).
- Root 10 expires 2026-11-08 ~01:30 IST. The issuer must be running (6 h heartbeat) or publish on demand before a later demo.

Rule check (rule-checker subagent, on d7e59e2):
- R1 auditable repo ............ PASS  (no keys/.env/keystores in git ls-files; .env.example present; explicit versions in package.json and Gradle; fresh clone not tested)
- R2 commits proper + same day . PASS  (module-8b: eca9644, d7e59e2, small, pushed; origin/main..main empty)
- R3 this review logged ........ PASS  (this entry; hashes resolve)
- R4 two separate apps ......... PASS  (separate Gradle projects; applicationIds xyz.unlink.passenger / xyz.unlink.scanner; no cross-imports either way; scanner `:verifier:test :app:assembleDebug` exit 0)
- R5 real web3, no mocks ....... PASS
  - Items 1–2: the registry in deployments.json is verifiedSource, and the issuer calls postRoot.
  - Item 3: the scanner's REGISTRY and CHAIN_ID come from deployments.json via BuildConfig, and sync does raw eth_call issuers()/issuerState() on two providers.
  - Item 7: the mock grep finds only issuer/src/purchase.ts.
  - The checker flagged `return true` at WebViewGroth16Engine.kt:121. Re-checked by hand: it is `onRenderProcessGone`'s "handled" flag, not a verify bypass. The verify result is `ok === true` from snarkjs (verify.js:13).
  - Items 4–6 for the scanner (Arkiv reads, real Groth16) were also confirmed live by the device tests and the real scan run.
- R6 CROPS / Arkiv only ........ PASS  (Hedera / World ID appear only in docs and config as excluded)
- Invariants:
  - 1 PASS: only two Log.i lines, scan status + reason and the sync report. Room tables re-checked by hand: nullifier = {nullifier, epochId, count, firstSeenMs, lastReadMs}; pending_scan = {epochId, nullifier}.
  - 2 (scanner key) PASS: allowBackup=false in both manifests, and no log line carries the key.
  - 3 PASS: no networking imports in verifier/src/main; RPC code only in app/.../sync.
  - 4 PASS: no trackers.
RULE CHECK: PASS
Blockers: none

### 2026-11-06 · module-8a · scanner-verifier (apps/scanner :verifier + WebView engine + fixtures/qr)
Commit: c95267d (build)  (pushed: yes; CI green incl. the new scanner-verifier job)
Reviewer: hostile-reviewer subagent (Opus), fresh context, on c7260a8..c95267d; it re-ran `:verifier:test` (83/83)
Evidence:
- JVM: every one of the 69 `fixtures/qr` cases passes through `verify()` with real snarkjs 0.7.6 (via node).
  - The fixtures are fresh real proofs from `scripts/make-qr-fixtures.ts`, signed with test key pk=1.
  - Also passing: the shared sign/QR vectors, the RFC Base45 vectors, the BN254 G1/G2 and subgroup checks, and NoNetworkTest.
- Device (Nothing Phone A142, Android 16): all 69 fixtures give the same results through `WebViewGroth16Engine`, and the bundled vk matches the pinned VK_HASH.
  - `verify()` median 50.7 ms at c95267d and 48.4 ms after the fixes (SPEC §10).
- Real-pass cross-check: the real M7 QR (root 8, real issuer, real proof) gave Green, then Amber, then Red on three scans.
Findings:
- [MAJOR] web3j crypto 4.13.0 pulled in `org.connid` through tuweni. Its connector-server classes use `java/net/Socket` and `javax/net/ssl`. It also pulled jc-kzg-4844 native libraries, all shipped in the verifier and the APK. NoNetworkTest checked only package names, so it passed anyway. The code was unreachable, which is why this is MAJOR rather than CRITICAL. Fixed:
  - Excluded tuweni, connid, jc-kzg, jackson, slf4j, web3j abi and web3j rlp. The runtime is now kotlin-stdlib, web3j crypto, web3j utils and bcprov.
  - NoNetworkTest now scans every class of every dependency jar for `java/net/` and `javax/net/`, and fails on any native library.
  - The remaining references are pinned in an exact reviewed allowlist, so any new hit fails. They are kotlin-stdlib's `URL.readText` and Path helpers, and bcprov's X.509 OCSP/CRL fetchers and URL-seeded DRBG. None is reachable from Sign, Keys or Hash.
  - The APK has no `.so` files or connid classes. The tests pass again on the JVM (84/84) and on the device (3/3).
- [MINOR] A clock that goes backwards makes the debounce gap negative, so every re-read counts as the same showing (a 2nd showing shows Green). A future `lastSync` passes both stale checks.
- [MINOR] The nullifier log is purged only during a scan. An idle scanner keeps last night's millisecond `firstSeen`/`lastRead` times until the next scan.
- [MINOR] `WebViewGroth16Engine` has no `onRenderProcessGone` handler, so a renderer crash kills the app.
- [MINOR] Test gaps:
  - nothing tests `VERIFIER_ERROR`;
  - the `unknown-higher-rootid` fixture is identical to `valid`, because the store has no latestRootId;
  - the on-device test skips the warnings and the "log untouched" checks.
- SPEC deviations: none blocking. The order of steps 1–10, the reason codes, chainId/registry taken from the store, low-s and v ∈ {27, 28} are all confirmed.
- R5: clean. Both engines are real snarkjs, the check is `ok === true`, and there is no bypass.
Fixed in: 05a6a4b
Not fixed (deliberate, MINOR, assigned to M8b, where the store, clock and lifecycle live):
- negative-gap guards for debounce and staleness;
- a periodic purge of the nullifier log;
- `onRenderProcessGone` (fail closed and rebuild the engine);
- `VERIFIER_ERROR` and clock-backwards fixtures;
- latestRootId in the Room store.
Decisions logged:
- **Debounce follows SPEC (1 s).** BUILD_PLAN said 30 s; its 8a and 8b lines are corrected.
- **`VERIFIER_ERROR` is a new Red code** that fails closed (SPEC §5 note).
- **web3j crypto 4.13.0,** because 4.14 and later need JVM 21.
- **The JVM tests run real snarkjs through node,** the same library the app runs in its WebView.
Still open:
- M8b: camera, Room LocalStore, SyncWorker and the result screens, plus the MINORs above.
- The phone-to-phone airplane-mode scan has not been done yet.

Rule check (rule-checker subagent, on 05a6a4b):
- R1 auditable repo ............ PASS  (no keys/.env/keystores in git ls-files; .env.example present; no ^/~/latest/* in package.json deps; fresh clone not tested)
- R2 commits proper + same day . PASS  (module-8a: commits c95267d, 05a6a4b, small, pushed; origin/main..main empty)
- R3 this review logged ........ PASS  (this entry; c95267d and 05a6a4b resolve)
- R4 two separate apps ......... PASS  (apps/passenger + apps/scanner, each with its own settings.gradle.kts; applicationIds xyz.unlink.passenger / xyz.unlink.scanner; no cross-imports either way; scanner :app:assembleDebug BUILD SUCCESSFUL)
- R5 real web3, no mocks ....... PASS  (item 1: registry has bytecode on Sepolia, verifiedSource; item 6: real snarkjs groth16.verify behind Groth16Engine plus the Kotlin BN254 checks, no bypass; item 7: mock grep finds only issuer/src/purchase.ts (the documented simulated payment) and comments in the generated protocol.js bundle. Items 3/4 for the scanner (sync, Arkiv reads) are N.A. until M8b; item 8 (README) was not re-audited)
- R6 CROPS / Arkiv only ........ PASS  (no Hedera/World ID in product code; the offline private verifier serves CROPS)
- Invariants:
  - 1 PASS: the nullifier log holds only {nullifier, epochId, count, firstSeen, lastRead}; no Log/println in scanner main sources; no leafIndex/deviceId identifiers (re-grepped: no hits).
  - 3 PASS: verifier/src/main has no java.net/okhttp/Socket references, and NoNetworkTest scans every dependency class.
  - 4 PASS: no trackers; allowBackup=false in both manifests.
  - 5 PASS: VectorsTest reproduces sign-vectors.json and qr-vectors.json.
RULE CHECK: PASS
Blockers: none

### 2026-11-06 · module-7 · passenger-app (apps/passenger: Keystore secret, purchase, Arkiv refresh, pre-prover, lock-screen QR)
Commit: 3a5b0e4 (build)  (pushed: yes)
Reviewer: hostile-reviewer subagent (Opus), fresh context, on 042fcd4..3a5b0e4
Device evidence (vivo Y100 V2222, Android 15):
- 12/12 instrumented tests at 3a5b0e4, then 15/15 after the fixes. Coverage:
  - the M3 tests;
  - QR round trip from a real on-device proof (version 16, alphanumeric);
  - refresh replaying REAL recorded Arkiv and Sepolia data: untampered accepted; tampered leaf, signature or root rejected with the old root kept; a foreign creator ignored;
  - a live refresh against real Sepolia + Arkiv;
  - the secret absent from logcat.
- Manual run:
  - simulated purchase → POST /admin/publish-root → root 8 on Sepolia (tx 0x05a2…8c17) and Arkiv → refresh ok → 13 proofs pre-proved (avg 3,467 ms, SPEC §10);
  - QrActivity shown over the keyguard, captured via adb with `deviceLocked=1`, `mIsShowing=true` and `airplane_mode_on=1`;
  - a QR pulled from the phone verified on the laptop with `circuits npm run verify-qr`: Groth16 ok, signer = issuer, root = Registry root 8.
- Problems found on the device and fixed before review:
  - the first notification channel was LOW importance, which vivo files as "Silent" and hides on the lock screen. Now DEFAULT importance with no sound or vibration, plus a public version, plus a Quick Settings "Show pass" tile;
  - vivo's freezer stalled instrumented tests about 10 s in. Tests now hold QrActivity in the foreground;
  - `npm start` never started on Windows (an M5 entry-point check bug), fixed with `pathToFileURL`;
  - two CI-grep false positives: the manifest comment wording, and @noble's "fake accumulator" comments in the generated protocol.js (generated bundles are now excluded from the no-mocks grep; their sources are grepped).
Findings:
- [MAJOR] tagging. The refresh never checked `sr.rootId == issuerState.latestRootId`, so an issuer + Arkiv endpoint could hand each phone the same root under a different signed rootId and recognise phones at scans (SPEC §8). **Fixed** + test.
- [MAJOR] floor. `latest-below-floor` threw before the below-floor drop, so right after `setMinRootId(issuer, rootCount+1)` the phone kept showing QRs scanners reject (BELOW_FLOOR). **Fixed**: the drop runs first (SPEC §3.1 step 1). Test added.
- [MAJOR] purchase. "Buy new pass" deleted the old Keystore key and secret before `/purchase` succeeded, so an unreachable issuer destroyed a valid pass. **Fixed**: two-phase `createPending` / `commitPending` / `discardPending`, one Keystore key per sealed secret, and the old format is still read. Test added.
- [MINOR, fixed] buy ran outside the Jobs mutex; CancellationException was recorded as "Couldn't update"; unlock refreshed on every unlock (now at most once per ROOT_INTERVAL = Registry minRootInterval, SPEC §3.1/§8); an overclaiming comment in Jobs.kt.
Fixed in: 22959a8
Not fixed (deliberate, MINOR):
- The QR screen shows "Valid until <date>" next to the code. It is useful to the passenger, and the TC learns at most the last valid day, which the scanner's reason codes would reveal anyway. Revisit in M10 if the anonymity-set story needs it.
- A crash between `commitPending` and `savePass` can pair the new secret with the old pass.json; the window is milliseconds. Recovery is "buy again" (simulated payment).
Still open:
- Pre-proving is 3,467 ms per proof, above the SPEC < 3 s target. It is never on the scan path (cached, lock-screen instant). A native prover (mopro) is the upgrade path.
- The issuer is reached over `adb reverse` + cleartext localhost for the demo. Production needs an HTTPS issuer URL in Settings.
- The QS tile needs the user to add it (Android 13+ button in the app). The vivo lock screen works via the notification already.
- ScannerList / scanner side → M8 (fixtures/qr-vectors.json + sign-vectors.json are ready for its Kotlin verifier).

Rule check (rule-checker subagent, on 042fcd4..22959a8; RULE CHECK: PASS):
- R1 auditable repo ............ PASS  (no keys in git; .env + local.properties ignored; exact versions in build.gradle.kts and protocol/package.json (@noble 2.4.0); no fresh-clone test)
- R2 commits proper + same day . PASS  (3a5b0e4, 22959a8, `module-7:`, 2026-11-06, pushed; CI green on both)
- R3 this review logged ........ PASS  (this entry; 3a5b0e4 and 22959a8 resolve via `git cat-file -t`)
- R4 two separate apps ......... N/A yet (apps/passenger is its own Gradle project, xyz.unlink.passenger, no scanner imports; scanner = M8)
- R5 real web3, no mocks ....... PASS. Checked:
  - item 4: ArkivClient arkiv_query; the only issuer call is POST /purchase;
  - item 5: check-assets PASS, and bridge.js runs snarkjs fullProve on the device;
  - item 7: no-mocks grep clean (generated bundles excluded, their sources grepped);
  - item 8: SPEC §10 rows hold only measured numbers, and "Verify latency" stays "—" until M8.
- R6 CROPS / Arkiv only ........ PASS  (serves both: CROPS offline/privacy app + Arkiv reads)
- Invariants 1 / 2 / 4 / 5 ..... PASS  (9 log lines carry only state names; allowBackup=false + exclusion rules; one-shot takeSecret; tracker grep empty; bundle matches fixtures)
Blockers: none

---

### 2026-11-06 · module-6 · arkiv (Arkiv data layer: issuer writer + reader, real Rabdi round trip)
Commit: 81df17b (6a docs notes + friction), 1060f18 (build)  (pushed: yes)
Reviewer: hostile-reviewer subagent (Opus), fresh context, on 9f6c748..1060f18
Live evidence:
- Rabdi + Sepolia round trip (`npm run arkiv-roundtrip`) passed on rootIds 3, 5 and 6. The tree rebuilt from Arkiv data alone matches the signed root, the on-chain `issuerState.latestRoot` and the issuer's own tree. The signature recovers the issuer, and the refunded pass is 0.
- VerifyKey was published by the authority wallet (`0x22ed…c9cd`); its bytes match `verification_key.json`, and the sha256 matches the manifest. The second publish exercised `extendEntity` live.
- Expiry demo: an entity with a 2-minute life was found by query, and after its expiry block both the query and `arkiv_getEntity` returned nothing (`arkiv/expiry-demo.txt`).
- Bug found by a live run and fixed before review (in 1060f18): `ExpirationTime.fromSeconds` throws on an odd number of seconds. It fired after `postRoot` and left root 4 on-chain with no SignedRoot. Lifetimes now round up to whole blocks, and the publisher re-publishes a missing latest SignedRoot; root 4 was healed live. Logged as friction #12.
Findings:
- [MAJOR] `revokeRange`, `zeroExpiredBatches` and `batchNewLeaves` were not atomic. A crash midway could zero a leaf with no Revocation (phones' rebuild mismatches), or leave a used `seq` that blocks every later revocation. **Fixed**: `IssuerDb.tx()` (BEGIN IMMEDIATE / COMMIT / ROLLBACK, nested calls join the outer transaction) wraps appendLeaf, revokeRange, batchNewLeaves, each zeroing, and recordRoot. A rollback test was added.
- [MAJOR] A crash after the `postRoot` tx is mined but before `recordRoot` left the on-chain latest root without a SignedRoot, and the heal step could not see it; the code comment overclaimed that it could. **Fixed**: the publisher records `pendingRoot {root, leafCount, revSeq, txHash}` before and at broadcast. On the next run, if the chain's latest root equals the pending root, it signs that root with the on-chain rootId/postedAt and records it; otherwise it clears the pending root. **Tested live** by deleting root 6's DB row with pending set: it re-recorded root 6 with an identical signature and issuedAt. The following post reverted with `TooSoon()`, the 60 s on-chain interval, as designed. The next run (root 7, [tx 0x8748…3db3](https://sepolia.etherscan.io/tx/0x874852b41967d08e1c228b83498bc66889b42a1b86bf04ce8763165064bc3db3)) cleared the stale pending root and published normally. CI: green on 81df17b, 1060f18 and b6bcc1c.
- [MINOR] doc overclaims in schema.md ("only how many passes were sold": `lastValidDay` reveals a 1-pass batch's product; "never a second entity": a retried create can leave a byte-identical duplicate). **Fixed** (wording).
Fixed in: b6bcc1c
Not fixed (deliberate, MINOR):
- A 1-leaf tree whose leaf is zeroed has root 0, so the heartbeat refuses to post it. Demo trees hold many leaves; fixing this needs a SPEC decision.
- A reset `issuer.db` on the same key restarts `batchNo`/`seq` and collides with live entities. The writer refuses (idempotency check) rather than corrupting anything. Operational: never reset the DB of a live issuer key.
- Offset paging can miss or repeat rows while entities change. A miss shows up as a root mismatch, and the phone keeps its previous root and retries (SPEC §3.1 step 5). Switch to keyset paging in the M7/M8 Kotlin reader.
- §9 "the writer extends ScannerList/VerifyKey before expiry": the extend path exists and ran live, but nothing schedules it yet. Wire it into the heartbeat in M8 (ScannerList) or M10.
- `lastValidDay` is an extra LeafBatch attribute beyond SPEC §3.1's list, used for expiry and zeroing. Documented in arkiv/schema.md.
- `publishRoot`, the heal and the heartbeat have no automated tests (they need Sepolia and Arkiv). They are covered by the live runs above.
Still open:
- ScannerList writer/reader not exercised live: there are no scanner keys until M8.
- Arkiv max ops per batch and per-tx limits are UNKNOWN (docs/notes/arkiv.md). Batches are capped at 2,000 leaves (64 KB).

Rule check (rule-checker subagent, Sonnet, on 9f6c748..b6bcc1c):
- R1 auditable repo ............ PASS  (no keys in git ls-files; .env ignored; .env.example has ARKIV_*; package versions exact)
- R2 commits proper + same day . PASS  (81df17b, 1060f18, b6bcc1c, all `module-6:`, 2026-11-06, pushed)
- R3 this review logged ........ FAIL at check time (the checker ran before this entry was written), now PASS: entry written, hashes resolve (`git cat-file -t`)
- R4 two separate apps ......... N/A yet (scanner is M8)
- R5 real web3, no mocks ....... PASS  (items 1, 2, 4 issuer side, 7, 8 checked. Live arkiv_query returned the issuer's SignedRoots with creator = owner = issuer. The only mock is purchase.ts. App/page read-back is M7–M9)
- R6 CROPS / Arkiv only ........ PASS  (serves Build on Arkiv; no Hedera/World ID)
- Invariant 1 (no leaf/leafIndex in logs) PASS
Blockers: none (the authority wallet was funded on Rabdi mid-module; VerifyKey is now published)

### 2026-11-06 · module-5 · issuer (issuer/ service, real postRoot on Sepolia)
Commit: 968eab2, 676b98f (build) + 296f1db (review fixes)  (pushed: yes; CI green on all 7 jobs)
Reviewer: hostile-reviewer subagent (Opus), fresh context, on bf06c90..676b98f
Findings:
- [MAJOR] Fastify default request logging emitted the client IP per POST /purchase (invariant 1 leak) → FIXED: disableRequestLogging
- [MAJOR] publishing order wrong — posted root before any Arkiv write (SPEC §3.1 window) → FIXED: split ArkivPublisher into publishLeavesAndRevocations (before postRoot) + publishSignedRoot (after sign)
- [MAJOR] no assert that the signing wallet == deployment.issuer (scanners would reject every root) → FIXED: assert in publisher
- [MAJOR] no pinned §3.3 signature vector for the Kotlin scanner to cross-check → FIXED: fixtures/sign-vectors.json (signed-root + scan-batch, test key); tests cross-check rootDigest vs an independent 134-byte packed encoding and vs the committed vector; SPEC §3.3/§5 document the digests
- [MINOR] zero-root (empty tree) not guarded → FIXED: publisher refuses root 0
Confirmed correct by reviewer: §3.3 digest widths (134 B) + EIP-191 \n32 (not \n66), ethers low-s/v∈{27,28}; purchase idCommitment<r, validUntilDay, zoneClass-from-product; revocation→0; DB holds nothing personal; only purchase simulated; postRoot is a real Sepolia tx; node:sqlite is a real DB; scan allowlist + sig check sound.
Not fixed (deliberate): [MINOR] purchases.createdAt timing (issuer-internal); [MINOR] heartbeat / zeroing expired batches / idempotent writes (M6 + ops); [NIT] timing-safe admin-token compare (demo); Arkiv read-back is M6 by design.
For M8: the scanner must sign the ascending-sorted nullifier array (scanBatchDigest), and reproduce the §3.3 signed-root digest — both pinned in fixtures/sign-vectors.json.
Fixed in: 296f1db
Real root posted by the service: rootId 2, Sepolia tx 0x2a9b…f73d (warm postRoot 57,651 gas).

Rule check (rule-checker subagent, Sonnet; verified the postRoot tx on-chain):
- R1 auditable repo ............ PASS  (.env + *.db ignored & untracked; exact pins + lockfiles; circuits/artifacts committed; node:sqlite built-in, Node pinned)
- R2 commits proper + same day . PASS  (module-5 commits 2026-11-06, pushed, small)
- R3 this review logged ........ PASS  (968eab2, 296f1db resolve)
- R4 two separate apps ......... N/A yet  (scanner is M8)
- R5.2 postRoot on-chain ....... PASS  (receipt 0x2a9b…f73d status 0x1 to the registry; registry.ts/publisher.ts call Registry.postRoot via ethers)
- R5.7 mock audit ............. PASS  (only issuer/src/purchase.ts; node:sqlite is a real DB)
- R6 CROPS / Arkiv only ........ PASS
- Invariant 1 privacy ......... PASS  (redact paths + disableRequestLogging; no commitment/leaf/index/nullifier in any log line)
- Invariant 7 honest claims ... PASS
- CI (7 jobs) ................. PASS  (green on aa8e74e)
Blockers: none

### 2026-11-06 · module-4 · registry (Registry.sol on Sepolia)
Commit: f6005ab (build, deploy, verify, tests, CI)  (pushed: yes; CI green on all 6 jobs)
Reviewer: hostile-reviewer subagent (Opus), fresh context, on afefde1..f6005ab
Verdict: Registry correct, SPEC §7.1-compliant, safe to build the issuer on. No CRITICAL/MAJOR.
Confirmed by reviewer: access control (authority-only add/suspend/setMinRootId; active-only postRoot); per-issuer floor, setMinRootId floor<new<=rootCount()+1 (never decreases/strands); interval-skip fires only while latestRootId<floor, exactly once per raise, next post always clears floor even with interleaved issuers — not exploitable; suspended issuer can NEVER be re-added (everSuspended, no reset); rootId global ++counter from 1, strict, no gaps, root!=0; issuerState tuple order/types match §3.1 scanner; events/indexing match §7.1; immutables, no owner transfer, no upgradeability; nothing per-pass stored.
Findings (all MINOR/NIT, none fixed in code):
- [MINOR] unbounded _issuers array; issuers() returns whole list — authority-gated, demo-scale; prod: paginate. Noted, not fixed.
- [MINOR] floating pragma ^0.8.24 — NOT changed: the deployed contract is verified on Etherscan with this exact source; pinning would desync repo from the verified source. Determinism already from foundry.toml solc=0.8.28.
- [NIT] test_gas_postRoot asserts nothing (informational probe) — SPEC §10 cites the real receipt as authoritative; tightened §10 wording to drop the probe-derived warm figure.
- [NIT] on-chain verification can't be confirmed offline — verified live during the build ("Contract successfully verified"); explorer link in deployments.json.
Fixed in: none (SPEC §10 wording tweak folded into the review-log commit)
Deployed: 0xd13c3d5B02312AEFa4661aD1Fc8205807F255A16 (Sepolia, verified). deployTx 0x14c9…e725, addIssuerTx 0xd18d…f19d, firstPostRootTx 0xbc44…7e32.
Still open: Alchemy RPC under-estimates creation gas (deploy OOGs on it); publicnode used and set as the working RPC — user may regenerate the Alchemy key. Sepolia on Pectra so real gas ~4x local cancun estimates.

Rule check (rule-checker subagent, Sonnet; verified the deployment live):
- R1 auditable repo ............ PASS  (.env + contracts/{broadcast,out,cache} ignored & untracked; solc 0.8.28 pinned; forge-std vendored 67 files; deployments.json present)
- R2 commits proper + same day . PASS  (module-4 commits 2026-11-06, pushed, small)
- R3 this review logged ........ PASS  (f6005ab, bf06c90 resolve)
- R4 two separate apps ......... N/A yet  (scanner is M8)
- R5.1 Registry deployed+verified PASS  (Etherscan getsourcecode: ContractName "Registry", v0.8.28, non-empty source; publicnode eth_getCode non-empty)
- R5.2 postRoot on-chain ....... PASS  (receipt 0xbc44…7e32 status 0x1 to the registry). Issuer-source postRoot is M5.
- R5.7 mock audit .............. PASS  (only `return true` in the bundled protocol.js; CI "No mocks" green)
- R6 CROPS / Arkiv only ........ PASS
- Invariant no-trackers / allowBackup=false  PASS
- CI (6 jobs) ................. PASS  (green on bf06c90)
Blockers: none

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
Fixed in: 69838f7 (pin esbuild; first drift guard), 43c19aa (make the guard pure-Node after the first version failed on the Linux CI runner)
Still open (for M7): WebView reuse, timeouts, secret-in-error-path hardening; measure a warm/pre-proved proof (cold is 3.65 s > 3 s target; lock-screen uses pre-generated proofs so it's off the scan path).

Rule check (rule-checker subagent, Sonnet; the one FAIL was CI red from the first drift-guard version, fixed in 43c19aa and re-verified all green on HEAD):
- R1 auditable repo ............ PASS  (.env + local.properties ignored and untracked; exact pins incl. esbuild 0.28.2; assets + wrapper jar committed; README Quickstart still M11)
- R2 commits proper + same day . PASS  (module-3 commits 2026-11-06, pushed, small)
- R3 this review logged ........ PASS  (hashes resolve)
- R4 two separate apps ......... N/A yet  (only apps/passenger; applicationId xyz.unlink.passenger; scanner is M8)
- R5 real web3, no mocks ....... PASS  (real snarkjs fullProve + verify on device; mock grep hits are only `return true` inside the bundled protocol.js lib, not a verify stub)
- R6 CROPS / Arkiv only ........ PASS
- Invariant 1/2 (privacy/secret) PASS  (only proveMs + verified logged; secret-in-error-path deferred to M7)
- Invariant 3 (allowBackup=false) PASS
- Invariant 4 (no trackers) .... PASS
- Invariant 5 (hashing drift) .. PASS  (CI job "passenger-assets" via check-assets.mjs; CI green on 43c19aa)
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
