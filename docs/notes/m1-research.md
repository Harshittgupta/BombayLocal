# M1 research notes (read 2026-11-05)
Src LI = https://github.com/privacy-scaling-explorations/zk-kit/blob/main/packages/lean-imt/src/lean-imt.ts
## Part 1 LeanIMT (@zk-kit/lean-imt, npm latest 2.2.5: https://registry.npmjs.org/@zk-kit/lean-imt/latest)
1. update(index:number,newLeaf:N) validates only `requireDefined(index)`, `requireDefined(newLeaf)`, `requireNumber(index)` (LI). No zero check, no range check on index.
   requireDefined throws TypeError only if `!isDefined(v)` (https://github.com/privacy-scaling-explorations/zk-kit/blob/main/packages/utils/src/error-handlers.ts).
   UNKNOWN: isDefined body (not read; check @zk-kit/utils type-checks - presumably `!== undefined`, so 0/0n pass; test it with 0n).
   insert(leaf) = `requireDefined(leaf,"leaf")` only -> 0 not rejected by validation (LI). No `remove` method (grep of LI: only insert, insertMany, update, updateMany, generateProof, indexOf, has, verifyProof, export/import).
   updateMany throws on length mismatch, out-of-range index, repeated index (LI).
2. update walks levels: `this._nodes[level][index]=node; if(index&1){node=hash(sibling,node)} else {sibling=nodes[level][index+1]; if(sibling!==undefined) node=hash(node,sibling)}` (LI ~l.205-235).
   So 0 is stored as an ordinary leaf and hashed normally with its sibling; promotion (node passes up unchanged) happens only when the right sibling is undefined. A leaf of 0 is not "missing".
3. generateProof(index) throws if index<0 || index>=size. Returns `{root, leaf, index, siblings}` (LI ~l.298-333).
   Per level: `if(sibling!==undefined){path.push(isRightNode); siblings.push(sibling)}`; `index: path.length===0?0:parseInt(path.reverse().join(""),2)`.
   => proof.index is a COMPRESSED path (bits only for levels with a sibling), NOT the leaf index (source comment: "index might be different from the original index of the leaf"). siblings.length = number of levels with a sibling = value to pass as circuit `depth`/merkleProofLength; may be < tree.depth.
## Part 2 circom (https://github.com/privacy-scaling-explorations/zk-kit.circom/blob/main/packages/binary-merkle-root/src/binary-merkle-root.circom)
5. `template BinaryMerkleRoot(MAX_DEPTH){ signal input leaf, depth, index, siblings[MAX_DEPTH]; signal output out; ... signal indices[MAX_DEPTH] <== Num2Bits(MAX_DEPTH)(index);`
   loop i<MAX_DEPTH: `isDepth=IsEqual()([depth,i]); roots[i]<==isDepth*nodes[i]; root+=roots[i]; childNodes=MultiMux1(2)([[nodes[i],siblings[i]],[siblings[i],nodes[i]]], indices[i]); nodes[i+1]<==Poseidon(2)(childNodes);` then `out <== root + IsEqual()([depth,MAX_DEPTH])*nodes[MAX_DEPTH]`. pragma circom 2.1.5; includes poseidon, mux1, comparators.
   Booleanity: indices come from Num2Bits(MAX_DEPTH)(index) inside the template, so bits are constrained; caller passes ONE integer `index`, not an array. Index must fit in MAX_DEPTH bits (Num2Bits fails otherwise).
   Depth: header comment "This circuit will successfully verify `out = 0` for `depth > MAX_DEPTH`. Make sure to enforce `depth <= MAX_DEPTH` outside the circuit." -> out=0 when depth>MAX_DEPTH; no internal range check. Note: depth<MAX_DEPTH is selected by IsEqual; depth=0 -> out=leaf.
   Hash is Poseidon(2) (circomlib), compare with the TS hash you give LeanIMT (must match).
6. Semaphore v4 (https://github.com/semaphore-protocol/semaphore/blob/main/packages/circuits/src/semaphore.circom): `signal input merkleProofLength, merkleProofIndex, merkleProofSiblings[MAX_DEPTH];` and
   `merkleRoot <== BinaryMerkleRoot(MAX_DEPTH)(identityCommitment, merkleProofLength, merkleProofIndex, merkleProofSiblings);` -> passes single index (no Num2Bits in Semaphore; it is inside the template). UNKNOWN: whether Semaphore enforces merkleProofLength<=MAX_DEPTH (not seen in lines read; grep the file).
## Part 3 Arkiv (SDK @arkiv-network/sdk 1.0.1, peer viem ^2, Node>=18: https://registry.npmjs.org/@arkiv-network/sdk/latest)
7. Expiry is in BLOCKS; 2 s/block (https://docs.arkiv.network/writing/expiration/). createEntity option `expiration` (not expiresIn/BTL); returns `{entityKey, txHash, expiresAt}`; query field `$expiresAt`.
   Helper `ExpirationTime`: fromSeconds(n, multiple of 2), fromMinutes/Hours/Days/Weeks/Months(30d)/Blocks, max(), atBlock, atDate, atLeast. Max lifetime 7,884,000 blocks (~182.5d) from create/extension block (https://docs.arkiv.network/reference/limits/).
   Extend: `extendEntity` with new `expiration`; duration counts from now, earlier-than-current rejected; only owner unless created with flag `permissionlessExtension` (then anyone).
8. Create op fields: salt, expiresAt, minLifetime, creationFlags, attributes - NO owner field (https://docs.arkiv.network/json-rpc/mutating-entities/). Owner = tx sender is implied, not stated -> UNKNOWN: confirm on testnet that $owner==$creator==sender at create.
   Transfer: `changeOwnership(entityKey,newOwner)` (batch key `ownershipChanges`); `$creator` stays the original creator. Only owner can patch/transfer/delete ("Only the owner can do any of these"); `readonly` flag blocks patch but allows extend/handoff/delete (https://docs.arkiv.network/writing/change/, /writing/create/).
9. Query (https://docs.arkiv.network/reference/query-language/): fields `$key $owner $creator $expiresAt` filterable; ops `= < <= > >= BETWEEN a AND b`, `STARTSWITH` (str only), `EXISTS(name)`, `TYPEOF(name)=t`, AND/OR/parens, `ORDER BY attr:type ASC|DESC` (one attr). Typed literals required: `str('x')` (quote doubled), `i32(-7)`, `u64()`, `u256()`, `dec()`, `addr(0x..)`, `key(0x..)`; bare number = i32; type-aware match; only indexed attrs match.
   e.g. `$owner = addr(0x...)` (form inferred from the grammar, not shown verbatim - UNKNOWN: verify). Page size max 100 (MAX_LIMIT from `@arkiv-network/sdk/query`).
10. Limits (https://docs.arkiv.network/reference/limits/): 32 attrs/entity (31 w/ named schema), name 32 B, str value 128 B, each bytes value 128 KiB, total bytes per create/patch 128 KiB (MAX_ENTITY_BYTES). Per-TRANSACTION/batch limit: UNKNOWN (not stated; check node/batch behaviour).
   Testnet Rabdi DB-chain, chain id 7794095 (0x76edaf), RPC https://rpc.rabdi.db-chain.testnet.arkiv.network, WS wss://rpc.rabdi.db-chain.testnet.arkiv.network, 2 s blocks (https://docs.arkiv.network/networks/rabdi/). SDK: `rabdi` from `@arkiv-network/sdk/chains` (https://docs.arkiv.network/start-here/clients/). Public RPC heavily rate-limited; access keys at hub.arkiv.network.
## Notes (<=5 lines)
- Revocation by update(i,0n) is valid but proof.index/siblings are compressed: always pass siblings.length as depth and proof.index as circuit index; pad siblings with 0 to MAX_DEPTH.
- Fix MAX_DEPTH and assert depth<=MAX_DEPTH in the outer circuit. Arkiv entities expire (<=182.5d): plan extension owner.
