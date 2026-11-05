# Mobile ZK on Android (Kotlin): mopro vs snarkjs-in-WebView   (read 2026-11-06)
Rule: every line has a source; UNKNOWN = not confirmed, test in the spike.

## Option A: mopro (Rust + UniFFI -> Kotlin)
- Version: mopro-cli 0.3.7, mopro-ffi 0.3.7, released 2026-07-14. https://crates.io/api/v1/crates/mopro-cli ; https://github.com/zkmopro/mopro/releases ; docs v0.3 https://zkmopro.org/docs/getting-started
- Circom prover crate: circom-prover 0.1.4 (arkworks 0.5 deps; optional rust-rapidsnark, witnesscalc). https://docs.rs/circom-prover/0.1.4/circom_prover/
- Install/flow: `cargo install mopro-cli` -> `mopro init` (pick adapter "circom") -> `mopro build` (android, release, pick archs aarch64-linux-android / x86_64-linux-android / armv7-linux-androideabi / i686-linux-android) -> `mopro create` (android). https://zkmopro.org/docs/getting-started ; cmd list https://raw.githubusercontent.com/zkmopro/mopro/main/cli/README.md
- Prereqs: Rust, CMake, Android Studio + JDK + "NDK (Side by Side)", ANDROID_HOME / NDK_PATH env vars (doc example NDK 26.1.10909125). https://zkmopro.org/docs/prerequisites
- Windows: UNKNOWN (docs silent; examples are macOS paths). Only hint: old Noir-specific post marks Windows MSVC target unsupported, WSL relies on x86_64 emulators: https://164ae96a.mopro.pages.dev/blog/noir-integraion . Check: build under WSL2 Ubuntu with the Linux NDK.
- Artifacts consumed: pre-built .zkey + .wasm (no .r1cs in template test-vectors: multiplier2.wasm + multiplier2_final.zkey). https://github.com/zkmopro/mopro/tree/main/cli/src/template/init/test-vectors/circom ; https://zkmopro.org/docs/prerequisites
- Witness gen (default rust-witness): transpiles the .wasm to C at BUILD time, build.rs: `rust_witness::transpile::transpile_wasm("./test-vectors/circom".to_string())` (needs C toolchain; Windows UNKNOWN). lib.rs wiring: `rust_witness::witness!(multiplier2);` and `set_circom_circuits! { ("multiplier2_final.zkey", circom_prover::witness::WitnessFn::RustWitness(witness::multiplier2_witness)), }`. For us by analogy: pass.wasm / "pass_final.zkey" / pass_witness (UNKNOWN until built). https://raw.githubusercontent.com/zkmopro/mopro/main/cli/src/template/circom/lib.rs ; https://zkmopro.org/docs/adapters/circom (zkey filename must match macro)
- Whether the circom 2.2.3 pass.wasm transpiles cleanly with rust-witness: UNKNOWN.
- Provers: ProofLib.ARKWORKS (default, pure Rust) and RAPIDSNARK (cargo feature `rapidsnark`; Android prebuilt lib availability UNKNOWN). BN254 accepted (curve check BN254/BLS12-381). https://zkmopro.org/docs/adapters/circom ; https://raw.githubusercontent.com/zkmopro/mopro/main/cli/src/template/init/src/circom.rs
- Kotlin API (package `uniffi.<crate_name_with_underscores>`; add `net.java.dev.jna:jna:5.13.0@aar`; copy jniLibs/ and uniffi/ into app): https://zkmopro.org/docs/setup/android-setup
    generateCircomProof(zkeyPath: String, circuitInputs: String, proofLib: ProofLib): CircomProofResult
    verifyCircomProof(zkeyPath: String, proofResult: CircomProofResult, proofLib: ProofLib): Boolean   (BOTH exist)
  Input = JSON string, each signal -> list of decimal strings: `{"b":["5"],"a":["3"]}` (Rust test also uses `{"a": 2, "b": 3}`). https://raw.githubusercontent.com/zkmopro/mopro/main/cli/src/template/init/tests/bindings/circom/test_multiplier2.kts
  zkeyPath must be a real file path -> copy the asset to filesDir first. https://zkmopro.org/docs/setup/android-setup
- Return: CircomProofResult(proof: CircomProof(a: G1, b: G2, c: G1, protocol: String, curve: String), inputs: List<String>); G1(x,y,z: String); G2(x,y,z: List<String>, 2 entries each); decimal BigUint strings; inputs = public signals. https://raw.githubusercontent.com/zkmopro/mopro/main/cli/src/template/init/src/circom.rs
  Shape mirrors snarkjs pi_a/pi_b/pi_c (+protocol/curve), but no doc says snarkjs-compatible: UNKNOWN. Check G2 Fp2 coefficient order and z=="1" by verifying the output with snarkjs + verification_key.json.
- verify takes the zkey (no verification_key.json needed). Kotlin exception class for MoproError::CircomError: UNKNOWN.
- Poseidon/hash exposed to Kotlin: none seen in mopro-ffi (Cargo.toml, README, circom.rs). https://raw.githubusercontent.com/zkmopro/mopro/main/mopro-ffi/Cargo.toml

