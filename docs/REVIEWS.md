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
