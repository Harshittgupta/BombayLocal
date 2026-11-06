# Why Arkiv

BombayLocal needs one public place where anyone can read the list of valid passes, and confirm that it is the list the
issuer committed to on Ethereum. The phone rebuilds its pass from that list. The ticket checker's scanner and the
public audit page read it too.

## What users would lose if this were Postgres
If the issuer kept this data in its own Postgres database behind an API, passengers and checkers would lose four things:

| With an issuer-owned Postgres | With Arkiv |
|---|---|
| **The issuer can edit or withhold data silently.** Nobody outside can tell what changed. | Every record is signed by its writer's wallet. `$creator` and `$owner` are set by the chain, not by the issuer's code. |
| **The issuer can give each passenger a different list** ("tagging"), and so recognise them later at a scan. | Everyone reads the same public records. The phone checks that the rebuilt tree equals the single root posted on Ethereum, so a per-user list fails. |
| **Refreshing a pass needs the issuer's server.** If it is down, or refuses someone, the passenger is stuck, and the server sees every refresh (IP + time). | Phones refresh from Arkiv + one Ethereum read; the app's only call to the issuer is the purchase. A stopped or hostile issuer cannot block a refresh or a scan. |
| **No independent audit.** | Anyone can rebuild the tree. The [audit page](https://harshittgupta.github.io/BombayLocal/audit/) checks the latest Arkiv signed root against Ethereum live in the browser. |

Ethereum alone isn't enough either. Storing 32 bytes per pass on mainnet costs gas forever, and the data never goes
away. Arkiv holds the bulky list cheaply and lets it **expire** when the passes do (see
[how-you-use-arkiv.md](how-you-use-arkiv.md)). Ethereum keeps only one 32-byte root per publish.

## What we deliberately kept off Arkiv
| Kept off | Why | Where it lives |
|---|---|---|
| The pass secret | Whoever has it can show the pass | Only the phone (Android Keystore, no backups) |
| Names, payment details, purchase records | Personal data | Nowhere. The payment is simulated, and the issuer stores no personal fields. |
| The purchase ↔ leaf-index map | Would link a buyer to their leaf | Issuer's private database (needed for refunds / revocation) |
| Nullifier logs and scan batches | Would show scan activity | The scanner phone: the nullifier log is purged after ~20 min, and first sightings wait at most 24 h for upload. The issuer keeps uploaded first sightings. |
| Device IDs, IPs | Tracking | No device IDs anywhere. IPs are never logged (`issuer/src/logger.ts`, `issuer/deploy/Caddyfile`); the purchase limit holds the buyer's IP in memory for at most an hour (`issuer/src/ratelimit.ts`). |

What *is* on Arkiv is public by design:
- pass hashes (`Poseidon(idCommitment, validUntilDay, class)`), which are hiding commitments;
- revocation ranges, signed roots and the scanner allow-list;
- the circuit's verification key.

An observer learns how many passes were sold and when, never who bought them.
