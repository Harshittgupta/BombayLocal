# Handoff log

Each module appends ≤ 10 lines at the end. The next module reads only the latest entries, not the whole codebase.

Format:
```
## module-N · <name> · <date time> · commit <hash>
Exists: …
Paths: …
Interfaces: …
Numbers: (constraints, prove ms, verify ms, gas, QR chars)
Decisions: …
Open issues: …
Next: module-N+1 — /model … /effort …
```

---

## pre-hackathon · planning · 2026-11-05
Exists: CLAUDE.md, SPEC.md v0.2, docs/BUILD_PLAN.md, docs/BOUNTIES.md, docs/REVIEWS.md, .claude/agents (hostile-reviewer, rule-checker, docs-researcher), .claude/skills/finish-task.
Decisions: Sepolia; leaves on Arkiv, so the phone computes its own path; the issuer builds the leaf; QR 427 B Base45.
Open issues: LeanIMT zero-leaf revocation and Arkiv expiry units, both to confirm in M1.
Next: module-0 — /model sonnet, /effort low.

## module-0 · bootstrap · 2026-11-05 22:35 · commit f4eac91
Exists: LICENSE (MIT), .gitignore, .env.example (9 keys incl ADMIN_TOKEN), .nvmrc (22.13.1), CI (no-trackers + no-mocks), README skeleton (9 headings + AI-use line).
Paths: .github/workflows/ci.yml, README.md, LICENSE, .env.example, .nvmrc.
Interfaces: none yet.
Numbers: none yet.
Decisions: CI guards apps/ with test -d (skips when missing); no-mocks uses -I for binaries, excludes node_modules/lib/androidTest/lockfiles.
Open issues: none.
Next: module-1 — /model opus, /effort xhigh (spec hostile review and freeze).

## module-1 · spec-freeze · 2026-11-05 23:10 · commits 3d8363d, 191ce58
Exists: SPEC.md v0.3 (frozen), docs/notes/m1-research.md (sourced facts: LeanIMT 2.2.5, BinaryMerkleRoot template, Arkiv SDK 1.0.1 / Rabdi testnet chain 7794095).
Interfaces: circuit private inputs `secret, validUntilDay, depth, pathIndex, siblings[20]` (pathIndex = LeanIMT proof.index, depth = siblings.length ≤ 20; no outputs; public order root, nullifier, epochId, currentDay, zoneClass). Registry pinned in SPEC §7.1 (issuers(), issuerState(), per-issuer floor, no re-add).
Numbers: QR 427 B / 641 Base45 chars, alphanumeric v16-M. Signed-root preimage 134 B.
Decisions: Choice 4 changed (per-issuer floor). Phone follows issuerState latest root; expired Arkiv batches zeroed; Arkiv expiry in blocks (2 s); MAX_PASS_DAYS 90; ROOT_HEARTBEAT 6 h; DEBOUNCE_GAP 1 s.
Open issues: confirm on testnet in M6 that $owner = $creator = sender and the `addr(...)` query form. BUILD_PLAN M2/M4 prompts still show the v0.2 API; follow SPEC v0.3.
Next: module-2a (circuit) — /model opus, /effort xhigh, plan mode. Needs circom + snarkjs + Node in WSL.

## module-2 · circuit · 2026-11-05 23:55 · commits dba0471, 29d5081, 045a232
Exists: protocol/ (@unlink/protocol: constants, day/epochId, Poseidon1/2/3, buildTree, merkleProof → {depth, pathIndex, siblings[20]}, nullifier, buildCircuitInput); circuits/pass.circom; circuits/artifacts/ (pass.wasm, pass_final.zkey, verification_key.json, manifest.json); fixtures/vectors.json (5 verified cases + Poseidon/time vectors); .env (local only, gitignored).
Paths/commands: see CLAUDE.md Commands. Toolchain is native Windows (no WSL Ubuntu): circom 2.2.3 at C:\Users\crevadek\tools\circom.exe (not on PATH; prepend it), snarkjs 0.7.6 as a dev dependency.
Interfaces: public signals [root, nullifier, epochId, currentDay, zoneClass]; witness wires 1–5 in that order, secret at 6. vk sha256 59cb8b11b9acef7604fa2e4a0157320a55b77c5449c2e034b5f87896a29497ef (pin this in the scanner APK).
Numbers: 5,697 constraints; laptop prove 957 ms median, verify 24 ms (i5-8350U). Phone numbers still open.
Decisions: Hermez ptau power 13, one demo-grade contribution; .gitattributes keeps artifacts byte-identical; CI job "Circuit artifacts match source" recompiles and zkey-verifies on every push.
Open issues: signed-root signature vector for fixtures (M5/M8a); npm audit `ws` via @zk-kit/utils (unused code); README Quickstart still a skeleton (M11).
Next: module-3 (mobile ZK spike) — /model sonnet, /effort high. Needs Android Studio + SDK/NDK on Windows, a phone with USB debugging (`adb devices`); Rust only if mopro.

