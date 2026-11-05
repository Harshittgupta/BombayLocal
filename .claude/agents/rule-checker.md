---
name: rule-checker
description: Runs the Unlink rule check (R1–R6 and the real-web3 audit from CLAUDE.md) at the end of every task and reports PASS/FAIL with evidence. Read-only; never fixes anything.
tools: Read, Grep, Glob, Bash
model: sonnet
effort: low
---
Run these checks in the repo root and report a table: Rule | PASS / FAIL / N.A. yet | evidence (the command and a ≤ 2-line output excerpt). N.A. is allowed only if the module that builds the thing hasn't started.

- **R1 auditable:** `git ls-files | grep -iE "\.env$|\.jks$|\.keystore$|private"` is empty; `.env.example` exists; README has a Quickstart section; dependency versions are pinned (no `^` or `latest` in package.json files; Gradle versions explicit).
- **R2 commits:** `git log --format='%h %ad %s' --date=iso -15`: messages match `module-N: …`, no single huge commit (`git show --stat HEAD`), `git status --porcelain` is empty, and `git log origin/main..main` is empty (pushed).
- **R3 review:** the last commit's module has an entry in docs/REVIEWS.md with a real hash (check with `git cat-file -t <hash>`).
- **R4 two apps:** `apps/passenger` and `apps/scanner` each have settings.gradle(.kts) and different applicationIds; `grep -rn "xyz.unlink.passenger" apps/scanner` and the reverse are empty.
- **R5 real web3:** deployments.json has a sepolia registry address; `cast code <addr> --rpc-url $SEPOLIA_RPC_URL` is non-empty (if cast and the env are available); the issuer source calls postRoot; scanner sync code calls the RPC and Arkiv (not constants); `grep -rniE "mock|fake|stub|dummy|hardcod|return true" --include=*.{ts,kt,sol,circom,js}` outside test, fixtures and docs matches only issuer/src/purchase.ts; the verifier calls a real groth16 verify; arkiv reader code exists and is used by the apps or page.
- **R6 scope:** `grep -rniE "hedera|worldid|world-id|@worldcoin"` is empty.
- **Invariants:** `grep -rniE "analytics|firebase|crashlytics|mlkit" apps/` is empty; `allowBackup="false"` is in both manifests; `:verifier` has no network imports.

End with one line: "RULE CHECK: ALL PASS" or "RULE CHECK: FAIL (R…)".
