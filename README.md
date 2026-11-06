# Unlink

Offline, privacy-preserving transit pass verification for Mumbai suburban railways.

**Public audit page:** https://harshittgupta.github.io/Unlink/ checks the live claims (active issuers, latest root on Ethereum = signed root on Arkiv, issuer signature, root expiry, root rate, verification key hash) straight from Sepolia and Arkiv in your browser. Source: [`audit/index.html`](audit/index.html), one static file.

## Problem

## How it works

## Quickstart

## Demo

## CROPS

## Arkiv

## Threat model and limitations

The full table is in [SPEC.md §8](SPEC.md). Two limits come from showing the pass without unlocking:

- **Whoever holds the phone can show the pass.** The pass works from the lock screen: the "Show pass" Quick Settings tile, and the ongoing notification, whose expanded view carries the current 10-minute code. Anyone holding the locked phone can therefore show a valid code for as long as cached codes last (about 2 hours). New codes are made only after an unlock.
- **Notification access can read the code.** An app the user has granted notification access can read the picture out of the notification. The code carries no identifier and expires with its 10-minute window, but within that window it is a valid pass. Users who don't want this can turn off the "Pass on lock screen" notification channel and use the tile instead.

## Path to production

## AI-use disclosure

Built with Claude Code (Anthropic); see docs/REVIEWS.md.

## License

MIT — see [LICENSE](LICENSE).
