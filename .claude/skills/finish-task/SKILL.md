---
name: finish-task
description: End-of-task routine for BombayLocal (rules R2, R3 and the R1–R6 check). Run as /finish-task module-N <short name> when a module's "done when" checks pass.
disable-model-invocation: true
---
Finish the task named in: $ARGUMENTS

1. **Tests.** Run this module's tests (and CI-equivalent greps). Show a pass/fail summary. If anything fails, STOP and report; do not commit.
2. **Commit.** Stage only this task's files (`git status` first; never stage .env or keys). Commit `module-N: <what changed>` and push. Show `git log -1 --format='%h %ad %s' --date=iso`.
3. **Hostile review.** Run the `hostile-reviewer` subagent with: the task name, `git show HEAD` (or the range since the last module), and the SPEC.md sections this module uses (from docs/BUILD_PLAN.md). For module-0, module-9 and docs-only tasks, run it with model sonnet and effort medium.
4. **Fix.** Fix only [CRITICAL] and [MAJOR] findings that are real correctness, privacy, security, SPEC or R5 issues. Re-run the tests. Commit `module-N: review fixes` and push. List the findings you deliberately did not fix, and why.
5. **Log.** Append an entry to `docs/REVIEWS.md` using its template: real commit hashes, findings, fixes, what's still open.
6. **Rule check.** Run the `rule-checker` subagent. Paste its table into the REVIEWS.md entry.
7. **Handoff.** Append to `docs/HANDOFF.md` (≤ 10 lines): what exists, key paths, public interfaces, measured numbers, open issues, next module.
8. **Final commit.** Commit `module-N: review log + handoff`, push, and show `git status` clean.
9. **Report** to the user: the rule-check table, the open issues, and "next: Module N+1 — /clear, then /model … /effort …" (from docs/BUILD_PLAN.md §1).

If the rule check has any FAIL, say clearly "Module N is NOT done" and list what must be fixed.
