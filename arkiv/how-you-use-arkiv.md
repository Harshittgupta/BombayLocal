# How BombayLocal uses Arkiv

Entity schema: [schema.md](schema.md). Writers:
- **Issuer** `0x8d3713FBad1A2E40F40de56D37eab09513cb060B`: SignedRoot, LeafBatch, Revocation, ScannerList.
- **Authority** `0x153d390680704090AaA24657697f15e6b91Da23f`: VerifyKey.

Network: Rabdi testnet, chain 7794095.

**Live counts** (2026-11-07):

| Entity | Count |
|---|---|
| SignedRoot | 18 live (rootIds 3–20) |
| LeafBatch | 16 (25 passes) |
| Revocation | 9 |
| ScannerList | 2 |
| VerifyKey | 1 |

The issuer has sent 46 Arkiv transactions.

## Filters
Every read filters on `app`, `type` and the writer, **and** on `$creator = $owner = writer`. Each returned row is
re-checked in code too, because anyone can write an entity with any attributes. The same filters run in four
readers:
- the issuer (`issuer/src/arkiv/reader.ts`);
- the passenger app (`ArkivClient.kt`);
- the scanner (`ArkivReader.kt`);
- the web demo (`web/src/chain.ts`) and the audit page (`audit/index.html`).

| Read | Query (abridged) | Used by |
|---|---|---|
| The root the phone must use | `type = str('unlink.signedRoot') AND issuer = addr(I) AND rootId = u64(N)` + creator/owner | Passenger, web demo, audit |
| The pass list | `type = str('unlink.leafBatch') …` paged with `$key > key(..) ORDER BY $key ASC` | Passenger, web demo |
| Revocations | `type = str('unlink.revocation') …` | Passenger, web demo |
| Scanner allow-list | `type = str('unlink.scannerList') … ORDER BY listNo:u64 DESC` | Scanner, audit |
| Verification key | `type = str('unlink.verifyKey') AND vkSha256 = str('<pinned hash>') …` | Scanner, web demo, audit |

Try one (count of live pass batches):
```sh
curl -s -X POST https://rpc.rabdi.db-chain.testnet.arkiv.network -H 'content-type: application/json' --data \
'{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["type = str('"'"'unlink.leafBatch'"'"') AND issuer = addr(0x8d3713FBad1A2E40F40de56D37eab09513cb060B) AND $creator = addr(0x8d3713FBad1A2E40F40de56D37eab09513cb060B) AND $owner = addr(0x8d3713FBad1A2E40F40de56D37eab09513cb060B)",{"select":{"key":true,"attributes":true},"limit":"0x64"}]}'
```

## Ownership
`$creator` and `$owner` are the trust anchor. A record counts only if the chain says the issuer's wallet wrote it and
still owns it. The SignedRoot is also EIP-191-signed by the same key, and its root must equal
`Registry.issuerState(issuer).latestRoot` on Ethereum. A forged or injected entity is ignored, and a withheld one only
delays a refresh: the old root keeps working until it expires.

## Expiry
Lifetimes are set in 2-second blocks, matched to how long the data is useful:

| Entity | Lifetime |
|---|---|
| LeafBatch | Until 2 days after the last pass in it expires. The issuer first zeroes it with a Revocation, so phones never need a vanished batch. |
| SignedRoot | Its 36 h validity + 1 h |
| Revocation | The batches it touches + 1 day |
| ScannerList | 7 days, re-published on change |
| VerifyKey | 30 days, extended |

Expired passes therefore **leave Arkiv on their own**, and a phone downloads only live passes (32 bytes each).
A recorded run of a 2-minute entity disappearing on schedule is in [expiry-demo.txt](expiry-demo.txt).

## Does each feature change what users see?
| Arkiv feature | What the user sees |
|---|---|
| LeafBatch + Revocation reads | BombayLocal Pass shows **"Ready offline"** after rebuilding the list, or **"Pass revoked"** / **"Pass activates at the next update"** |
| SignedRoot read | The pass card's QR exists only once a signed root that covers the pass is on Arkiv. The web demo shows "Rebuilt the list of N passes from Arkiv; it matches Ethereum". |
| VerifyKey read | The scanner's chip turns **"Synced"** only with the pinned key; a wrong key is rejected, so it keeps the old key |
| ScannerList read | Scanner Settings shows **"this scanner listed"**; the issuer accepts scan batches only from listed scanners |
| Expiry | The download stays proportional to live passes; old roots fall off and phones move to the newest |
| Public reads | The [audit page](https://harshittgupta.github.io/BombayLocal/audit/) turns its "latest root on Arkiv = root on Ethereum" claim green or red, live |
