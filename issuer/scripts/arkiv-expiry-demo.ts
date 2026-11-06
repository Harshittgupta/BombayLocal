// Shows Arkiv expiry working on the REAL Rabdi testnet: creates a throwaway entity with a 2-minute lifetime, finds
// it by query, waits until its expiry block has passed, then shows the same query and arkiv_getEntity return nothing.
// Usage (from issuer/):  npm run arkiv-expiry      (needs ISSUER_PRIVATE_KEY in ../.env and tGLM on Rabdi)
import { ExpirationTime, NoEntityFoundError } from "@arkiv-network/sdk";
import { and, eq } from "@arkiv-network/sdk/query";
import { addr, key, u64 } from "@arkiv-network/sdk/schema";
import type { Hex } from "viem";
import { makeArkivPublic, makeArkivWallet } from "../src/arkiv/client.ts";
import { APP, ExpiryDemoSchema, SCHEMA_VERSION, TYPE } from "../src/arkiv/schemas.ts";

const pk = process.env.ISSUER_PRIVATE_KEY;
if (!pk) throw new Error("set ISSUER_PRIVATE_KEY");
const pub = makeArkivPublic();
const wallet = makeArkivWallet(pk);
const me = wallet.account.address;
const stamp = () => new Date().toISOString().slice(11, 19);

const { entityKey, txHash, expiresAt } = await wallet.createEntity(
  ExpiryDemoSchema,
  { app: APP, v: u64(SCHEMA_VERSION), type: TYPE.expiryDemo, issuer: addr(me), note: `expiry demo ${new Date().toISOString()}` },
  { expiration: ExpirationTime.fromMinutes(2) }, // = 60 blocks at 2 s
);
const created = await pub.getBlockTiming();
console.log(`[${stamp()}] created ${entityKey}`);
console.log(`           tx ${txHash}  (https://rabdi.explorer.arkiv.network/tx/${txHash})`);
console.log(`           block ${created.currentBlock}, expiresAt block ${expiresAt} (+${expiresAt - created.currentBlock} blocks)`);

const query = () =>
  pub
    .select({ $key: true, $expiresAt: true })
    .from(ExpiryDemoSchema)
    .where(and(eq("type", TYPE.expiryDemo), eq("issuer", addr(me)), eq("$key", key(entityKey as Hex))))
    .createdBy(me)
    .ownedBy(me);
console.log(`           query: ${query().toString()}`);

const before = await query().fetch();
console.log(`[${stamp()}] query before expiry -> ${before.entities.length} entity (expiresAt ${before.entities[0]?.$expiresAt})`);
if (before.entities.length !== 1) throw new Error("entity not found right after create");

for (;;) {
  const t = await pub.getBlockTiming();
  if (t.currentBlock > expiresAt) {
    console.log(`[${stamp()}] block ${t.currentBlock} > expiresAt ${expiresAt}`);
    break;
  }
  console.log(`[${stamp()}] block ${t.currentBlock}, ${expiresAt - t.currentBlock} blocks to go`);
  await new Promise((r) => setTimeout(r, 15_000));
}

const after = await query().fetch();
console.log(`[${stamp()}] query after expiry -> ${after.entities.length} entities`);
let gone = false;
try {
  await pub.getEntity(entityKey as Hex);
} catch (e) {
  gone = e instanceof NoEntityFoundError;
  if (!gone) throw e;
}
console.log(`[${stamp()}] arkiv_getEntity -> ${gone ? "null (entity is gone)" : "STILL PRESENT"}`);
if (after.entities.length !== 0 || !gone) throw new Error("entity still present after its expiry block");
console.log("EXPIRY OK: the entity was readable before its expiry block and is gone after it.");
process.exit(0);
