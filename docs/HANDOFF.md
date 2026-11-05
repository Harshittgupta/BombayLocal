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
