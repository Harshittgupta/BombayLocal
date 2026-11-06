# Arkiv notes (read 2026-11-06). Docs root: https://docs.arkiv.network (index: /llms.txt)

## 1. Network (https://docs.arkiv.network/ home page)
- Rabdi testnet, "RABDI DB-CHAIN". Page calls 7794095 "Network ID"; eth_chainId on the RPC returned 0x76edaf = 7794095 (probed live). .env MATCHES.
- HTTP https://rpc.rabdi.db-chain.testnet.arkiv.network ; WS wss://rpc.rabdi.db-chain.testnet.arkiv.network
- Explorer https://rabdi.explorer.arkiv.network ; faucet https://hub.arkiv.network/faucet (token tGLM) ; status https://status.arkiv.network/
- Public RPC is "heavily rate limited"; free access key at https://hub.arkiv.network/access-keys (/start-here/first-entity/). SDK `rabdi({accessKey})` puts the key in the RPC URL.
  UNKNOWN: exact keyed URL format (check node_modules/@arkiv-network/sdk chains). A Kotlin client needs it too.
- Block time 2 s on Rabdi (/start-here/introduction/); live arkiv_getBlockTiming returned duration 2.

## 2. SDK (npm registry via `npm view`; https://github.com/Arkiv-Network/arkiv-sdk-js)
- `npm install @arkiv-network/sdk viem`; latest = 1.0.1 (dist-tags: next 0.9.0-next.5). PIN "@arkiv-network/sdk": "1.0.1". peer: viem ^2, typescript >=5. Node >= 22.10.
- README sample package.json shows ^0.9.0 (stale vs 1.0.1; see friction).
- Imports (/start-here/clients/): `rabdi` from "@arkiv-network/sdk/chains"; `createPublicClient, createWalletClient` from "@arkiv-network/sdk"; `http` from "viem"; `privateKeyToAccount` from "viem/accounts".
- `const chain = rabdi({ accessKey })`; `createPublicClient({ chain, transport: http() })`; `createWalletClient({ chain, transport: http(), account })`.
- npm page returned 403 to WebFetch; used registry CLI instead.

## 3. Create (/writing/create/, /schemas/column-types/, /writing/expiration/)
- `const { entityKey, txHash, expiresAt } = await walletClient.createEntity(Schema, values, { expiration: ExpirationTime.fromDays(30) })`; optional 4th arg tx fields (gas, nonce, gasPrice or maxFeePerGas). expiresAt = block number.
- No single "payload": data lives in typed columns via `defineSchema("my-app.x", { author: addr().indexed(), title: str(), body: bytes() })`. Types: bool, i32, u64, u256, dec (18dp), str (<=128 B UTF-8), addr, key, bytes (<=128 KiB). `.indexed()` needed to filter; bytes cannot be indexed. Values wrapped: dec("4.5"), addr(x), u64(n); bytes takes Uint8Array or hex; reads return hex.
- Numeric vs string: i32/u64/u256/dec compare by value; str/addr/key compare bytewise. Named schema adds str attribute `arkiv.schema`.
- Expiry unit = BLOCKS (2 s each). ExpirationTime.fromSeconds/Minutes/Hours/Days/Weeks/Months(30d)/Blocks/max()/atBlock/atDate. Max 7,884,000 blocks (~182.5 d) from the create/extend block. Min: UNKNOWN.
- Batch (/writing/batches/): `walletClient.executeBatch({ creates:[{schema, values, expiration}], patches, extensions, ownershipChanges, deletes })` -> tx hash + `createdEntities` (keys, same order); atomic. Max ops per batch: UNKNOWN.

## 4. Update/delete/extend (/writing/change/, /writing/expiration/)
- `walletClient.patchEntity(Schema, entityKey, { ..., unset:["summary"] })`, `walletClient.changeOwnership({ newOwner, ... })` (full arg shape UNKNOWN), `walletClient.deleteEntity({ entityKey })`. Extend method name UNKNOWN (check /typescript-sdk/api-reference/); rule: earlier expiry rejected, equal is no-op, durations count from now.
- Only $owner may patch/delete/extend (unless created with `permissionlessExtension`; `readonly` blocks patches; flags immutable). $owner changeable via changeOwnership; $creator never changes (/start-here/introduction/).

