// Kotlin <-> JS bridge for the WebAppEngine. Kotlin calls window.dispatch(id, method, argsJson); each method
// returns a JSON-serialisable object that is handed back via AndroidBridge.onResult / onError.
// snarkjs runs single-threaded to avoid WebView web-worker issues. All hashing uses the protocol/ bundle
// (global `unlinkProtocol`), so the phone matches protocol/ and the circuit exactly (invariant 5).
(function () {
  "use strict";
  var BASE = "https://appassets.androidplatform.net/assets/www/";

  async function prove(a) {
    var out = await snarkjs.groth16.fullProve(
      a.input,
      BASE + "pass.wasm",
      BASE + "pass_final.zkey",
      undefined,
      undefined,
      { singleThread: true },
    );
    return { proof: out.proof, publicSignals: out.publicSignals };
  }

  async function verify(a) {
    var vk = await (await fetch(BASE + "verification_key.json")).json();
    return { ok: await snarkjs.groth16.verify(vk, a.publicSignals, a.proof) };
  }

  function poseidon(a) {
    var u = window.unlinkProtocol;
    var x = a.args.map(function (s) { return BigInt(s); });
    var out = a.n === 1 ? u.hash1(x[0]) : a.n === 2 ? u.hash2(x[0], x[1]) : u.hash3(x[0], x[1], x[2]);
    return { out: out.toString() };
  }

  function treeProof(a) {
    var u = window.unlinkProtocol;
    var tree = u.buildTree(a.leaves.map(function (s) { return BigInt(s); }));
    var p = u.merkleProof(tree, a.index);
    return {
      root: p.root.toString(),
      leaf: p.leaf.toString(),
      depth: p.depth,
      pathIndex: p.pathIndex,
      siblings: p.siblings.map(String),
    };
  }

  var METHODS = { prove: prove, verify: verify, poseidon: poseidon, treeProof: treeProof };

  window.dispatch = async function (id, method, argsJson) {
    try {
      var result = await METHODS[method](JSON.parse(argsJson));
      AndroidBridge.onResult(id, JSON.stringify(result));
    } catch (e) {
      AndroidBridge.onError(id, String((e && e.stack) || e));
    }
  };

  AndroidBridge.onReady();
})();
