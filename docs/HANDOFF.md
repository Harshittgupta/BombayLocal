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