## 5. Query (/reference/query-language/, /querying/*)
- Raw string: `category = str('news') AND score > dec(4) ORDER BY score:dec DESC`. Ops: = < <= > >= BETWEEN STARTSWITH EXISTS(n) TYPEOF(n)=t; AND binds tighter than OR; bare number = i32; `$key $owner $creator $expiresAt` filterable/sortable (key/addr/addr/u64); one ORDER BY attribute only; only indexed attrs match.
- SDK: `publicClient.select({$key:true,title:true}).from(Schema).where(and(eq(..),..)).ownedBy(a).limit(n).offset(n).fetch()`; `publicClient.query(condition|string, {select,limit,offset,count,orderBy})`; `getEntity`. Filter page says `createdBy` shortcut exists.
- Page max 100 rows (default 100). Keyset paging: ORDER BY $key ASC + `$key > key(0x..)`. No cursor.

## 6. Limits (/reference/limits/, /json-rpc/mutating-entities/)
- bytes value 128 KiB and all bytes per create/patch 128 KiB total; 32 attrs (31 named schema); names 32 B; str 128 B; page 100. Per-tx / per-block caps: UNKNOWN (docs say not stated). RPC may cap response size.

## 7. JSON-RPC reads (https://docs.arkiv.network/json-rpc/querying-data/)
- `arkiv_query(queryString, {select:{key,owner,creator,createdAt,updatedAt,expiresAt,creationFlags,attributes,attributeSchema,count}, limit 1..100, offset})` -> {data:[{key,attributes:[{name,type,value}]}], blockNumber, count?}. Example uses hex quantity "0xa" for limit. `arkiv_getEntity(key)` -> entity or null. `arkiv_getBlockTiming()` -> {current_block,current_block_time,duration}.
- Errors: -32001 parse, -32002 type, -32003 value, -32004 limits, -32602 params.
- Example: {"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["arkiv.schema = str('my-app.posts') AND category = str('news')",{"select":{"key":true,"attributes":true},"limit":"0xa"}]}
- Writes (/json-rpc/mutating-entities/): no arkiv_* method; eth_sendRawTransaction to 0x4400000000000000000000000000000000000044, `execute((uint8 operation, bytes operationData)[] ops)` selector 0x49650044; tags 1 create, 2 patch, 3 extend, 4 transfer, 5 delete; attribute lists sorted by name.
- JSON encoding of bytes attributes and of the creator/owner select fields: UNKNOWN, test live.

## 8. Example query string (composed from the grammar in section 5; NOT run against a node)
`type = str('unlink.leafBatch') AND issuer = addr(0xISSUER) AND $creator = addr(0xISSUER) AND $owner = addr(0xISSUER) ORDER BY $key ASC`
UNKNOWN: whether `type` is a reserved word (docs: reserved words cannot be attribute names; list not seen), and whether writes without a defineSchema are allowed. Check before naming attributes.

## AI tools
- https://hub.arkiv.network/ai-tools lists "Arkiv AI plugin", MCP ("Arkiv tools and the ETHGlobal Mumbai event guide"), Skills, npm tools; no install command or MCP endpoint shown. Docs have an "Agent Skills" page under Tools (URL not seen). UNKNOWN: MCP URL.

**Verified live 2026-11-06** (curl, public RPC): `eth_chainId` → `0x76edaf` (7794095). `arkiv_query("$owner = addr(0x8d37…060B)", {limit:5, select:{key,owner,creator,attributes}})` → `{"data":[],"blockNumber":"0x4261f"}`. `arkiv_getBlockTiming()` → `{"current_block":271903,"current_block_time":1793929568,"duration":2}`; 2 s blocks confirmed. Issuer wallet balance on Rabdi: 10 tGLM.