## module-3 · mobile-zk-spike · 2026-11-06 01:30 · (pre-review)
DECISION: Option B (snarkjs + protocol/ bundle in an Android WebView). Option A (mopro) NOT used: needs Rust+NDK (absent, Windows-undocumented) and still needs a WebView for Poseidon hashing. Both prove+verify on-device; B reuses protocol/ JS so hashing parity holds by construction (invariant 5).
GATE PASSED: real Groth16 proof generated AND verified on the physical phone (Nothing A142, Android 16). publicSignals == fixture case 0; ProtocolEngine poseidon1/2/3 + merkleProof == fixtures. 2/2 instrumented tests green.
Exists: apps/passenger/ (AGP 8.13.2, Gradle 8.14.4, Kotlin 2.4.21, compose-bom 2024.09.03, compileSdk 36/minSdk 28/targetSdk 36, applicationId xyz.unlink.passenger). WebAppEngine (one WebView + JS bridge, offline via WebViewAssetLoader, no INTERNET permission), ProverService.prove/verify, ProtocolEngine.poseidon/merkleProof, MainActivity demo, Spike.runProveSelfTest. assets/www/ = protocol.js (esbuild) + snarkjs.min.js + pass.wasm + pass_final.zkey + verification_key.json; assets/vectors.json for tests. Regenerate with `node apps/passenger/prepare-assets.mjs`.
Numbers: cold on-device prove 3,653 ms (incl. init + zkey load); verify on-device true. SPEC §10 updated.
Build: set JAVA_HOME to the JDK root (not .../bin); `./gradlew :app:assembleDebug`; `:app:connectedDebugAndroidTest` with a phone attached. gradle in C:\Users\crevadek\tools\gradle-8.14.4 (wrapper downloads it). local.properties (gitignored) has sdk.dir.
Open issues: proving >3s cold — mitigate with pre-proving (PREPROVE) so lock-screen is instant (M7); measure a warm proof in M7; snarkjs single-thread used (workers untested). AGP 8.x pins compose to 2024.09; bump to AGP 9.x later if needed.
Next: module-4 (Registry contract) — /model sonnet, /effort medium. Needs Foundry; wallets funded on Sepolia; Etherscan key (all in .env).

## module-3 · review · 2026-11-06 01:45 · commits 69838f7, 8b0975b
Hostile review verdict: SOUND (real verified on-device proof, no mocks). Fixed MAJOR #1: CI job "passenger-assets" (apps/passenger/check-assets.mjs, pure Node) sha256-compares the wasm/zkey/vk/vectors assets to circuits/artifacts + fixtures and loads the committed protocol.js bundle to confirm it computes identically to fixtures (tied to protocol/src by fixtures.test.ts). First version regenerated+diffed with esbuild but failed on the Linux runner; the pure-Node check replaced it. CI now has 5 jobs, all green on 43c19aa.
Deferred to M7 (MINOR): reuse one WebAppEngine (no per-tap WebView leak); add timeouts to call()/create(); scrub JS error stacks and move the secret off the stringified evaluateJavascript arg (invariant 2 hardening); measure a warm/pre-proved proof (cold 3.65 s).
Next: module-4 (Registry contract) — /model sonnet, /effort medium. Needs Foundry (forge/cast) installed; AUTHORITY + ISSUER wallets funded on Sepolia; Etherscan key — all already in .env. I can check wallet balances on Sepolia before building.

## module-4 · registry · 2026-11-06 02:20 · commits f6005ab, bf06c90
Exists: contracts/ (Foundry, solc 0.8.28, evm cancun; forge-std vendored in lib/). Registry.sol per SPEC §7.1. 21 forge tests. deployments.json.
Deployed (Sepolia, VERIFIED): registry 0xd13c3d5B02312AEFa4661aD1Fc8205807F255A16, authority 0x153d3906…a23f, issuer 0x8d3713FB…060B, minRootInterval 60. deployTx 0x14c9…e725, addIssuerTx 0xd18d…f19d, firstPostRootTx 0xbc44…7e32. https://sepolia.etherscan.io/address/0xd13c3d5B02312AEFa4661aD1Fc8205807F255A16
Interface (what the issuer/scanner/audit call): addIssuer/suspendIssuer/setMinRootId(issuer,newFloor) [authority]; postRoot(bytes32)->uint64 [active issuer, root!=0, interval 60s, skipped once after a floor raise]; views isActive/floor/rootCount/issuers()/issuerState(addr)->(active,floor,latestRoot,latestRootId,latestPostedAt). Events IssuerAdded/IssuerSuspended/RootPosted(issuer,rootId,root,postedAt)/FloorRaised.
Numbers: real Sepolia postRoot gas 351,411 (SPEC §10). Sepolia is on Pectra; local cancun gas ~4x lower.
Commands: cd contracts && forge test -vv. Build with foundry on PATH ($HOME/.foundry/bin, forge 1.7.1).
Open issues: USE publicnode RPC (SEPOLIA_RPC_URL_BACKUP) — Alchemy key under-estimates creation gas and OOGs; regenerate it. _issuers array unbounded (demo-fine).
Next: module-5 (issuer service) — /model sonnet, /effort medium. TypeScript/Fastify, uses deployments.json + protocol/ + ethers; posts roots via Registry.postRoot on publicnode RPC. Needs Node (have it).

