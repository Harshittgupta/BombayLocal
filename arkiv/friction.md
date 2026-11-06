# Arkiv friction log

Format per entry: Expected / Actual / Repro / Suggestion.

## 1. "Network ID" instead of chain id
- Expected: a stated Chain ID.
- Actual: https://docs.arkiv.network/ says "Network ID 7794095"; no page says "chain ID". eth_chainId returns 0x76edaf (= 7794095), so same number.
- Repro: curl -X POST https://rpc.rabdi.db-chain.testnet.arkiv.network -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
- Suggestion: label it Chain ID and add an add-network snippet.

## 2. Access-key RPC URL format undocumented
- Expected: docs show the keyed RPC URL for non-SDK clients (e.g. Kotlin).
- Actual: only `rabdi({accessKey})` embeds it; public RPC is "heavily rate limited".
- Repro: read /start-here/clients/.
- Suggestion: document the keyed URL format and rate limits.

## 3. Stale SDK version in README
- Expected: README matches the latest npm version.
- Actual: README sample package.json says ^0.9.0; npm latest is 1.0.1 and the `next` tag is 0.9.0-next.5.
- Repro: npm view @arkiv-network/sdk dist-tags
- Suggestion: update the sample and explain the tags.

## 4. Expiry unit missing on the first-entity and create pages
- Expected: unit stated where `expiration` is introduced.
- Actual: blocks (2 s) only appear on /writing/expiration/. The option is `expiration`, not `expiresIn`.
- Repro: read /start-here/first-entity/ and /writing/create/.
- Suggestion: state the unit on the create page.

## 5. No example filtering on $creator / $owner
- Expected: a code or raw-string example.
- Actual: /querying/filter/ lists them as filterable but only shows ownedBy.
- Repro: read /querying/filter/.
- Suggestion: add `$creator = addr(0x..)` example.

## 6. Missing limits and endpoints
- Expected: max ops per batch, per-tx and per-block caps; bytes JSON encoding; MCP URL; extend method name.
- Actual: none stated (Limits page, Batches page, /writing/change/); hub.arkiv.network/ai-tools lists MCP without a URL.
- Repro: read /reference/limits/, /writing/batches/.
- Suggestion: add them.

## 7. npm page returns 403 to automated fetch
- Minor; used the npm registry CLI instead.

## 8. `arkiv_getBlockTiming` uses snake_case, `arkiv_query` uses camelCase
- **Expected:** one naming style across `arkiv_*` responses.
- **Actual:** `arkiv_getBlockTiming` returns `current_block`, `current_block_time`, `duration`. `arkiv_query` returns `blockNumber` (a hex string), while `current_block` is a decimal number.
- **Repro:** `curl -X POST $ARKIV_RPC_URL -d '{"jsonrpc":"2.0","id":1,"method":"arkiv_getBlockTiming","params":[]}'`
- **Suggestion:** use one casing and one number encoding (hex vs decimal) in every response, and document both.

## 9. `arkiv_query` returns an undocumented `cursor`
- **Expected:** paging by `limit` + `offset` only. The query docs say keyset paging (`$key > key(..)`) is the way to page without gaps, and no cursor is mentioned.
- **Actual:** a page that may have more rows comes back with `"cursor":"b64:CnPKK4RBwb8AAAAAAAAAAQ"` next to `data` and `blockNumber`. The SDK 1.0.1 `runQuery` ignores it.
- **Repro:** `arkiv_query` with `"limit":"0x1"` against a filter that matches more than one entity.
- **Suggestion:** document the cursor (how to pass it back, how long it stays valid) or remove it. A Kotlin client written only from the docs would never use it.

## 10. `rabdi()` throws without an access key, but the public endpoint works fine
- **Expected:** `rabdi()` with no arguments uses the public RPC, as the plain `https://rpc.rabdi…` URL in the docs suggests.
- **Actual:** `rabdi()` throws `MissingAccessKeyError`. You must pass `rabdi({ accessKey: "" })`, which then prints a rate-limit warning on every process start, even when a custom `http(ARKIV_RPC_URL)` transport overrides the URL.
- **Repro:** `import { rabdi } from "@arkiv-network/sdk/chains"; rabdi()`.
- **Suggestion:** make the key optional and warn only when the chain's own URL is actually used.

## 11. Raw JSON-RPC values have a different shape from the SDK's
- **Expected:** the docs' `{name, type, value}` attributes with the value in its natural form.
- **Actual:** u64 values come back as hex quantities (`"0x4"`), bytes as `0x` hex, and addresses lowercased. Attributes are sorted by name, and the SDK-added `arkiv.schema` attribute appears too. None of this is on the JSON-RPC page, and a non-JS client (our Kotlin scanner) needs every one of these facts.
- **Repro:** the judge query in `arkiv/schema.md`.
- **Suggestion:** add one full raw response with every attribute type to the JSON-RPC docs.

## 12. `ExpirationTime.fromSeconds` throws on an odd number of seconds
- **Expected:** `fromSeconds(n)` rounds to whole blocks (2 s), since the docs say to compute expiry "from durations", and a deadline minus `now` is any integer.
- **Actual:** `InvalidExpiryError: a lifetime must be a multiple of the 2s block time, got 133187`. It is thrown at write time, so in our flow it fired AFTER the on-chain `postRoot`, which left root 4 on Sepolia with no SignedRoot on Arkiv. Our first live run passed only because that lifetime happened to be even.
- **Repro:** `ExpirationTime.fromSeconds(133187)`.
- **Suggestion:** round up by default, or add `{ round: "up" }`, and state the multiple-of-block rule on the expiration page. (Our fix: `lifetimeSeconds()` rounds up, and the publisher re-publishes a missing SignedRoot for the latest root on the next run.)

## 13. The public endpoint rate-limits phones hard, with no keyed URL for non-SDK clients
- **Expected:** a clear rate limit we can design around, and a keyed endpoint the Android apps can use (they read
  Arkiv over raw JSON-RPC, not the JS SDK).
- **Actual:** while two phones on one network ran our live-sync tests at the same time (2026-11-06), Arkiv calls from
  the phones failed: HTTP 429 on the passenger, failed `arkiv_query` reads on the scanner. The laptop on another
  network was unaffected, and the phones recovered after about 5 minutes. No error body says which limit was hit or
  when to retry, and there is still no documented keyed URL for a non-SDK client (see entry 2).
- **Repro:** run several paged `arkiv_query` reads per second from one IP for a minute
  (`cd issuer && npm run arkiv-roundtrip` in parallel with an app refresh is enough).
- **Suggestion:** return `Retry-After`, document the per-IP budget, and publish the keyed RPC URL format so mobile
  clients can use an access key.
