<p align="center"><img src="docs/assets/banner.png" alt="BombayLocal" width="640"></p>

# BombayLocal

Offline, privacy-preserving transit pass verification for Mumbai suburban railways.

*Formerly named Unlink.* Protocol identifiers keep that original name on purpose, because live data depends on them: the root-signing tag `UNLINK-ROOT-v1`, the Arkiv record tags (`app = 'unlink'`, `unlink.signedRoot` …), the Android package IDs `xyz.unlink.*`, the deployed Registry's verified source and the circuit. Renaming them would invalidate every signed root on Sepolia and every record on Arkiv.

**Live demo:** https://harshittgupta.github.io/BombayLocal/ — two phones in your browser. Buy a pass (simulated payment), watch the issuer publish its root on Ethereum, then drag the ticket checker's phone onto the code: Green, Amber, Red, checked offline with 0 network requests. Real Sepolia + Arkiv data, real Groth16 proofs; the browser scanner passes the same 73-case conformance suite as the Android scanner. Android APKs: [latest release](https://github.com/Harshittgupta/BombayLocal/releases/latest).

**Public audit page:** https://harshittgupta.github.io/BombayLocal/audit/ checks the live claims (active issuers, latest root on Ethereum = signed root on Arkiv, issuer signature, root expiry, root rate, verification key hash) straight from Sepolia and Arkiv in your browser. Source: [`audit/index.html`](audit/index.html), one static file.

**Hosted issuer:** https://bombaylocal-issuer.duckdns.org (`/health`). Both apps buy passes and upload scan batches here, from any network. It runs on an Oracle Cloud Always Free VM behind HTTPS (Caddy), with no access logs; setup in [`issuer/deploy/README.md`](issuer/deploy/README.md). Showing and scanning a pass never use it.

## Problem

## How it works

## Quickstart

## Demo

## CROPS

## Arkiv

## Threat model and limitations

The full table is in [SPEC.md §8](SPEC.md). Three limits worth knowing up front:

- **Whoever holds the phone can show the pass.** The pass works from the lock screen: the "Show pass" Quick Settings tile, and the ongoing notification, whose expanded view carries the current 10-minute code. Anyone holding the locked phone can therefore show a valid code for as long as cached codes last (about 2 hours). New codes are made only after an unlock.
- **A fresh pass narrows its root.** The hosted issuer publishes a root about a minute after a purchase so the pass works quickly. At low traffic the buyer is then the only phone on that root until others refresh, so an issuer that knows who paid, working with a ticket checker, could link that buyer's scans until the next root (SPEC §8, "Anonymity set of a root"). Production should publish on a fixed schedule instead.
- **Notification access can read the code.** An app the user has granted notification access can read the picture out of the notification. The code carries no identifier and expires with its 10-minute window, but within that window it is a valid pass. Users who don't want this can turn off the "Pass on lock screen" notification channel and use the tile instead.

## Path to production

## AI-use disclosure

Built with Claude Code (Anthropic); see docs/REVIEWS.md.

## License

MIT — see [LICENSE](LICENSE).
