// Builds the static demo site into web/_site (deployed by .github/workflows/pages.yml):
//   index.html, demo.css, demo.js (src/ bundled with protocol/), zk/ (snarkjs + circuit files), audit/ (the audit page).
// Config comes from the single sources of truth: deployments.json and circuits/artifacts/manifest.json. The circuit
// files are copied from the committed passenger-app assets and their sha256 must match the manifest, or the build fails.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(here, "_site");
const www = join(root, "apps/passenger/app/src/main/assets/www");

const dep = JSON.parse(readFileSync(join(root, "deployments.json"), "utf8")).sepolia;
const manifest = JSON.parse(readFileSync(join(root, "circuits/artifacts/manifest.json"), "utf8"));
const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

let commit = process.env.GITHUB_SHA ?? "";
if (!commit) {
  try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim(); } catch { commit = "local"; }
}

const config = {
  chainId: dep.chainId,
  registry: dep.registry,
  issuer: dep.issuer,
  authority: dep.authority,
  vkSha256: manifest.sha256["verification_key.json"],
  issuerUrl: "https://unlink-issuer.duckdns.org",
  sepoliaRpcs: ["https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.gateway.tenderly.co"],
  arkivRpc: "https://rpc.rabdi.db-chain.testnet.arkiv.network",
  commit,
};

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "zk"), { recursive: true });
mkdirSync(join(out, "audit"), { recursive: true });

await esbuild.build({
  entryPoints: [join(here, "src/main.ts")],
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  legalComments: "none",
  outfile: join(out, "demo.js"),
  define: { __UNLINK_CONFIG__: JSON.stringify(config) },
});

for (const f of ["index.html", "demo.css"]) copyFileSync(join(here, "static", f), join(out, f));

for (const f of ["pass.wasm", "pass_final.zkey", "verification_key.json"]) {
  const got = sha256(join(www, f));
  if (got !== manifest.sha256[f]) throw new Error(`${f}: sha256 ${got} != manifest ${manifest.sha256[f]}`);
  copyFileSync(join(www, f), join(out, "zk", f));
}
copyFileSync(join(www, "snarkjs.min.js"), join(out, "zk", "snarkjs.min.js"));
copyFileSync(join(root, "audit/index.html"), join(out, "audit/index.html"));
writeFileSync(join(out, ".nojekyll"), "");

console.log(`built web/_site (commit ${commit.slice(0, 7)}, vk ${config.vkSha256.slice(0, 12)}…)`);
