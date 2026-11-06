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
