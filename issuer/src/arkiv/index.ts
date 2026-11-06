import { loadArkivEnv, makeArkivPublic, makeArkivWallet, type ArkivEnv } from "./client.ts";
import { ArkivReader } from "./reader.ts";
import { ArkivWriter } from "./writer.ts";

export * from "./client.ts";
export * from "./codec.ts";
export * from "./expiry.ts";
export * from "./reader.ts";
export * from "./schemas.ts";
export * from "./types.ts";
export * from "./writer.ts";

/** A reader plus a writer that signs with `privateKey` (issuer key, or the authority key for publishVk). */
export function makeArkiv(privateKey: string, env: ArkivEnv = loadArkivEnv()): { reader: ArkivReader; writer: ArkivWriter } {
  const reader = new ArkivReader(makeArkivPublic(env));
  return { reader, writer: new ArkivWriter(makeArkivWallet(privateKey, env), reader) };
}