## Option B: snarkjs 0.7.6 in Android WebView
- snarkjs npm latest 0.7.6 (same as our setup); exports browser ESM `./build/browser.esm.js`, UMD `./build/snarkjs.min.js`. https://raw.githubusercontent.com/iden3/snarkjs/master/package.json
- Browser use: `snarkjs.groth16.fullProve({a:3,b:11}, "circuit.wasm", "circuit_final.zkey")` then `snarkjs.groth16.verify(vkey, publicSignals, proof)`. https://github.com/iden3/snarkjs#in-the-browser
  Signatures: fullProve(input, wasmFile, zkeyFileName, logger, wtnsCalcOptions, proverOptions); verify(vk, publicSignals, proof, logger). https://raw.githubusercontent.com/iden3/snarkjs/master/src/groth16_fullprove.js ; .../src/groth16_verify.js
- File args: fastfile accepts a Uint8Array or a URL (fetch). https://raw.githubusercontent.com/iden3/fastfile/master/src/fastfile.js (lines ~52-63)
- Workers: ffjavascript spawns web workers from blob/data URL, single-thread fallback only if `Worker` is absent. README: if workers unavailable use `{singleThread: true}` (shown on groth16.prove; fullProve forwards its 6th arg proverOptions). https://raw.githubusercontent.com/iden3/ffjavascript/master/src/threadman.js ; snarkjs README "Common Issues"
  Safe plan: fullProve(input, wasm, zkey, undefined, undefined, {singleThread:true}). Known WebView-specific blockers: UNKNOWN (no source found; test on device).
- Serving assets: WebViewAssetLoader (androidx.webkit, domain appassets.androidplatform.net): `.addPathHandler("/assets/", AssetsPathHandler(ctx))`, `webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")`; fetch() then works same-origin (docs discourage file://). Put pass.wasm, pass_final.zkey (~3.3MB), verification_key.json, bundles in app/src/main/assets/www/. https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader
- Bridge: `webView.addJavascriptInterface(Object, String)` and `webView.evaluateJavascript(String, ValueCallback<String>)` exist. https://developer.android.com/reference/android/webkit/WebView . UNCONFIRMED (page truncated, general knowledge): @JavascriptInterface needed, JS->Kotlin calls arrive on a background thread, evaluateJavascript on UI thread, result is JSON-quoted. Pattern: Kotlin evaluateJavascript("run(<json>)"); JS awaits fullProve+verify then calls `Android.onResult(JSON.stringify({proof,publicSignals,ok}))`.
- androidx.javascriptengine (JavaScriptSandbox): stable 1.1.1 (2026-09-23). Only documented WASM feature is JS_FEATURE_WASM_COMPILATION = `WebAssembly.compile(ArrayBuffer)`; bytes in via provideNamedData + android.consumeNamedDataAsArrayBuffer (JS_FEATURE_PROVIDE_CONSUME_ARRAY_BUFFER); promise return needs JS_FEATURE_PROMISE_RETURN; features depend on installed WebView. WebAssembly.instantiate / Worker / fetch in sandbox: UNKNOWN (undocumented) -> do not use for snarkjs. https://developer.android.com/reference/androidx/javascriptengine/JavaScriptSandbox ; https://developer.android.com/jetpack/androidx/releases/javascriptengine
- Bundle: protocol/package.json exports "." -> ./src/index.ts; deps poseidon-lite 0.3.0, @zk-kit/lean-imt 2.2.5 (local file). esbuild flags --bundle --format=iife --global-name= --outfile= --minify confirmed; --platform=browser is the default. https://esbuild.github.io/api/
    npx esbuild protocol/src/index.ts --bundle --format=iife --global-name=unlinkProtocol --platform=browser --minify --outfile=android/app/src/main/assets/www/protocol.js
    cp node_modules/snarkjs/build/snarkjs.min.js android/app/src/main/assets/www/    (README cp command)
  Whether protocol/src imports node: modules (would break a browser bundle): UNKNOWN, run the command to find out.

## Hashing parity (Poseidon1/2/3 + LeanIMT)
- B: reuse the protocol bundle in the same WebView = identical code, invariant 5 by construction.
- A: mopro only proves; hashing still needs the same JS in a WebView (hybrid) or a Kotlin port. Byte-identical Kotlin Poseidon/LeanIMT with poseidon-lite 0.3.0 constants: UNKNOWN (no source confirmed; would need protocol/test vectors).

## Recommendation
- B is the faster path to a verified on-device proof (no Rust/NDK/C transpile, Windows-friendly, reuses protocol JS); A needs a WebView for hashing anyway.
- B biggest risk: snarkjs worker/WASM memory behaviour in WebView (mitigate with singleThread:true) and proving time on low-end phones (UNKNOWN).
- A biggest risk: undocumented Windows toolchain (Rust + NDK + rust-witness C transpile of pass.wasm); snarkjs-compat of A/B/C also UNKNOWN.

## Verified in this session (2026-11-06, not just docs)
- `protocol/src` has NO `node:` imports or `require()`. esbuild `--platform=browser` bundles it to ~122 KB IIFE (global `unlinkProtocol`). Command in Option B above works as written.
- Ran the bundle in a JS VM: `hash2(1n,2n)` equals protocol/ and the circomlib vector exactly; buildTree/merkleProof produce depth/pathIndex/siblings[20] as expected. Hashing parity (invariant 5) holds by construction when the same bundle runs on the phone.
- poseidon-lite 0.3.0 decodes its constants with `atob` -> needs a real WebView global, NOT the bare androidx.javascriptengine sandbox. Confirms Option B = WebView (WebViewAssetLoader), not JavaScriptSandbox.
- Toolchain present: Android Studio, SDK platform android-37, build-tools 36.0.0, platform-tools/adb, JDK 21. MISSING: NDK (only needed for Option A/mopro), Rust, and a connected device (`adb devices` empty) — needed for the 3b on-device test.
