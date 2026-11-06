<p align="center"><img src="docs/assets/banner.png" alt="BombayLocal" width="640"></p>

# BombayLocal

**Offline, private train-pass checks for Mumbai locals.** A passenger's phone proves "I hold a valid pass" with a zero-knowledge proof. The ticket checker's phone verifies it **offline in about 50 ms** and learns one thing: *this pass is valid right now*. No name, no pass ID, nothing that links one scan to the next.

| Try it | Link |
|---|---|
| **Live demo** (two phones in your browser) | https://harshittgupta.github.io/BombayLocal/ |
| **Android apps** (passenger + ticket checker) | [latest release](https://github.com/Harshittgupta/BombayLocal/releases/latest): `bombaylocal-pass.apk`, `bombaylocal-scan.apk` |
| **Live audit** (every public claim, checked in your browser) | https://harshittgupta.github.io/BombayLocal/audit/ |
| **Registry** (Ethereum Sepolia, verified source) | [`0xd13c…5A16`](https://sepolia.etherscan.io/address/0xd13c3d5B02312AEFa4661aD1Fc8205807F255A16) |
| **Hosted issuer** (buying passes only) | https://bombaylocal-issuer.duckdns.org/health |

*Formerly Unlink.* Live data depends on the old name, so it stays in the signing tag `UNLINK-ROOT-v1`, the Arkiv tags `unlink.*`, the package IDs `xyz.unlink.*`, the verified Registry source and the circuit.

## Problem
Mumbai's suburban railway carries millions of commuters a day, and passes are still checked by hand. In 2025–26, Mumbai's Central Railway (16.16 lakh cases, incl. mail/express) and Western Railway (~30 lakh, to February 2026) caught **about 46 lakh ticketless or irregular travellers** and collected **nearly ₹262 crore** in fines ([Free Press Journal](https://www.freepressjournal.in/mumbai/mumbai-local-train-cr-wr-collect-whopping-262-crore-in-fines-from-ticketless-travellers-within-a-year), from railway data). Checks are slow in a packed coach, and online checks fail where trains lose signal. Digital passes usually add a server that sees every check, which turns a ticket into a tracking record.

**The one question:** can a ticket checker know a pass is valid, **offline**, without learning who you are?

## How it works
![Architecture](docs/architecture.png)

1. **Buy.** The phone keeps a secret in the Android Keystore and sends only its hash (payment **simulated**). The issuer adds `Poseidon(hash, validUntil, class)` to a Merkle tree.
2. **Publish.** About a minute later the issuer posts one 32-byte root on Ethereum, and the pass hashes, revocations and signed root on **Arkiv**, as expiring public records.
3. **Refresh.** The phone rebuilds the tree from Arkiv, checks that it equals the root on Ethereum, and finds its own leaf. The issuer is not contacted.
4. **Prove.** The phone makes a Groth16 proof: "my pass is in this tree, valid today, this class". The QR changes every 10 minutes.
5. **Check offline.** The scanner verifies the issuer's signature, the root's expiry and the proof, with no network. The same code shown twice is **Amber**, three times **Red**.

| Measured | Value |
|---|---|
| Circuit | 5,697 constraints |
| Proof on a phone / on a laptop (same JS as the web demo) | ~3.5 s on a vivo Y100 (misses SPEC's < 3 s target; made ahead, never at scan time) / 1.3 s |
| Check on the scanner | 50.7 ms median on a Nothing Phone A142, no network |
| QR | 427 bytes → 641 Base45 characters → version 16-M |
| `postRoot` | 57,651 gas, one per batch of purchases |
| Buy → pass ready (hosted issuer) | ~60 s |

## Quickstart
Requirements: Node **22.13.1**, JDK **21** + Android SDK, [Foundry](https://getfoundry.sh); circom **2.2.3** only to rebuild the circuit. Every command below passed on a fresh clone (logged in docs/REVIEWS.md).

```sh
git clone https://github.com/Harshittgupta/BombayLocal.git && cd BombayLocal
cd protocol  && npm ci && npm test && cd ..          # Poseidon, tree, QR codec, signatures
cd circuits  && npm ci && npm test && cd ..          # real proofs with the committed circuit
cd issuer    && npm ci && npm test && cd ..          # purchases, publishing, limits, CORS
cd web       && npm ci && npm test && npm run build && cd ..   # browser scanner vs all 73 QR fixtures
cd contracts && forge test && cd ..                  # Registry
export ANDROID_HOME=/path/to/Android/Sdk JAVA_HOME=/path/to/jdk-21   # or sdk.dir=… in apps/*/local.properties
cd apps/scanner   && ./gradlew :verifier:test :app:assembleDebug && cd ../..
cd apps/passenger && ./gradlew :app:assembleDebug && cd ../..
node scripts/check-audit.mjs                         # the audit page's checks against live Sepolia + Arkiv
```
Running your own issuer: [`issuer/deploy/README.md`](issuer/deploy/README.md). Exact per-module commands are in [`CLAUDE.md`](CLAUDE.md).

## Demo
- **Browser:**
  1. Open the live demo and buy a pass.
  2. Wait about a minute for the issuer's root on Ethereum.
  3. Drag the checker's phone onto the code: Green. Drag it away and back: Amber, then Red.

  Both "phones" share one page: it shows the protocol, not the Keystore or two separate devices. The request counter counts the page's fetch/XHR calls.
- **Android:**
  1. Install both APKs. Open BombayLocal Scan once while online so it syncs (the chip says "Synced").
  2. Buy a pass in BombayLocal Pass and wait until it says **Ready offline** (about a minute).
  3. Put the passenger phone in airplane mode. Show the QR from the lock screen or the notification, and scan it.
- **Test censorship resistance:** with a pass already bought, set BombayLocal Pass → Settings → Issuer URL to `https://issuer.invalid`. Refresh and scanning still work; only Buy fails.

## CROPS
- **C (censorship resistance).** With the issuer off or hostile, existing passes keep refreshing and verifying for up to 36 h: scanners work offline, and phones refresh from Arkiv and Ethereum, never the issuer. New passes need the issuer or a replacement the authority registers. App endpoints are editable in Settings.
- **O (open source).** MIT. Apps, circuit, contract, issuer and website all build from this repo; CI re-checks the circuit, Etherscan has the verified contract, and GitHub Actions builds the APKs.
- **P (privacy).** The issuer sees a hash and the product at purchase; your IP stays in its memory for at most an hour (purchase limit) and is never logged. The default Arkiv and RPC providers see the phone's IP and issuer on refresh (changeable in Settings). The checker sees validity, class and a 10-minute nullifier. No accounts, analytics or trackers.
- **S (security).** The secret is created on the phone, Keystore-wrapped and never backed up. Proofs and signatures are checked offline, and the scanner trusts chain state only when two RPC providers agree. Limits below.

## Arkiv
Every pass hash, revocation, signed root, scanner list and the verification key lives on Arkiv, and the passenger app, the scanner and the audit page all read it back.

| Writer wallet | Writes |
|---|---|
| Issuer `0x8d3713FBad1A2E40F40de56D37eab09513cb060B` | SignedRoot, LeafBatch, Revocation, ScannerList |
| Authority `0x153d390680704090AaA24657697f15e6b91Da23f` | VerifyKey |

The issuer's newest signed root:
```sh
curl -s -X POST https://rpc.rabdi.db-chain.testnet.arkiv.network -H 'content-type: application/json' --data \
'{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["type = str('"'"'unlink.signedRoot'"'"') AND issuer = addr(0x8d3713FBad1A2E40F40de56D37eab09513cb060B) AND $creator = addr(0x8d3713FBad1A2E40F40de56D37eab09513cb060B) AND $owner = addr(0x8d3713FBad1A2E40F40de56D37eab09513cb060B) ORDER BY rootId:u64 DESC",{"select":{"attributes":true},"limit":"0x1"}]}'
```
More detail: [schema](arkiv/schema.md) · [why Arkiv](arkiv/why-arkiv.md) · [how we use it](arkiv/how-you-use-arkiv.md) · [reach](arkiv/reach.md) · [friction log](arkiv/friction.md).

## Threat model and limitations
The full table is in [SPEC.md §8](SPEC.md). Stated up front:
- **Duplicates are caught per scanner:** a screenshot shown to two checkers within 10 minutes passes both (scan batches only *measure* this).
- **Demo-grade trusted setup** (one phase-2 contribution) and an **EOA authority** (a multisig in production).
- **Revocation delay:** up to 36 h on the old root, unless the authority raises the floor.
- **Download size:** 32 bytes per live pass (~32 MB per million); production needs delta sync.
- **Simulated purchase.** Everything else is real.
- **Lock-screen code:** whoever holds the phone, or an app with notification access, can use the current 10-minute code.
- **A fresh pass narrows its root:** at low traffic the buyer is briefly alone on the newest root.
- **The APKs are debug builds:** someone holding your unlocked phone with USB debugging on could inspect the app and copy the secret. Production ships signed, non-debuggable builds.
- **Testnets only;** the issuer's free Oracle VM can be paused after 7 idle days.

## Path to production
- **Governance and setup:** a multisig authority and a multi-party trusted-setup ceremony.
- **Scale:** delta leaf sync and tree rotation.
- **Publishing:** a fixed 15-minute cadence, not per purchase.
- **Real use:** payments, an Arkiv key, then a one-operator pilot.

## AI-use disclosure
Built by **Harshit Gupta** with **Claude Code** (Anthropic). Harshit defined the architecture and code structure (SPEC.md, the module plan and interfaces), made the product decisions, tested on real phones and approved every module. Claude Code wrote most of the code, tests and docs within that structure; a fresh-context agent reviewed each module ([`docs/REVIEWS.md`](docs/REVIEWS.md)). Details: [`docs/AI_USE.md`](docs/AI_USE.md).

## License
MIT. See [LICENSE](LICENSE).
