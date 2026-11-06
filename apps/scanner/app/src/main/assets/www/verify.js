// Bridge between WebViewGroth16Engine (Kotlin) and snarkjs.groth16.verify. Answers only true / false / an error
// message; logs nothing.
let lastVk = null;
let lastVkObj = null;

window.verifyProof = async (id, vk, signals, proof) => {
  try {
    if (vk !== lastVk) {
      lastVkObj = JSON.parse(vk);
      lastVk = vk;
    }
    const ok = await snarkjs.groth16.verify(lastVkObj, JSON.parse(signals), JSON.parse(proof));
    ScannerBridge.onResult(id, ok === true);
  } catch (e) {
    ScannerBridge.onError(id, String((e && e.message) || "verify failed"));
  }
};

ScannerBridge.onReady();
