# AI-use disclosure

BombayLocal was built during ETHGlobal Mumbai by **Harshit Gupta**, with **Claude Code** (Anthropic) as the coding
assistant.

## Harshit Gupta
- **Problem and scope.** Chose the problem: offline, private pass checks for Mumbai locals. Fixed the scope as pass
  validity only, with no route or station checking.
- **Architecture and code structure.** Defined the system before any code was written:
  - the protocol and data layouts in [`SPEC.md`](../SPEC.md);
  - the modules, repo layout and public interfaces, and every module brief, in
    [`docs/BUILD_PLAN.md`](BUILD_PLAN.md);
  - the project rules and invariants in [`CLAUDE.md`](../CLAUDE.md).
- **Product and design decisions:**
  - the booking-style pass app, and the QR code inside the lock-screen notification;
  - the two-phone web simulator with drag-to-scan, the first-visit tour and APK download QRs;
  - the BombayLocal name and logo;
  - hosting the issuer on Oracle Cloud's free tier.
- **Real-world testing and setup:**
  - ran every on-device test on two physical phones;
  - created the Oracle Cloud, DuckDNS and GitHub setup (accounts, domain, repo rename).
- **Review.** Reviewed and approved each module before moving on.

## Claude Code
- Wrote most of the code, tests and documentation, inside the structure and briefs above, module by module.
- Ran a separate fresh-context review agent on every module. Each finding and fix, with commit hashes, is logged in
  [`docs/REVIEWS.md`](REVIEWS.md), and module handoffs are in [`docs/HANDOFF.md`](HANDOFF.md).
- Agent and skill definitions used for this are in [`.claude/`](../.claude/).
