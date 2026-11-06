// Bundles scripts/e2e-live.ts for Node with the same config the site build uses, then runs it from _site (zk/ files).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
const here = dirname(fileURLToPath(import.meta.url));
const dep = JSON.parse(readFileSync(join(here, "../deployments.json"), "utf8")).sepolia;
const manifest = JSON.parse(readFileSync(join(here, "../circuits/artifacts/manifest.json"), "utf8"));
const config = {
  chainId: dep.chainId, registry: dep.registry, issuer: dep.issuer, authority: dep.authority,
  vkSha256: manifest.sha256["verification_key.json"], issuerUrl: "https://bombaylocal-issuer.duckdns.org",
  sepoliaRpcs: ["https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.gateway.tenderly.co"],
  arkivRpc: "https://rpc.rabdi.db-chain.testnet.arkiv.network", commit: "e2e",
};
const out = join(here, ".e2e-bundle.mjs"); // next to node_modules, so the external snarkjs import resolves
await esbuild.build({ entryPoints: [join(here, "scripts/e2e-live.ts")], bundle: true, platform: "node", format: "esm",
  target: "node22", outfile: out, external: ["snarkjs"], define: { __UNLINK_CONFIG__: JSON.stringify(config) },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
try {
  execFileSync(process.execPath, [out], { cwd: join(here, "_site"), stdio: "inherit" });
} finally {
  (await import("node:fs")).rmSync(out, { force: true });
}