## module-5 · issuer · 2026-11-06 03:20 · commits 968eab2, 296f1db
Exists: issuer/ (TypeScript, Fastify 5, ethers 6, pino 10, node:sqlite). SPEC v0.3. 9 vitest tests (incl. a real circuit proof of a purchased leaf). Posted a real root: rootId 2, Sepolia tx 0x2a9b…f73d (warm postRoot 57,651 gas, SPEC §10).
Paths: src/{config,db,purchase,sign,registry,tree,arkiv,publisher,scan,server,logger,cli-publish}.ts. products.json. scanners.json (allowlist, optional). fixtures/sign-vectors.json (shared §3.3 + §5 vectors, test key).
Interfaces: HTTP POST /purchase {idCommitment,product}->{leafIndex,validUntilDay,zoneClass}; /admin/revoke {leafIndex} + /admin/publish-root (x-admin-token); /scan-batches {scannerPubKey,epochId,nullifiers[],sig}->{stored,duplicates}. ArkivPublisher = {publishLeavesAndRevocations(newLeaves,revocations), publishSignedRoot(signedRoot)} — M6 implements. publishRoot() orchestrates SPEC §3.1 order. rootDigest/signRoot/recoverRootSigner (§3.3); scanBatchDigest (§5).
Decisions: node:sqlite (built-in) instead of better-sqlite3 (its prebuilt binary segfaults on this Node/ABI) — real SQLite, no native build. Default RPC = publicnode (Alchemy OOGs). disableRequestLogging (no client IP in logs).
Open issues (for M6/ops): heartbeat (6h), zero expired batches, idempotent Arkiv writes; these land with the real Arkiv writer.
Next: module-6 (Arkiv data layer) — /model sonnet, /effort high. Implements ArkivPublisher against Rabdi testnet (@arkiv-network/sdk), round-trip rebuild == signed root. Needs the issuer wallet funded on Arkiv (ARKIV_RPC_URL/CHAIN_ID in .env); docs-researcher first (docs/notes/arkiv.md).

## module-6 · arkiv · 2026-11-06 08:20 · commits 81df17b, 1060f18, b6bcc1c
Exists: issuer/src/arkiv/ (SDK @arkiv-network/sdk 1.0.1 + viem 2.57.16, Rabdi chain 7794095). ArkivWriter: publishLeafBatch / publishRevocation / publishSignedRoot / publishScannerList / publishVk; every write is idempotent and expiry follows SPEC §9, in blocks rounded up to whole 2 s blocks. ArkivReader: signedRoot(issuer, rootId), latestSignedRoot, leafBatches, revocations, scannerList, vk(authority), all filtered on $creator = $owner = writer. codec.rebuildFromArkiv implements SPEC §3.1 step 4. Schema and judge query: arkiv/schema.md.
Issuer changes: range revocations; arkiv_batches table (≤ 2,000 leaves per batch); zeroing; atomic DB writes; pendingRoot crash recovery; heal of a missing SignedRoot; 6 h heartbeat in server.ts; M5 DBs migrate in place. NoopArkivPublisher deleted.
Live: round trip OK on rootIds 3/5/6/7 (rebuilt == signed == on-chain root). VerifyKey published by the authority (0x22ed…c9cd). Expiry demo in arkiv/expiry-demo.txt. 24 issuer + 31 protocol tests; CI green.
For Kotlin (M7/M8): raw arkiv_query returns u64 as hex quantities, bytes as 0x hex, addresses lowercased, attributes sorted by name, and may include an undocumented `cursor`. LeafBatch.leaves = count × 32 B big-endian. Use keyset paging (`$key > key(..)`, ORDER BY $key ASC).
Commands: cd issuer && npm run arkiv-roundtrip | arkiv-expiry | publish-root (all load ../.env).
Open: ScannerList not exercised live (no scanner keys until M8); nothing schedules the ScannerList/VerifyKey extension yet; a zeroed 1-leaf tree gives a 0 root; never reset issuer.db on a live key; Arkiv per-batch op limits UNKNOWN.
Next: module-7 (passenger app, ~4.5 h): /clear, then /model sonnet, /effort medium. The phone implements the SPEC §3.1 refresh: issuerState eth_call, then arkiv_query reads, rebuild, then its own path.
