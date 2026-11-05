# Bounties: what we must deliver to win

Targets: **EF Best CROPS App ($3,500: 2,000 / 1,000 / 500)** and **Arkiv: Build on Arkiv from scratch ($4,000: 3,000 / 1,000)**. Nothing else (rule R6). Hedera is out: its bounty forbids Solidity and needs native Hedera services, and our Ethereum Registry is a Solidity contract. The Arkiv + Swarm bonus comes only after the core demo works.

---

## 1. EF: Best CROPS App

**Our lead property: C, censorship resistance, and it is structural.** Scanners verify offline, and phones refresh from Arkiv, so switching off our issuer server doesn't stop anyone.

### Qualification (all required)
- [ ] Public repo, MIT `LICENSE`, and a README that explains how to run everything.
- [ ] README section titled exactly **`CROPS`**, one or two lines per letter (draft below, update with real numbers).
- [ ] Demo video **≤ 3:00**. It shows: the issuer server switched off live, the scanner in airplane mode still Green, the passenger still refreshing from Arkiv, and **issuer logs with nothing identifying** in them.
- [ ] No third-party trackers or analytics in either client. The CI grep job is green.
- [ ] Keys and personal data stay on the device; the README says so.
- [ ] Submitted to the CROPS prize only (one EF prize per project).

### README `CROPS` section (draft)
- **C:** We run the issuer server and pick the default RPC and Arkiv endpoints. If the issuer server disappears or refuses a passenger, scanners keep verifying offline and phones rebuild their Merkle path from public Arkiv data. Passes keep working until the last signed root expires (36 h). Endpoints are user-configurable.
- **O:** MIT licensed. Both APKs, the contract, the circuit, the issuer and the audit page build from this repo with the quickstart commands.
- **P:** The issuer sees only `idCommitment` and the product at purchase, and never sees refreshes or scans. Scanners see validity, fare class and a 10-minute nullifier. The RPC and Arkiv provider sees the phone's IP and its issuer, about once a day. No analytics, no accounts.
- **S:** The secret is generated on the phone, wrapped by Android Keystore, and excluded from backups. Root signatures (EIP-191) are verified offline. Groth16 proofs. Trust assumptions: a demo-grade trusted setup (one contribution), and the authority is an EOA (a multisig in production).

### Judging, and our answer to each
| Criterion | Our answer |
|---|---|
| Works end to end in the demo | 9-step demo, 3 clean rehearsals, backup video |
| Depth of lead property (structural > cosmetic) | Verifying and refreshing don't use our server at all |
| Other three hold, or trade-offs stated | Threat-model table plus a "Limitations" section in the README |
| UX without knowing CROPS | No wallet, no sign-up, no crypto words. Tap the lock screen, show the QR. The TC sees a big Green, Amber or Red |
| Could ship after the hackathon | README "Path to production": multisig authority, trusted-setup ceremony, delta leaf sync, payment integration, operator pilot |

---

## 2. Arkiv: Build on Arkiv (from scratch)

### Qualification (all required)
- [ ] Built from scratch at ETHGlobal Mumbai. Honest commit history proves it.
- [ ] Writes to **Arkiv's current testnet** via `@arkiv-network/sdk` (issuer) or JSON-RPC (Kotlin apps). Check https://docs.arkiv.network.
- [ ] A user-visible feature reads from Arkiv. We have three:
  - The passenger's refresh: signed root plus leaves, so the path is computed on the phone.
  - The scanner's sync: roots, scanner list, vk.
  - The audit page.
- [ ] The README lists the **writer wallet address(es)** and **one query judges can run**.
- [ ] `/arkiv/schema.md`: entities, the fields we query, owners, expiry.
- [ ] `/arkiv/friction.md`: real notes written **while building**. For each break: expected, actual, how to reproduce.
- [ ] `/arkiv/reach.md`, `/arkiv/why-arkiv.md`, `/arkiv/how-you-use-arkiv.md`: one file per judging criterion, with links, numbers or runnable queries.
- [ ] Public repo, open-source license, and an **AI-use disclosure** in the README.
- [ ] Not a write-only log. Everything written is read by an app.

### Judging (25% each), and what goes in each file
| File | Must answer | Our content |
|---|---|---|
| `friction.md` | What to improve, and what broke (expected, actual, repro) | Real notes from Module 6 (Arkiv) onwards. Log the moment it happens |
| `reach.md` | Who it's for; would they use it; can they try it today; will we keep building | Mumbai suburban commuters (millions of daily trips), TCs, operators. APK download links plus the live audit page. Post-hackathon pilot plan |
| `why-arkiv.md` | What users lose with Postgres; what we kept off Arkiv | With Postgres, the issuer could silently edit, withhold or tag roots per user, passengers couldn't refresh without the issuer, and there'd be no independent audit. **Kept off:** secrets, purchases, the purchase↔leaf map, nullifier logs, scan batches |
| `how-you-use-arkiv.md` | Do filters, ownership and expiry fit; does each feature change what users see | Filters: `type`, `issuer`, `rootId`. Each issuer owns its entities. Expiry = root or pass lifetime, so expired passes vanish on their own. Feature → effect on screen (refresh works offline-ready, scanner Green, audit freshness) |

---

## 3. Why this is real Ethereum / web3 (pitch and README)

- **Registry:** a Solidity contract on **Ethereum Sepolia** with verified source. It is the neutral list of operators; nobody shares a commuter database.
- **Ethereum cryptography:** issuer keys are Ethereum keys. Roots are EIP-191 signed and recovered offline by the scanner. Groth16 on BN254, the curve Ethereum's precompiles use. Circom, snarkjs and zk-kit are Ethereum-ecosystem ZK tools.
- **Arkiv:** an Ethereum-native data layer (an L2 that fronts L3 DB-chains). It holds public, expiring, owner-signed evidence.
- **Honest scope:** privacy comes from the ZK proof, not from the chain. The chain and Arkiv make the system **neutral and checkable without trusting the issuer**. Say this before a judge asks "why blockchain?".

---

## 4. The demo (3:00 video and live)

| Time | Step |
|---|---|
| 0:00–0:20 | The problem in one sentence, Mumbai framing. "The scanner learns one thing: this pass is valid." |
| 0:20–0:45 | Passenger buys a pass (mock payment, said out loud). The app refreshes from Arkiv |
| 0:45–1:15 | Scanner in **airplane mode**. Passenger taps the lock screen, no unlock. **Green** in under 1 s. Show the same QR again: **Amber**, then **Red** |
| 1:15–1:55 | **Kill the issuer server on camera** (`Ctrl+C`, show it's down). Scanner still Green. Passenger refresh still works (from Arkiv). Show the issuer logs: nullifier batches only |
| 1:55–2:25 | Suspend the issuer on-chain (show the Etherscan tx). Scanner syncs: new roots from that issuer → Red. Revoke a pass: the synced scanner gives Red for it |
| 2:25–2:50 | Audit page: issuers, floor, roots with expiry, vk hash; one Arkiv query |
| 2:50–3:00 | Real numbers: proof time, verify latency, QR size. The repo link |

Never cut: the circuit, the offline verifier, the nullifier log, the kill-the-issuer moment.
