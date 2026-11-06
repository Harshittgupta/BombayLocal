// Kotlin <-> JS bridge for the WebAppEngine. Kotlin calls window.dispatch(id, method, argsJson); each method
// returns a JSON-serialisable object that is handed back via AndroidBridge.onResult / onError.
// snarkjs runs single-threaded to avoid WebView web-worker issues. All hashing, the tree rebuild, signature recovery
// and the QR codec use the protocol/ bundle (global `bombaylocalProtocol`), so the phone runs exactly the code the issuer
// and circuit tests run (invariant 5).
//
// The pass secret never travels in the dispatched script text: methods that need it fetch it once with
// AndroidBridge.takeSecret(id), and it is never returned, logged or put into an error message (invariant 2).
(function () {
  "use strict";
  var BASE = "https://appassets.androidplatform.net/assets/www/";
  var u = window.bombaylocalProtocol;
  var B = function (s) { return BigInt(s); };

  function secretFor(id) {
    var s = AndroidBridge.takeSecret(id);
    if (!s) throw new Error("no secret for this call");
    return BigInt(s);
  }

  async function prove(a) {
    var out = await snarkjs.groth16.fullProve(
      a.input, BASE + "pass.wasm", BASE + "pass_final.zkey", undefined, undefined, { singleThread: true });
    return { proof: out.proof, publicSignals: out.publicSignals };
  }

  async function verify(a) {
    var vk = await (await fetch(BASE + "verification_key.json")).json();
    return { ok: await snarkjs.groth16.verify(vk, a.publicSignals, a.proof) };
  }

  function poseidon(a) {
    var x = a.args.map(B);
    var out = a.n === 1 ? u.hash1(x[0]) : a.n === 2 ? u.hash2(x[0], x[1]) : u.hash3(x[0], x[1], x[2]);
    return { out: out.toString() };
  }

  function treeProof(a) {
    var p = u.merkleProof(u.buildTree(a.leaves.map(B)), a.index);
    return { root: p.root.toString(), leaf: p.leaf.toString(), depth: p.depth, pathIndex: p.pathIndex,
             siblings: p.siblings.map(String) };
  }

  // idCommitment = Poseidon1(secret), computed from the secret fetched for this call.
  function idCommitment(a, id) {
    return { idCommitment: u.idCommitment(secretFor(id)).toString() };
  }

  function passLeaf(a) {
    return { leaf: u.passLeaf(B(a.idCommitment), a.validUntilDay, a.zoneClass).toString() };
  }

  // SPEC §3.3: recover the signer of a SignedRoot (lowercase address).
  function recoverRootSigner(a) {
    return { signer: u.recoverRootSigner(a.fields, a.signature) };
  }

  function keccakUtf8(a) {
    return { hash: u.keccakUtf8(a.text) };
  }

  // SPEC §3.1 refresh step 4 + 6: rebuild from Arkiv data, then our own path (if our leaf is covered and non-zero).
  function rebuildAndPath(a) {
    var batches = a.batches.map(function (b) {
      return { batchNo: b.batchNo, fromIndex: b.fromIndex, leaves: u.decodeLeaves(b.leavesHex) };
    });
    var tree = u.rebuildFromArkiv(a.leafCount, a.revSeq, batches, a.revocations);
    var res = { root: tree.root.toString(), covered: a.leafIndex < a.leafCount };
    if (!res.covered) return res;
    var leaf = tree.leaves[a.leafIndex];
    res.leaf = leaf.toString();
    if (leaf === 0n) return res;
    var p = u.merkleProof(tree, a.leafIndex);
    res.path = { depth: p.depth, pathIndex: p.pathIndex, siblings: p.siblings.map(String) };
    return res;
  }

  // Pre-prove one epoch (SPEC §6): witness from the stored path, real Groth16 proof, SPEC §3.4 payload, Base45.
  async function proveEpoch(a, id) {
    var sr = a.signedRoot;
    var proof = { root: BigInt(sr.root), leaf: B(a.leaf), depth: a.path.depth, pathIndex: a.path.pathIndex,
                  siblings: a.path.siblings.map(B) };
    var input = u.buildCircuitInput({ secret: secretFor(id), validUntilDay: a.validUntilDay, zoneClass: a.zoneClass,
                                      proof: proof, epochId: a.epochId });
    var out = await snarkjs.groth16.fullProve(
      input, BASE + "pass.wasm", BASE + "pass_final.zkey", undefined, undefined, { singleThread: true });
    var text = u.qrEncode({
      zoneClass: a.zoneClass, epochId: a.epochId, nullifier: BigInt(out.publicSignals[1]), proof: out.proof,
      issuer: sr.issuer, rootId: sr.rootId, root: sr.root, issuedAt: sr.issuedAt, expiresAt: sr.expiresAt,
      signature: sr.signature,
    });
    return { epochId: a.epochId, qr: text };
  }

  function qrDecode(a) {
    var p = u.qrDecode(a.text);
    return { zoneClass: p.zoneClass, epochId: p.epochId, nullifier: p.nullifier.toString(), proof: p.proof,
             issuer: p.issuer, rootId: p.rootId, root: p.root, issuedAt: p.issuedAt, expiresAt: p.expiresAt,
             signature: p.signature, publicSignals: u.qrPublicSignals(p) };
  }

  function qrEncode(a) {
    var p = Object.assign({}, a.payload, { nullifier: BigInt(a.payload.nullifier) });
    return { text: u.qrEncode(p) };
  }

  var METHODS = { prove: prove, verify: verify, poseidon: poseidon, treeProof: treeProof, idCommitment: idCommitment,
                  passLeaf: passLeaf, recoverRootSigner: recoverRootSigner, keccakUtf8: keccakUtf8,
                  rebuildAndPath: rebuildAndPath, proveEpoch: proveEpoch, qrDecode: qrDecode, qrEncode: qrEncode };

  window.dispatch = async function (id, method, argsJson) {
    try {
      var fn = METHODS[method];
      if (!fn) throw new Error("unknown method " + method);
      var result = await fn(JSON.parse(argsJson), id);
      AndroidBridge.onResult(id, JSON.stringify(result));
    } catch (e) {
      // Message only: no stack, no inputs (they can hold the secret or a leaf).
      AndroidBridge.onError(id, String((e && e.message) || "error"));
    }
  };

  AndroidBridge.onReady();
})();
