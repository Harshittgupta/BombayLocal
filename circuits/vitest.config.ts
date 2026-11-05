import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Real Groth16 proofs take ~2 s each on a laptop, more on CI runners.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // snarkjs spawns its own worker threads; run test files in child processes.
    pool: "forks",
  },
});
