// Test-only Groth16 engine for the JVM unit tests: the SAME snarkjs 0.7.6 groth16.verify the app runs in its WebView.
// Reads one JSON request per line on stdin ({vk, publicSignals, proof}) and answers "true" / "false" / "error: <msg>".
// argv[2] = a package.json whose node_modules has snarkjs (circuits/package.json).
import { createRequire } from "node:module";
import { createInterface } from "node:readline";

const snarkjs = createRequire(process.argv[2])("snarkjs");
const vkCache = new Map();
const rl = createInterface({ input: process.stdin });
const queue = [];
let busy = false;

async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const line = queue.shift();
    try {
      const req = JSON.parse(line);
      let vk = vkCache.get(req.vk);
      if (!vk) {
        vk = JSON.parse(req.vk);
        vkCache.set(req.vk, vk);
      }
      const ok = await snarkjs.groth16.verify(vk, req.publicSignals, req.proof);
      process.stdout.write((ok === true ? "true" : "false") + "\n");
    } catch (e) {
      process.stdout.write("error: " + String(e && e.message).replace(/\n/g, " ") + "\n");
    }
  }
  busy = false;
}

rl.on("line", (l) => {
  queue.push(l);
  drain();
});
rl.on("close", async () => {
  await drain();
  process.exit(0);
});
