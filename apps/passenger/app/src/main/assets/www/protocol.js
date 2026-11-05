"use strict";
var unlinkProtocol = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // protocol/node_modules/poseidon-lite/poseidon/index.js
  var require_poseidon = __commonJS({
    "protocol/node_modules/poseidon-lite/poseidon/index.js"(exports, module) {
      "use strict";
      var F = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
      var N_ROUNDS_F = 8;
      var N_ROUNDS_P = [56, 57, 56, 60, 60, 63, 64, 63, 60, 66, 60, 65, 70, 60, 64, 68];
      var pow5 = (v) => {
        let o = v * v;
        return v * o * o % F;
      };
      function mix(state, M) {
        const out = [];
        for (let x = 0; x < state.length; x++) {
          let o = 0n;
          for (let y = 0; y < state.length; y++) {
            o = o + M[x][y] * state[y];
          }
          out.push(o % F);
        }
        return out;
      }
      function poseidon(_inputs, opt, nOuts = 1) {
        const inputs = _inputs.map((i) => BigInt(i));
        if (inputs.length <= 0) {
          throw new Error("poseidon-lite: Not enough inputs");
        }
        if (inputs.length > N_ROUNDS_P.length) {
          throw new Error("poseidon-lite: Too many inputs");
        }
        const t = inputs.length + 1;
        const nRoundsF = N_ROUNDS_F;
        const nRoundsP = N_ROUNDS_P[t - 2];
        const {
          C,
          M
        } = opt;
        if (M.length !== t) {
          throw new Error(`poseidon-lite: Incorrect M length, expected ${t} got ${M.length}`);
        }
        let state = [0n, ...inputs];
        for (let x = 0; x < nRoundsF + nRoundsP; x++) {
          for (let y = 0; y < state.length; y++) {
            state[y] = state[y] + C[x * t + y];
            if (x < nRoundsF / 2 || x >= nRoundsF / 2 + nRoundsP) state[y] = pow5(state[y]);
            else if (y === 0) state[y] = pow5(state[y]);
          }
          state = mix(state, M);
        }
        if (typeof nOuts !== "number") throw new Error(`poseidon-lite: expected nOuts to be number got ${typeof nOuts}`);
        if (nOuts === 1) {
          return state[0];
        } else if (nOuts <= state.length) {
          return state.slice(0, nOuts);
        } else {
          throw new Error(`poseidon-lite: Invalid number of outputs requested ${nOuts}, max ${state.length}`);
        }
      }
      module.exports = poseidon;
    }
  });

  // protocol/node_modules/poseidon-lite/poseidon/unstringify.js
  var require_unstringify = __commonJS({
    "protocol/node_modules/poseidon-lite/poseidon/unstringify.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", {
        value: true
      });
      exports.default = unstringifyBigInts;
      function unstringifyBigInts(o) {
        if (Array.isArray(o)) {
          return o.map(unstringifyBigInts);
        } else if (typeof o == "object") {
          const res = {};
          for (const [key, val] of Object.entries(o)) {
            res[key] = unstringifyBigInts(val);
          }
          return res;
        }
        const byteArray = Uint8Array.from(atob(o), (c) => c.charCodeAt(0));
        const hex = [...byteArray].map((x) => x.toString(16).padStart(2, "0")).join("");
        return BigInt(`0x${hex}`);
      }
    }
  });

  // protocol/node_modules/poseidon-lite/constants/1.js
  var require__ = __commonJS({
    "protocol/node_modules/poseidon-lite/constants/1.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", {
        value: true
      });
      exports.default = void 0;
      var _default = {
        C: ["CcRunsaOm9T+H6q6KUy6OKcaoXdTTN0bbH3A29Cr16c=", "DANWUwiW7sQql+2TfzE1z8UUKzrkBbg0PB2D/6YEy4E=", "Hiih2TVpitEULlEYK7VM9KAOpaq9Ymi9MX6pd8wVSjA=", "J68tgxqdJ0gICWXbMOKY5A5XV8PgCNuWTPnisSuRJR8=", "Hm8RzmD8j1E6ajz+Fq4XWkEpFGLyFM0Iear0NUW3TgM=", "Kmc4TTu9XkOFQYGctoHwvgRGLtFMNhPY9xkgYmjRQtM=", "C2b981YJOmEWCfjhL7/s8LmF44HwJRiJNkCPXVyfRdA=", "AS7j7B541HCDDGEJPCreNwsmyDzFzr7t2qaFLb2wniE=", "AlK6X2dgv739iPZ/gXXj/WzRxDGwmba7LRCOe0Rbsbk=", "F5R0zOyl/2dsa+w871QpY1Q5Gok1/3HW71rqrXypMvE=", "LCQmE3mlG/qSKP9KUD/U7Zwfl0omSWmzfholibvtK5E=", "HMHXtiaS5j6sLyiL0GlbQ8L2P1AB/A/FU+ZsBVGAGwU=", "JVBZMBqtqYuy7VX4UpeelgB4Tb8X+6zQXZ7/X9nJG1Y=", "KEN746wcsuR54fXA7M0ys66iQjSXCoGTsRwpzn5Z79k=", "KCFqRC8uH3EcpPprU3ZusRhUjaj7T3jUM4diw39fIEM=", "LB9HzRf6Wt8fOfTnBW3QP+7h784DCUWBEx8jdzI0gsk=", "B6utArel68SGMrzJNWzrfdna/KJ2Y4pjZGuFZqYhr8k=", "AjAmRgH/3yknWzP/qrUd/pQp+QiAppzRN9oMTRX5bDw=", "G8lzBU5R2QWg8WhlZJfKQKhkQUVX7iiecX5dZomaoKk=", "Lhwi+WRDUAggbDFX6GNB7dJJr/XC2EIfKmsiKI8KZ/w=", "EiTzjfZ8U3gSHB1fRhu8UJ6OoVmORsn3pwRSvCu6hrg=", "AuTmnYulnlGSgLS9ntAGj9e/6M2d/toZadKYkYbN4g4=", "Hx7Mw0qroBN/XfgfwE/z7k8Z7jZOZT8HbUfpc12YAY4=", "FnKtPXCaNTl0JmwwOamnMRQkRIAyzRgZ6suKTUKE9YI=", "KD4/3CxuQgxW9Er1GStK6c2mlh8oTSSZHS7WAt+Mj8c=", "HCo9EgxVDs/Q2wlXFw+gE2g3Ufj9/1nWYU+9af85S8w=", "IW+Eh3qsYXL3iXpzI0Vu/hQ6mkN3PqbylstrgXdlP70=", "LA0nK+zyp1dkun6OPijRK86qR+phylmkEaH1FVL5R4g=", "FuNCmYZcDihITuenTEVOnxcKVICr4FCPy0psPYlUb0M=", "F1zrpZnpb1s3WiMqb7nMcXcgR3ZYAikPSM2Tl1VIj8U=", "DHWURA3EjBb+rZ4XWLAoBmqkEL+8NU9U2MX/u0Sh7jI=", "GjwpvDnyG7XEZtt9frb9j3YOIAE8z5EskkeYgtkZ/Y0=", "DM/dkG80JuXAmG6gSbJTQAhV00kHT1pmlcjuq80i5o8=", "FPa8gdnxhvYr20dc5slBGGanqKP9Bls84OaZtn3Z55Y=", "CWK4J4n7PRKXAspwsvbFqswJmBDJxJXIiO3rc4a5cFI=", "GogK9wdNGLO/IMed4lEnvBMoSrAe8CV1r+8Mj2oxqG0=", "EMuhhBmmozLNXnfwIRwVSyCvKST8IP8/TDASu3rpMRs=", "BX5iqaj4mz69x2umOp6sqPontzGcrjQGdWooSfMC8Q0=", "KHyXHekdwKvUSt9ThLSYjLlhMDu/Zc/1r6BBO0QoDO4=", "Id8ziK8Wh7uzvKnaDMqQjx5WK8RtSrpOb395YOMGiR0=", "G+XIh9JbznA+JcyXTQk0zXid+PcLSY/YPv+LVg4WgrM=", "Jo2jb3blaPtoEXF1zqLNDdLLXUL9pazqSNWcJwag1cE=", "DherCR9urlDGCb6vVRDs7MXYu3QTXr0FvQZGDMJqXtY=", "BNcn5yj/oKZ67lNasHSkMJHvYtjPg9JwBA9cqh9ir0A=", "DdvXv5wpNBWBtUl2K8Ai7TNwKsEPG/2GKxVBfX45ym4=", "J5DrM1FiF1J2gWLoKYnGwjT1sNHTr5tYiinEnIeJZUs=", "HkV8YBpjtz5EcZUBk9ilcDlfPZq4sv0JhLdkIGFC+ek=", "Ia5kMB3KliVjjWqyu+cTX/qQ7NDEP/kfxMaG/EbgkbA=", "A3n2PIzjRo1NopMWb0lJKIVL6eNDLglVWFhTTu2NNQs=", "AC1WQgNZ0CZqdEoICAngVMoOSSGkZoasjJ9YoyTDUEk=", "EjFY5ZZbXZsdaLPNMuELvtqNYkWeIfQJD8LFr5Y1FaY=", "C+KfxAhHqUFmHRS79svgQg+7K29Sg21OYMgOtJytnsE=", "Gslpkd7CuwVXcWFCAVpFPDbbnYWcrV+aIzgC8k/fTBo=", "FZZEP3Y9vMJfSWT8YdI7Pl4SyfqX8YqSUcozVbywYn4=", "EuC802VL36drKGHU7Drq4PGFfZ8X5xWu1tBJ6uO6MhI=", "D8krTxu+qCuepz1K+a8qUM6rrH83FUsZBObHbHz5ZLo=", "H5wLFhBEZELW8uWSqAE/QLFPfHciI29PnH6WUjOHJ2I=", "Dr10JErnJnX4zeBhV6eC9AUNkU2ji0wFjRWfZD279NM=", "LLfw7Tnhbp9pqfr9SrlRwDsGcelzRu45eoOYOdzPxtE=", "Gp1uLs/wIsxWBUQ+5BurIM52HQUUzlJmkMcrynNS2b8=", "KhFUOWB/M1peqDw7xEqTMdDBMyapp7owh9oYLWSOxy8=", "I/m2UptdBA0VuPp67j40EOc4tWMFzUTylTXBFcWkwGA=", "BYcsFtsPcqIkmsa6SEu5w6POl8FtWLaLJg65OfDm6Kc=", "EwC97gi7eCTKIPuAEYB19AIZthUdVbXFK2JKfN7d9qc=", "Gbm2PS8QjhfmOBeGOo9sKI160pkW2YyxBy5Oe31Ss3Y=", "AVvuE1fjwBW1vaI3ZoUi9hPRyIcmtexCJKIBKEgbT38=", "KVNzbpS7a58blwek8WFeTv4eHOS6shjL6pLHhbEo/9E=", "CwaTU7oJFhiGL4BhgMA4X4UbmNNytF9UTOcmbtZgjfw=", "ME901GHMwTEV5OC8+5OBflWut+uTBrZOT1iKyX2B9Ck=", "FbvxRs6bygnooz9ed9/k9arSoWSkYXpMuO5UFc3pE/w=", "CrTf4MJ0LN5EkBAxSHlk7ZuPS4UEBcEMqf8jhZVyyMY=", "DjLbMgoETjGX9F92SaGWde9e7f6lRt6pJR3jn5Y5d5o=", "ChdWqh83jKSydjWni2iI5meXczqCd0iWoweO+lFtoBY=", "BExKM7EPaTRH/RcXf5Uu+JXmHTKPhe+pQlTWoqJdk+8=", "LtNhG3JbinC+ZVtTf2b3AP4IedeaSWiR03sHtUZsS4s=", "H5uk6Lq3zkLI7MPXIqouDq3965z900e12DOepxIIWKo=", "GyMwQwUujCiPfukHqE5RiqOOgqxFAgZtt0BW+GXF09o=", "JDHhzBZLuNB0Axq3K9VbTJAgU7/A8U2wyi+XsCCHWVQ=", "CC+TTJH1qsMwzWlToKfbRaE+MiCXWDMZp5Hyc5ZYAf0=", "K5oKIj51OLCjS+B0MVVCo8dyReKufL6Zmta7kwxImXw=", "DhzZHt0s+izOuFSDuIepvoFkFj51qKAOsLWJzHAhTn0=", "Lh6sDyv9/WPJUfYUd+NpiZl3TxmFTQD1iNMkYBzr4vk=", "DL+pXzf7dAYMdhWOdp1tFXNFeE2O/bM8I9dIEVtQC4M=", "CPBbO+kj7UTWWtSdimHppnbZkeOndRPZmAwjLfpKT4Q=", "InGeKgcLzQhSv44hmE0EQ+coSSXcB1ijJaLdUQwEfvY=", "BB9Zap7hyyvAYPf8w6GrTHvb8DYRmYLA9B9isvJoMMA=", "Iz/TXeG+UgqHYo6wb2sdTAIb4cLQ3EZKGfzdCYaxD4k=", "BSS0bRqoel5DJeCkI+vIENMeB4qhtHB+78tFPGHJwmc=", "LDT0JMgeVxbOR/ysiUuFgkInu5VLDzGZzESGI3xRUhE=", "C18qS2M4eBkgfv/CtVQfty3SAltUV8yX8zAQMn3kkV4=", "IiB4VggszFTFty/kOdLP1sF0NdL1evbOrvrEH+BcZZ8=", "JNV6i/XaY/5OJBWbf4lQtc37IQGUyvefJ4VASM4sgXE=", "Cvqxgf3V4Fg7Nx11vWk/mDdK1wl7sBqFc5Gbsjt5OW4=", "LbqbEI8gh3KZilLvrHy9VnbABXGUwWwL8WKQ1isRKO4=", "JjSbZu24sW9W+IHHiPU/g8u4PeC9WSslWv8T5rzkILM=", "Ja984OXhA1doXpX5Izl1OtgaVtKOzBk7I1KIo+bxN9s=", "JbTOe9IpQ5DAlNalXt1ouXDu16roiyv/H3wBh/41AR8=", "IsVD8Q9siew4flPxkIqI5d6c7yjr3zCxjLnVTB4CtjE=", "Ajb5PneJxHJPx5CKnxkeHkJekGqRnXo032aOdIgvh6k=", "KTULQBFmygEOfSfjfQXamWUr2uEU6wFlnLSXr5gMS1I=", "Du14fWWCDT9r0xu6tUf3WmXtt12ETruJ7hJgkWZSNj8=", "B8wRcPE7RvIDanU/Ugsykf3NDpm9lCl9GQb2VvTeb60=", "Irk5IzsdcgX0m89hOj0wsZCHhtf59dEMIFlDVonorOo=", "AUUXYqCquByKrR3IvDPocHQPCDpaqFQ4rdZQrOYK5aY=", "I1BrtdhyfURh+r8QJdRtH+MuqmHex9pX5wT+wIkvzok=", "LkhMROg4rqC6wGrj9xvdCSo3CVMeHv6pf4vWiQc1VSI=", "D0vH0H66/WQ3nnjFC9LkK69KWUVFztwlRUGNomg1tUw=", "H008j2WD6eX6dmN4Yvqu6FFYI4hyXfRg5iCZbVDY504=", "CTUU4McHEfgmYNB74OSpiPrgKrx7aB2RU+uby0j+c4k=", "GtqwyOKzutNGaZorXzvANkPug+zkcijySljgo0fhU9g=", "FnKxcmBX2Z3RRwnrtHRkGjeMG5S4ByusGiLb756A2tI=", "Hf1T1Fdq8uOPRPU/3KtGjMXY4vrgrMTuMNR7I5tHnBQ=", "DGiIoQt1sPOnCjYmOjfhf+bXfWQPb8PevH8gd1MgXGA=", "Gt25M6Zb53CSs0p+d9Ev6GEaYeAO5oSLhQkezKnR5Qg=", "ANdUDc0mioRcEK4Y0d6TPPY4/1Ql8K//eTVijimdF5E=", "FAwOQmh+nq0BsoJ6VmTKnCb+3eSs2Z2x0xaTnSC4LA4=", "Lww6EV1DF9GRuom40T0YBsIKD5sk+MXtwJHirlZWWYQ=", "DE7neP98FFUwBu0iDPnIEAigz/ZwsiuC2MU4odyVjGE=", "FwTydm1G+Cw2k/AEQMzDYJQk7SbArMZiJ8PXSF3nTGk=", "Ly0ZzD6l146noCwbUdJEq/B2nJ+FROQCObZv6QCcPPo=", "GuA4U7dfyrpQU/ES4qjo3N1+5suc/tnH1sdmqAb8Zik=", "CXGqv3lSQd9R0THQ+mGqXzVWkhstbwFOTkGobdrwVtU=", "FAjDFuYBThqR1M9rbg3nPtpiT4OA3xyHX1wp97/i9kY=", "Fmfz/i7b6FAkir5CtUMJO2yJ8fdz7yhTQWkfOYIu9b0=", "E798XQ0sQ3akiwoDVXzfkVuBcYQJ5cEzQkxpV2UA/jc=", "B2IKbfsLbOwwFq3z01M8JAJLlTR4VreXGbwLp0OmLCw=", "FXTH7wxDVF82qMoIvb3YsHXSlZ4vMitzFnXePhmCtNA=", "Jp5LW3oushr9VnlwpxfO7FvUGEVxwlT9wG4Dp/+DePA="],
        M: [["Bm9vhdb2ioXsEDRTUaI6Oq8H84r4yVKnvOynC9KvetU=", "K51LQRDJrpl3guFQmx0P2yCnwCu9i+pzBUYrn4Elseg="], ["DMV827CFB9Yr9npEk8wmL7bAnVVwE//x9XP0MSIfj/k=", "EnTmSaMu01WjGm7WlyThra3oV+hutcOhIbzRR5QyA8g="]]
      };
      exports.default = _default;
    }
  });

  // protocol/node_modules/poseidon-lite/poseidon1.js
  var require_poseidon1 = __commonJS({
    "protocol/node_modules/poseidon-lite/poseidon1.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", {
        value: true
      });
      exports.poseidon1 = poseidon12;
      var _poseidon = _interopRequireDefault(require_poseidon());
      var _unstringify = _interopRequireDefault(require_unstringify());
      var _ = _interopRequireDefault(require__());
      function _interopRequireDefault(obj) {
        return obj && obj.__esModule ? obj : { default: obj };
      }
      var c = (0, _unstringify.default)(_.default);
      function poseidon12(inputs, nOuts) {
        return (0, _poseidon.default)(inputs, c, nOuts);
      }
    }
  });

  // protocol/node_modules/poseidon-lite/constants/2.js
  var require__2 = __commonJS({
    "protocol/node_modules/poseidon-lite/constants/2.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", {
        value: true
      });
      exports.default = void 0;
      var _default = {
        C: ["DumlkrqalRjQWYbWVvQMIRTEmTwRuymTjSHUcwTNjm4=", "APFEUjXyFIxZhlhxafwbzYh7CNTQCGjfVpb/9AlW6GQ=", "CN/zSH6KyZ4fKaBY0PqAuTDHKHMLerNs6HnziQ7Pc/U=", "Lye+aQ/a7kbDzij3UysTyFbDU0LIS9puIJZjEPrcAdA=", "KyrhrPaLe40kFr6/PU9iNLdj/gS4BD7ki4MnvryhbPI=", "AxnQYgcr737MperAb5fU1VlSwXWrawPq5ktEx9vxHPo=", "KIE9yuuuqoKKN234evSmO8i3vyetScYpjvezh78oUm0=", "JydnOyzLyQPxgb844cHUDSAzhlIAw1K8FQkord35y3g=", "I07EXKJ3J8LnSr0rKhSUzW771D40BYfWuPueMeZcxjI=", "FbUlNAMa4Y9/hiyyz3z3YKsQqBUKM3sczZn/boeX1Cg=", "Dcj61tnks19e2aPRhrec444Oio0bWLEy1wHU7s9o0fY=", "G82V/8IR+8pgD3BfrT+1Z+pOs3j2Lh/sl4BVGKR+TZw=", "EFILCrchyt/p7/gbAW/DTcdto2wleJN4F8uXjQad5Vk=", "H21IFJuOf32bJX2O1fu69CkySYB1/tCs6IqeuB9WJ/Y=", "HZZV9lIwkBTSngDvNaIIm//43ByBbw3JyjS9tUYMhwU=", "BN9aVv+VvK+wUfexzUOpm6cx/2fkcDIFj+PUGFaXzH0=", "BnLZlfj/9kAVGz0pDO2vFIaQoQqMhCSn9uwoK25L6Cg=", "CZlStBSIRFSyEgDX/6/dXwyancwG8nCOn8HYIJtcdbk=", "BSy6IlXf0Ax8SDFDuo1GlEjkNYaptM2Rg/0OhDprn6Y=", "C4ut7mkK246wvXRxK3mZr4LeVXByUa13Fgd8uTxGTdw=", "EZsVkPEzB69aHuZRAgwHx0nBXWBoOoBQuWPQqOSyvdE=", "AxULfNbV0XslKdNr4PZ7gyxKz8iE707lzhW+C/tKjQk=", "LMYYLF4UVG488ZUfFzkSNVN077g9gImKvmnLMXyepWU=", "AFAyVR5jeMRQz+EppASzdkIYyt7awU4rktLNcxEb8Pk=", "IzI34yibqjS7FH6XLry5UWRpw5n8wGn7iPnaLMKCdrU=", "Bcj09OvUpuPJgNMWdL++YyMDfyGzSuWk6AwtTCTWAoA=", "CnsdsTBC05a6BdgYoxnyUlK8817zru2R7h8JslkPxls=", "KnO3H5shDPWxQpZXLJ0y2/FW4rCG/0fcXfVCNlpATsA=", "GsmwQXq8yaGTUQfp/8kdw+wY8sTb5/Ipdqdgu1xQxGA=", "EsAzmuCDdII/q7B2cH70eSafPk1ssQQ0kBXuBG3JP8A=", "C3R1sQKhZa1/WxjbTh5wT1KQCqMlO6rGgkZoLlbpoo4=", "A3woSeGRyj7bHF5J9ui4kXyEPjeTZvLqMqs6qI1/hEg=", "BaaBH4VW8BTpJnRmHiF+m9UgbFyToH3BRf2xdqcWNG8=", "KaeV59mAKJRulHt11U6fBEB26Hp7KIO0e2de9fOL1m4=", "IEOaDISzIutFo4V6/Bj1gm6Mc4LIoVhcUHvhmZgf0i8=", "Lguo2U2ez0qU7CBQxzcf8btQ8neZqEttSipvKgmCyIc=", "FD/RFc4I+yfKOOt8zoIrRReCLNIQkEjS5tDdzKF9ccg=", "DGTL7LHHNLhXlo273PgTzfhhFlkyPby/yEMjYjvpyvE=", "AoowWEfGg/ZG/KklwWP/WudPNI1iwrZw8UJs75QD2lM=", "Lk71EP8Lb9pfqUCrTEOA8mpry2TYlCe4JNZ1W1254ww=", "AIHJW8QzhOZj15JwyVbOO4kltPbQM7B4uWOE9QV5QA4=", "LtXwyRy9l0kYfi+t5ofgXuJJGzScA5oLuoqfQCOguzg=", "MFCZkfiNo1BLvzdO1ari8DRIoix2I0yMmQ8B8zpzUgY=", "HD8g/VVAmlMiG3xNSaNWufChEZ+yBntBp1KQlEJOxq0=", "ELTn86td8AMElRRFm24Y7sRrsiE+jhMeFwiHtH3cuWw=", "KhmCl5w/9/Q93VQ9iRwqvd2A+ATAd9d1A5qjUC5Dre8=", "HHTuZPFeHbb+3b6tVtbVXbpDHrw5bJr5XK0PExW9XJE=", "B1M+yFC6f5jquTA8rOAbS55PLouCcIz6nC/kWgrhRqA=", "IVdrQ45QBEmhUeTurxexVChcaPQtQsGAihGr83ZMB1A=", "LxfAVZuP55YIrVyhk9YvELzoOEyBXwkGdD1pMINtSp4=", "LUd+OGLQdwinnoqulGFwvJd1pCATGEdK5mWwsbficw4=", "Fi9SQ5ZwZMOQ4JVXeYTyka+6ImbDj1q82Jvg9bJ0fqs=", "K0yyM+3pukgmTs0siuUNGteoWWqH8p+Kd3enAJI5MxE=", "LI+8st2Fc9wduvj0YihUd22y7s5thcTPQlTnw14DsHo=", "HW80dyXkgWry/0U/DNVrGZ4bYen2Aemt5eiNuHCUnak=", "IEsMOX9OvnHrwtiz31uRPfnmrAK2jTEyTNSa9cRWVSk=", "DEy53DxP2BdPEUmzxjw8L57LgnzX3CVTT/j7dbx5xQI=", "F0rWGhRIyJmiVBZHT0kwMB5cSUdSeeBjmmFt3EW8e1Q=", "GpYXe89NjYn3Wd9OwvPN4uqqKMF3zA+hOpgW1Jo40u8=", "Bm0EskMx1xzQ74BUvGDE/wUgLBJqIzwagkKs42C4owo=", "KkxPxuwLDPUhlXgoccbdOzgcxl9y4CrVJwN6Yqob2AQ=", "E6stE2zPN9RH6fLhSnztyV5yf4RG9tnX5Vr8ASGf1kk=", "ESFVL8omBhYZ0k2EPcgnacGwT87Cb1UZTC4+hprMapo=", "AO9lMyKxPWyIm8gXFcN9d6bNJn1ZXEqJCaVUbHyXz/E=", "DiVIPkWmZSCLJh2Lp0BR5kAMd21lJZXZhFrKNdijl9M=", "KfU23LnddoIkUmRlnhXYjjlaw9Td6S2MRkSNuXnuuok=", "KlbvnyxT/rrf2jNXXb29iFoSTieAu+oXDkVrqs4Ppb4=", "HINhx461z13s+3otF7XECfKuKZmkZ2Lo7kFiQKjLmvE=", "FRr/XziyCg/ARzCJqvAga4Po5op2RQe/09CrS+dDGcU=", "BMYYfkHtiB3BsjnIj3+dQ6n1L8jIts3R525HYVtR8QA=", "E7N72A9NJ/sQ2EMx9vttU0uBxh7RV3ZEnoAbfdycKWc=", "AaXFNic8LZ31eL+9MsF7eizjZkwqUgMskyHOscToqOQ=", "KrNWGDTKc4Na0F9desuVC0qaLGZrlybagyI5Blt8OwI=", "HU2OwpHnINsgD+bWhsDWE6yvavTpXTv2n37VFqWXtkY=", "BBKU0sxITSKPV4T+eRn9K7klNRJAoEtxFRTJyAtlrx0=", "FUrJjgFwjGEcT6cVmR8ASJj1eTnRJuOSBClx3ZDoH8Y=", "CzOdisyn1Pg+7dhAk671EFCzaEyI+LCwRSRWO8bqTaQ=", "CVXknmYQyUJUpPhM+6s0RZjw5x6v9Kfdge2VtQg5yC4=", "BnRqYVbrpUQmueIiBvFavKmm9B5vU1xvNSVAHqBlRiY=", "Dxj1oOzRQjxJbzggxUnCeDjleQ4r0KGWrJF8f/Mgd/s=", "BPbuyhdR9zCKxZ7/W+smHku1Y1g+3nvJKnOCI9b3bhM=", "K1aXM2TExPXBo+xNo83OA4gR6xFvs+RbwXaNJvwLN1g=", "Ejdp3UnVsFTc12uJgEsby44TkrOFcWpdg/62XUN/Ke8=", "IUe0JPxIyAqI7lK5EWmqzqmJ9kRkcRUJlCV7L7AcY+k=", "D9wfWFSLhXAabFUF6jMqKWR+bzStQkPC6lStiXzr5U0=", "Ejc6glH+oATfaKvPD3eG1Lzv8oxdu+DDlE9oXMCgsfI=", "IeT06l81+FutfqUv90LJ6KZCdWtq9EID3YofNcGpADU=", "FiQ5FtadLKPftHIiJNTEYrVzZkkvRekNioGTTxvDsUc=", "HvvkbdeleLT2b5rbyItDeKvCFWbhoEU8oTpBWcrASsI=", "B+pehTfPXdCIhgIOI6fzh9Ro1VJb5m+FO2csyWqIlpo=", "BajE+ZaLiqO3tHijD5pbY2UPGadefOEcqf4WwLdsALw=", "IPBXcSzCFlT7/lm9NF6NrD94GMcBuceILZ1Xtyoy6D8=", "BKEu3tqd/WiWcvjGf+4xY23NjojQHUkBm9kLM+sz22k=", "J+iNjBXzfc7kTx5UJaUd7L0TbOUJGmdn5J7JVEzNEBo=", "L+7Re4QoXtm4pcjF6VpB9m4JZhmncDIjF2xB7kM95NE=", "HtfMdu30XHxAQkFCD3Kc85TllCkRMSoNaXK4vVOv8rg=", "FXQumbm/oyMVf/jFhvVmDqxng0dhRM3K3yh0vkVGaxo=", "GqwoU4f2XoLIlfxoh930BXcQdFTG7AMXKE8DPyfQx4U=", "JYUcPIRdR5D53a29tgVzV4MuLnpJd19x7HWpZVTWfHc=", "FaWCFWXMLsLOeEV9sZft81O367osVSM3DdzMPZ8Uamc=", "JBHVekgTuZgO+n4xodtZZtz2TzYEQndQLxVIXyjHFyc=", "AC5vjWUgzUcT4zW4wLbS5kfpqY4S9M0lWIKLXvbLTJs=", "L/e8j0OAzemX2gC2FrD80a+PDpHi/h7XOYg0YJ4DFdI=", "ALmDG5SFJVle4CckRxvNGC6VIfa3u2jx6Tvk/rsNPL4=", "Ci9TdouOv2qGkTsOV8BOARykCGSKR0OofXetvwycNRI=", "ACSBVhQv0Dc6R5+R/yOelg9Zn/fpS+abfyopAwXhGY0=", "Fx1WILh7+xMoz4wCqz8MmjlxlqpqVCwjUOtRKisrzak=", "FwpPVVNvfclwCHx8ENb612DJUhct1U3ZnRBF5Ow0qAg=", "KaujP3mf5mwu8xNK6gQzbsw344wc0hG6SC7KF+Lb+uE=", "HpvBeaT911j90bsZRQiNR+cNEUoD9qDotbplA2nmSXM=", "HdJpeZtmD61Y9/SJLfsLWv6q2GmpxLRPnJ4cQ72vjwk=", "Is28i3ARetFAEYHQLhVFnnzNQm/oacfJXR3Syw8krzg=", "DvBC5FR3HFM6n1elXFA/zv0xUPUu2Up81bqTucfazv0=", "EWCeBq1sj+Lyh/MDYDfohRMY6LCKA1mgOzBP/KYugoQ=", "EWbZ5VRhbbqedT7qQnwXt/7NWMB23+QnCLCPW3g6qa8=", "LeUpiUMahZWTQTAmNUQT2xd/v0zSrAtW+FWoiDV+5GY=", "MAbrT/x6hYGabaSS86isHfUa7lsXuOiddL8Bz19x6a0=", "KvQfu2G6ioD9z2//nj9vQimT/o8KRjn5YjRMgiUUUIY=", "EZ5oTeR2FV/lprQajryF24cYqyeInoXngbIUus5IJ8M=", "GDW3huLokl4Yi+pZrjY1N7USSMI4KPBHz/eEuXs/2AA=", "KCAaNMWU36NNeUmWxkM6INFSusKnkFySbEDihasy7rY=", "CD79eifRdRCU6A/vr3iwAIZMgutXEYdySnYfiMIsxOc=", "C2+Io1dxmVJhWOYc7qJ76BHBbfd3TdhRngeVZPYf0Ts=", "Dsho5tFeUdlkT2bh1kcalFiVEcoA0p4QFDkObuQlT1s=", "KvM+P4ZncScawMmz7S4RQuzT50uTnNQNANk3q4TJhZE=", "C1ICEfkEtefQm12WHGrOdzRWjFR91oWLNkzl5HlR8Xg=", "Cy1yLQkZoarY21jxAGKpLqDFasQnDoIsyiKGIBiKHUA=", "H3kNTX+M8JTZgM6zfCRT6Ve1SpmRyji74AYdHtblYtQ=", "AXHrld+/fR6uqXzThfeAFQiFwWI1oqao2pLOsB5QQjM=", "DC0OO1/VdUkym/aIXaZrm3kLQN79LIZQdiMFOBsWiHM=", "EWL7KGicJxVOWoIotOcrN3y8r6WJ4oPDXTgDBUQHoY0=", "LxRZtl3uRBtkrThqkegxDygsWpKonhmSFiPvgklxG8A=", "Hm/zIWtojD2ZbXQ2fVzUwbxInUZ1TrcSwkP3DRtTz7s=", "AcqL5zgyuNBoFIfSfRV4AtdBpvNs3CoFdogfkyZHiHU=", "H3c1cG/+n8WG+XbVvfIj3GgChggLEM6gC5td4xX5ZQ4=", "JSK2D06jMHZAoMLc4EH7qSGsEKPV8JbvR0XKg4KF8Bk=", "I/C+4AGxAp1SVQdd3JV/gzQYytT1K2w/jOFsI1VyV1s=", "K8Gui43buB/KrC1EVV7VaF0UJjPp35BfZtlAEJMILVk=", "D5QGuCllZKNzBFB7jbo+0WI3EnOgex/JgBH81q1yIF8=", "I2Co6wzH3vpntymY3pBxThfnWxdKUu5KyxJsjNmV8Kg=", "FYcaXN3q2XaATIA8uu8lXrSBWl6W34sAbcu8J2f4iUg=", "GTpWdmmY7p4KhlLdLzsdoDYvT1T3I3lUT5V8ze77Qg8=", "KjlKQ5NPhpgvm+Vv9PqxcDsuY8itM0g05DCYBed3rg8=", "GFmVTP64aV8+i2NdyzRRkoks0RIjRDuntBZuiHbA0UI=", "BOEYF2MFDlgBNETby5nxkCsRvCXZC73KQI04GfT+0ys=", "D9slPe6Dhp1AwzXqZN6MW7EOuC2wi16LH15VUr/QXyM=", "BYy+ippQJ72qTvtiOt6tYnXwhobxwImEqdfFuum08cA=", "E4Ltzplx4YZJfq2xrrH1KyO0uDvvAjqw0VIotMzspZo=", "A0ZJkPBFxu4IGcpR/RGwvn9huOuZ8Ut34eZjRgHZ6LU=", "I/e/yHINwpb/8ztB+Y/4PG/KtGBdsutaqlvBN663Clg=", "ClmhWOPuwhF+bpTn8OnezxjD/9XhUxqSGWNhWLuvYvI=", "BuxUyAOBwFK1i/I7MS/9POLE66BlQgr49MI+0Adf0Hs=", "EYhy3IMuDrVHa1ZkjoZ+yLCTQPenvLG0li8P+e0fnQE=", "E9afoSfYNBZa1cfLp61Z7VLgsPDkLX/qleGQa1IJIbE=", "FpoXf2PqaBJwscaHenPSG94UOUL7cdxV/YpJ8Z8Qx3s=", "BO9RWRxurZfvQvKHrc5A2Tq+sDK5IvZv+36aWnRQVE0=", "JW4XWh3AeTkOzXynA/suOxnsYYBdTwPO1fRe5t0Paew=", "MBAtKGNqvV/l8q9BL/YAT3XMNg0yBd0toAKBPT4s7rI=", "EJmOQt/NO78cBxS8c+sb9ARDo/qZvvSjH9Mb4YL8x5I=", "GT7djp/PPXYl+n0ktZih2J8zYur01YLv7K12+HnjaGA=", "GBaK/TTy2RXQNozoC3szR9HHpWHOYRQl8mZNeqUfC10=", "KTg8AevTtqsMAXZW6+ZYtqMo7He8M2JuKeLpWzPqYRE=", "EGRtLyYD3jmh9K5ed3GmSnAttuhvt2q2AL9XP5AQxxE=", "C+teB9GycUX1dfE5WlW/Ey+QwltA2ns4ZNAkLcsRF/s=", "FtaFJSB4wTPcDT7K1itciDD5W7LlS1mr3/vwGNlvozY=", "Cmq9HYM5OPM8dBVOBAS0tApVW7vsId36/Wct1iBH8Bo=", "GmefXTbre1yOoSpMLe3I/rEt/+7EUDFycKbxmzTPGGA=", "CYD7IzvUVsI5dNUODr/eRyakI+raTo9v+8dZLj8bk9Y=", "FhtCIy5huEy/GBCvk6OPwM7OPVYoySggA+ustcMSxys=", "CtoQqQx/BSCVD31Hpg1eakk/CXh/FWTl0JID20feGgs=", "GnMNNyMQuoIyA0WimsQjjtPweoorThIbtQ3bmvQH9FE=", "LIEg8mjvBU+BcGTDad2n6pCDd/6rpcTf+9oQ71joxVY=", "HHyIJPdYdT+lfAB4nGhCF7kw6VMTvLc+bnuGSaSWj3A=", "LNntMfX4aRyOOeQHenT6oPQArYtJHrP3tHsn+j/Rz3c=", "I/9PnUaBNFfPYNkvV2GDmaXgIqwyHKVQhUriORiiLuo=", "CZRaXRR6T2bO7OZAXd3Z0K9aLFEDUpQH3/HqWPGAQm0=", "GI2cUoAl1MK2dmDGt3G5D3x9puqinT8mim3SI+xvxjA=", "MFDjeZZZa3+B9oMRQx2HNNun2SbTYzWV4MDY3fTw9H8=", "Fa8RaTloMKkWAMqBAsNcQmzq5UYeP5XYnYKVGNMK/Xg=", "HabQmIVDLqmgbZ83+HPZhdrpM+NRRmspBChNozINisw=", "J5bqkNJpryn1+KzzOSESTk5PrT2+ZYlF5UbuQR3aqcs=", "IC190doPa0sDJcizMHdC8B4VYS7I6TBKfLAxngHTLWA=", "CW1nkNBbt1kVapUromPWcqLX+ceI9Mgxop2s5MD4vl8=", "BU76H2Ww/OKDgIllJ12He0ONojzlsT4ZY3mMsUR9JaQ=", "GxYvg9kX6T7bMwjCmALeudiqaQETsuFIZMz24Y5BZfE=", "IeUkHhJWTdb9nxzdKg3jnu3+/BRmzFaOxc63RaBQbtw=", "HPtWYujPWskiaoDuF7Nqvstzq1+H4WGSe0NJ4Q5L3wg=", "DyEXfjAqdxu65tjR7LNztiyZrzRiIKwBKcU/Zm6yQQA=", "FnFSI3RgaZKv+w3X9xsSvsQjau3mKQVGvO9+H1FcIyA=", "D6PsW5SIJZwutM8kUBv62b4uyeQsXMjM1BnSppLK2HA=", "GTwOBOC9KYNXyyZsFQYIDtNu3OhcZIzAhejFexq1S7o=", "ECrfjvdHNaJ+kSgwbcvDyZ9vcpHNQGV4zhTqKtq6aPg=", "D+CveFjkmFnipU1vGtlFsTFqokv73SOuQKbQy3DD6rE=", "IW9nF7vH3tsIU2oiIIQ/Ti2l8dqp69796KXqc0R5jSI=", "HaVcyQDw0h9KPmlDkZGKGzwjsqx3PGs++I4uQigyUWE="],
        M: [["EJt/QRug5MmytwyvXDansZS+fBGtJDeL/ttoWSuoEYs=", "Fu1B4Tu5wMZq4RlCT928vJMU3J/b3upV1sZFQ9xJA+A=", "K5C7oA/KBYn2F+fcv+guDfcGq2QM6yR7eRqTt042c20="], ["KWnyfu0xpIC5w2x2Q3nbyizI/dFBXD3e1ilAvN4L13E=", "LiQZ+ewC7DlMmHHIMpY9wbiddDyMe5ZAKbIxFoex/iM=", "EBBx8AMjebaXMVh2aQ8FPRSNThCfX7BlyKrMVaD4m/o="], ["FDAh7GhqPzMNX55lRjgGXObNeeKMWzdTMmJE7mWhsac=", "F2zAKWla0CWCpw7/CKb9mdBX4S5Y59e2sWzfq8juKRE=", "GaP8ClZwK/QXun/uOAJZP6ZERwMHBD93cyec1x0l1eA="]]
      };
      exports.default = _default;
    }
  });

  // protocol/node_modules/poseidon-lite/poseidon2.js
  var require_poseidon2 = __commonJS({
    "protocol/node_modules/poseidon-lite/poseidon2.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", {
        value: true
      });
      exports.poseidon2 = poseidon22;
      var _poseidon = _interopRequireDefault(require_poseidon());
      var _unstringify = _interopRequireDefault(require_unstringify());
      var _ = _interopRequireDefault(require__2());
      function _interopRequireDefault(obj) {
        return obj && obj.__esModule ? obj : { default: obj };
      }
      var c = (0, _unstringify.default)(_.default);
      function poseidon22(inputs, nOuts) {
        return (0, _poseidon.default)(inputs, c, nOuts);
      }
    }
  });

  // protocol/node_modules/poseidon-lite/constants/3.js
  var require__3 = __commonJS({
    "protocol/node_modules/poseidon-lite/constants/3.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", {
        value: true
      });
      exports.default = void 0;
      var _default = {
        C: ["GbhJ9pRQsGhI2h05vV5KQwK7hnRO3CYjiwh44mntI+U=", "Jl3f4SfdUb1yOTR7dY8KEyDrLMdFCswdrUf4DI3PNNY=", "GZdQ7EcvGAng9mpUXh5RYkEIrIRQFcKqPfw2urSX2Ko=", "FX/z/mWscggRDwal90MCsU10PqJQZ/D/0DL3h8fxzfg=", "LknEPEVp3Zxf01rEX8oz8QsVxZBpL4vu/hj0iWrJSQI=", "DjX7iZgYkFINSu8rbWUGw8svC2lzwk+oJzE0X/otHx4=", "JRrUfLFcTxEF8QmuXpRPG6nZ54BtZn/+xv5yMALguZY=", "E9oH3GTUKDaYc+lxYCNGQfi+tW/dBeXzVj+jnZwi304=", "DACbhOZQ5tI9wAx9zO90g6VTk5aJ01DNRue4kFX9Rzg=", "AR8WscY6hU8BmS45VvQtiwTrZQxtU16wID3sdL79ygY=", "DtaeXjg6aI8gnZpWHap5YS8/eNBGetRUhd8HCT82dUk=", "BNupSnsM6eIhrK1BRytrvjrsUH9es9M/RjZyJkyfeJs=", "Cj8mN9hA86FusJQnHJ0je2A2dX1LtQv3znMv8dT6KOg=", "JZpmbxKe6hmPihxQL9s4+jmx8HVWlWS25UpIXRGCMj8=", "KL90Wcmy9MbY59BqTuOkf3dF1CcQOOUVejL99+3g1qE=", "ChypQfBXA3Um6iAPSJvo1MN8hbvM5qKu7JG9aUFDJEc=", "DG+PlYvg6TBT1/1PxUUShVU17RU58FHctDom/ZJjYc8=", "EjEGqTzRdXjUJugSisnZCqnooAcI4pbghN1X5pyq+BE=", "JuG6Uq2Shdl906tS+OhACF6PqD/x6PGHewdIZ80t7nU=", "HLVcrXvRM94YpkxcR7nJfL5Ni3v54JWGRHFTfmpK4sU=", "Hc1z5GrNj44OLHzgS95/bSpTBD1QYKQccUPwjm6QVdA=", "ARAD4y9tnGb1hS8FR0pN7wzaKUoOtOm5sSubtFEuVXQ=", "Kx6AmsHRCrKa1fINA6V9/rrf5ZA/WLr+18UI3SKHrow=", "JTneF4W3NZmftNrDXuF+0O+ZXQWrL8X66qaa6HvOwKU=", "DCRsWi747gEmSX8iKz4KDvThw9QchtRuQ5gssR13lR0=", "GSCJxJdPaOlUCBSPfAYy7bsJ5qatGhwvPwMF9dA7Uns=", "Hq4K2KtosvBqDuNu6w0MBYUpCX2RCWt1bY/cL7WmDYU=", "F5GQ5dDiIXnkb4KChyq8iNtuL9wN7pnml2i9mMXQa/s=", "KbueLJB2cyV26agcesS4MhRSj32wDzG/bK/nlKmzzRw=", "Il05TkIgdZlAPv0MJGSpDVJlJkWIKqw1sQ5ZDm5pHgg=", "BkdgYjwlyM91PSOAVbREUyvhNVdFHAh94J79RUsj/Vk=", "ELo6DgHfkuh/MBxLcW2KOU1n9L9Cp1wQkikQp49rW4c=", "DgcL9T+EUbJPnG6WsMKoActRG8DCQuudNht3aT8hRxw=", "G5TNYbBRsE3Tl1X/k4Iac8zWyxHSSR2Kp/khAU3iUvs=", "HXyzm6+4x0ThSHh6LnAjD51OkX1XE7sFBIe1qn10Bws=", "Lskxib0atPaRF9D+mAyA/4eFwpYYKfcBu3SsHzA7F9s=", "LbNmv9020nemkruCW4YnW+rEBKGa4HqQgupGvYNReSY=", "BiEA60hdsGJpZVzxhqaFMphSdUKEUDWa3JnOxpYHEbg=", "B2HTPGZhSqpXDn8egkTKESAkP5L6WeT5AMVnv0H1pZs=", "IPxBGhFNE5ksJwWqA04/MV14YIoPfeTM96cuSUhVrQ0=", "JbXABKS9/LWt2exOmrIZuhAsZ+iz7/tfw6MPMXJQvFo=", "I7GCLSeO1jKklOWPbfb17QOLGG2EdBVa2H59/2Kzf0s=", "InNLTFw/lJNgbEupASSZvw8U0Tv8/MyqFhAqKcwvaeA=", "JsDI/gnrMLfienTcM0kjR+W9/0Cao2ECVEE9P615XOU=", "Bw3QzLa9e7rojqwD+h+7Jhlr4wg6gJgpu9Ym3zSMytk=", "ErZZW9sym2+wQ7p4uyjDvsLApt5G2MWtYGfE6/1CUNo=", "JI2X1/dig9Y77DDnpYdsEcBvypsnXGccXjPZW7fo1yk=", "GjBtQ51GOwgW/G/WTMk5MYtF63Wd3eSqEG0V2b2bqqo=", "KKj4Ny48ONrO18AEIctGIfTxtU3cJ4IbDWLT1ux8Vs8=", "AJSXVxf5qKi7NRUvJNQylAcc4yDIKfOIvIUhg+Hizn4=", "BNXuTDqnj32A/eYNcWSA01k/dNT2U66D9BAyRtsujWU=", "Kmz16aoD1DNjSa1vuO0iace+9UuIIsx20ISVwS794Yc=", "IwTTHqq5YLqSdNpD4Z3et/eSGAgI/W5Duq5I1+/Lo/M=", "A/2ayGWksqbV5wCXhYFySb/win4HJvy04cEdOdGZ8LA=", "ALclje1Su9oiSEBNVe5QRHmK/DogkZMHP3lU1NY7C2Q=", "FZ+BraB3F5nsOPyi1L9l67E9OnTzKY2zYnLFymXpLZo=", "HvkOZ0N/vIVQI3p1vCjju5AAEw6iXwxUceFEz0JkQx8=", "HmX4OFFeX/AZa0mqQaLSVo33ObwXawjslaee2Cky4w0=", "KxsEXe86FmzsbOdo0Hm6dLGMhE5XDh+CZXXBBoyUwz8=", "CDLldTzrD/ZAJUOxEJIpwWXcLXO+9xXj8cbgfBaLsXM=", "AvYU6c7fs9xrdirgo31BurG4QcLotkUbxajjw5C2rRY=", "DiQn04vUamDdZAuONiytlnNw67d3vt/0D2oL4n5+1wU=", "BJNjC3xnC23rfITUFOfOeQSfDsCYw8fFB2i74pIUpTo=", "IurRAOjkgmdN7NqxcGbFomuxUVNV1UYaPcBsyFMnzqk=", "JbPlbmVbQs2q4mJu0lVNSFg/GuNWJtBN5QhOC20qbxY=", "HjJ1KtqINu9YN6bN6P8T27WZwzY0nkxYS0/cCgz2+dA=", "L6KoccFaOHzFD2j288NFWyPACZXwUHj2cqmGQHTUEuU=", "L1abippEJMknjh23MR6In1TMvxBmG6t/zRjnx6fYNQU=", "BEy0VREKj91TGt5TAjTFGKffk/czL/0hRBZTdLJGtD0=", "IngI3pOQbV1CAkYVfy5CsZH+jJCt/hGBeN3HI6UxkCU=", "AvzKKTTgRrxiOt6thzV5hl0DeBrgkK1KhXnS56aAA1U=", "DvkV8KwSC4dqvMzrNEodNrrT88Wrkajdy+wuBg2L76w=", "F5cTD0t6Phd363V7xvKH9qsPuF9r5jsJ87Fu8rFAXTg=", "CnYiXcBBcK4zBshaurWeYIx/SXwgFW1NNsZoVV3sxuU=", "H/+57BmS1muh53p7kyCa9vj6dtSKy2ZHlhdLUyajGlw=", "JXIcT8FaPyhTtXwzj6U42F+Pu6bGucYJBhGIm3l7nF8=", "DIF/1C1fekEhXj0HuhlyFq20w3kHBdqV62O5gr/K91o=", "E6vj9SOZFdOffhPCwklwtt+M+GzgCiIAK8FYZuUrWpY=", "IQb+6lRiJOoS7385mHpGyFwbw9wpvb16ks1grLTTkc4=", "IcqFlGinRraqp5R0o32rSfHKWijHSLxxV+GzNFuw+Vk=", "BczWJVwebwxc8fDfk0GUxikR0U0DIWYqjxpImZ40GFs=", "Dw40pktwpibkZNhGZ0xMiBbE+yZ/5E/m6ihnjLCUkKQ=", "BVhTGk4lRwxhV3lMo20Olkfb/P41DWSDj1saii3g1L8=", "CdPcqRc+0vrO6hJRV2g9GJJMra0/ZVpgty9YZJYfFFU=", "AyjL1U6MCRNJP4Zu0D0hi/I/ktaKrsSGF9THIuW9QzU=", "K/ByFuKv8KIjpIexpwlOB+eee8yXmMZI7jNH3VMp00s=", "Ha80WlgAa3NkmcWDy3bDFtb3jtam3/yCER4Rpj/kEt8=", "F2VjRyRWqqdGtpTGDhgjYR7zkDmy7cf/OR5vIpPSxAQ=", "LvHg+tnwjoeju15H1+M1OMqWTSt9EIPU+wIlA1vT+Ns=", "ImybGvlbq88XsrH1fHMQF5wYA97Fro8KF3ntNsgXrio=", "FLzjVJzD23QoEmtMOhWuD/gUjInxP7NdNXNOtdStDe8=", "Lev/FW4na7V0LDNz8mNbSLjpI9MB83L45VDP1ANCEsc=", "LUCDz1qH9bb8I5WyLjVrZEGv4baynEet19BDLR1HYMc=", "DCJbe80Ev5w0uREmL9ycG5G/eaEMAYTYnDF8U9cWHCk=", "AxUhadTz0G7DOnm/rJGgLJmqAgDbZtWqe4NSZfnJyPM=", "C2GBGpIQvniwWXRYdIbVi93I9Rv9/ru4ev6LeqfTGZw=", "ID4ADK0pjar366alxZIYeLiuSKz3BI8WBG1jelM7b3g=", "GkS/CTfHItE3ZnK2n2yWVbp+44b9oREsB1cUPRv6kUY=", "A3a0+uCMsD01AK/sGh9WrLjg/edaIQbXAC9ZxWEdTao=", "AHgK8socrWRlohcSUP38Mtb8JB0yFBd/PVU+82MYIYU=", "EHdNmrgMJb3rgIvt/XKo2bddvhjVIhyH6dhXB5vcMdU=", "ENxunABuo4sEseA7S9lJDA0D+Ykpyh1/tWgh/RnTtug=", "AFRLgzh5FRiyx2RaUDknmLIfdbtg41lhcAZ9ABQcrBY=", "IiwBF1cYOG8uLoLrEieJ41LhBaO4+oUmE7xTRDPuQow=", "KEDQRem8IrJZz7iBGx4PRbd/e9t/fitGFRoUMPYI48U=", "BidS+G7r4RoAnJN+RowzWwRVRXTCmQGWUI4B+lhgGGs=", "BgQb2sSCBayHrbh8IKR4pxyZUMEqgLwKVajoPqrwR0Y=", "BKUz8jbEItH/kAo2iUmwAix6KuCS8wjYKx3Lv1H1AA0=", "E+MdemcjL9gR1qlVs9TyXf4GbR59wz3wS95QorLQWyo=", "ARwmg66R6037wT1jV+hZmpJ50WSP8sldL3mQW7E5IPE=", "Cw0hk0a4V0UlsaJw4LTLpdVsko4+LCvQoeyu0BWq9q4=", "FKveyNucbclwKR7mOGkCCbZQgHge+f0T2Ex6cmtfE2Q=", "GgtwtLJv3Cj80yqj0mZHiAHrEiAu9HztmI0DdmEL4QY=", "J4VDch+W0TB7aUP5gE5/5WQB3rLvmcTRJwSILnJ4tgc=", "FutZSUqXds9XhmIU29FHPz8HOKMlY42Lo2U14BHVglk=", "JWemWKgf+0RPJACI+lUkxpqeU+6ra3+MQcNHnc+MZEo=", "KaodfBUemtCnqznxq9nPd6t44CFaVxWmuIKt6EC7E9g=", "FcCRIz5g7+DUu/zis2QVAGpPAX+ahTiM4ga5H5nyyYQ=", "Fr19Iv+Fjl4IgsLJmVWNd+dnOtXxkV+f62eagRXwFM8=", "AttQSAoHvg6ywuE+1u9AdMAYLZtmi44I/+Z2klAEICU=", "BeSiIOajvJ97aAbsnWzboYYzDvK/ettME7qGY0O3MRk=", "HdoF68MBcLyYy/Kl7jtQ6LX3C8Qk05+kEE038cvPekI=", "AYS+9yGIgYf2Rbb+42Z/PJHaIUQU2JulzTAfIrDeiZA=", "FJijB+aJAAZfXoJ29irvHDdBS4RJThV3rRptZDQbeOw=", "JfQPgrMdrMT0k5gAudLD6s73N7j6sfhk/jNUitRr1J0=", "CdMXzGcCUZQ/b1hiow0uqegwVs5JB7+7yx/zHOW7llA=", "L3fXd4bZebI7pM5KTBs70KQRMs1GeoarKbkTts8xSdA=", "D1Pa/VNan0Rz3CZrb8zGhBu9M2lj8lTBUvieeF9ym78=", "JcH9cuIjBFJlw6CZ4XUm+g5pduHAC68W3pbehd7vL6I=", "KpAsiYDBf6rjaNOF1S0WvkGvlchOrqPPiT5l1s5Kj2I=", "HOFYCjRS7PMCh4yJdrgr6WZ23RFNHcjSVSdAV2L4NSk=", "JKYHP5Gt3DOkmh+jBt8AiAHF7FaWCQNNL8UPfw9NAFY=", "JeUtvWEkUw2fwn/jBtcdRYPgfKVUtdFXfyVsaLC+K3Q=", "I9/648Qj+nqTRo28z7AphVl0vk0KeymUZ5blts1w8V0=", "BjQto3DMDYxJt3WU9rAnxIBhXVC+NiQ6mVkbyZJO1vU=", "J1QRQoEoZUa3XwnxFfx1G0d4MD0EBcG0zH3w2On2OSU=", "FcGehTTFwaiGLCvB0Rnt3qvyFBU4M9e9tZ7hl/gYfPU=", "Jl/gYnZtCPq0x40NnvPKvjZvO+CoIQYWebSz0td9Xz4=", "E8z2idZ6PsnyLLfNCsOjJ9N3rFzQFG8Ejev9CY0+x74=", "F2YvdFZ4lzn4HNOXSCeoh9kqXgW98/5rn7zMpFJKrr0=", "IbKcdjKbMcjvGGMeUV9/L4LKalzKcM7k6An9YkvnrV0=", "GBN0eDgqrbpEHrl/4nkBmJwGc4FlIVMZk56xewH6l1w=", "K8B+or+taOjcck9f7ys3wtNPdhk1/9O3Oc7sRmjzfog=", "LdsuN29U1kpWOEBIDfmT/rQXMgPCvZStDmAgd675oD4=", "J361DyuqcGEGtByyTGAmCeiiD41y9hNwitslNzWWw/c=", "DU3kfhq6NCadDGIJBPAaVrM/xLRQwNtQu3+Hc0yaH+U=", "C4RCv+nkobRChnO2vT7qb59EVpcFjxNKrpCNAnminww=", "Ef5bGPu+oahuBpMMuJ99SibhhqZZRelldCR/3bcg+PU=", "IkAm9t+vceJNJdj22fkAId9bd03K1NiDFw5K2JwzoNY=", "CyymqZn+aIfgcE2tWNA0ZalryeN9EJH2G8n5xiu+uCQ=", "Ihtj1m8LRfnUDFQFOiigax0KTOQdNkeXoafgyWUp9CE=", "MBhcSLey8dU9QSCAGwR9CHSTvOZNTSSu3OL0g2u4StQ=", "I/XTcqPw48upieIjBWIn01MzVvD6pI8n+CZzGGMqYfA=", "JxZoOzLHVf0b+CNeoWKx84jh4AkNBhYujm375DKPPjs=", "CXdUWDaGb6IEyh2FPsCQnj0UB3DICsZ9yTDGl0jV1Lw=", "FETo9ZK9v9gCXZGrSYLdQl9RaC0xRysF6BxDwPlDSzE=", "JuBLZenKgnC+t0ocXLj+6L4/+/5YP3ASoA+HTncY++M=", "IqXC+oYNEf407kelzZ+GmAD0j0/r4prW32mBb7GpFNI=", "F0tU2ZB9j1xq/Wcqc49Cc37DOPOglkxin3R03UTFyNc=", "HbHbiqRSg/MRaPpmaUzygI0hibh8jIFD1WyHGQezm4c=", "FTC/D0ZSfoiQMLjHt9/eEm9l+vjM4KtmOHNB2BPRv9E=", "C3P2E5kyKfWfAcHOyHYOmTbq2e3I8oFIiTMKLyut5Fc=", "KcJaIv4hZGBFUqrqN39EjVh6uXf8gid4e9LcDza89B4=", "KzDVPtF1m/uFA9pmySz0B3q+gnldwnKzd99X13yHVSY=", "EvbXA7VwKqt7e35pNZ1TonVsCMhe3nInz18KKRZ4fNI=", "JSDhgwCv2j9hpAoLiDcpOlWtAQcQKNSEH/qaxwY2QRM=", "Hsna6oYJcezdqO1PNG+pZ6ybxZJ4J3OTxo8J+gO4uV8=", "Cpmz4XjbLi5DL1zVvvj+RIO/XL9w7UB8CKriS4MK1yU=", "B82p5j22458Ia4m2AcK75AfuCrrDyBehMXq618V3hJI=", "CMnGWk+VXolS1XGxkbsK20m9gpCWMgOzXUiqs4+Pw6M=", "Jzf4zh1aZ7NJWQ3b+9cJ7Zr1Sio/JxnTOAHJwXvdnJ4=", "EEmmxl/wGfDSh3AHJ5jot5CUMr0MEpgTqfF5umJ/fWo=", "GLT+locyxGLA6lqb6yfOy96IaJRP32TuYKUSI2Ha7ds=", "L/K2/SLfSdJECy6u7vqMAqb0eM/PEfGypPdHNIOIXRk=", "LsXy8ZKP6TLlbHibj2u8s+i+QFfL2NvRihs1L1zvQv8=", "JlpezNi5KXXjOtn3W/NCbUJKTGp3lO4/CMHRADeOVF4=", "JAXqpMC94RKdYkK7WtoOaHeOZWz8s2a/IFF9od/UJ5w=", "CUyX2MGUxC6IAYAEy78rxf21GVXYstZrdt2Yotv2BBc=", "LDDV8zuzLFwiuZeaYFv2TVCLcFIh5qaGMwyWJcKv4Lg=", "AadWZvYkH2gl0BzG3LFiLUiG6lg+hymeaqL8cW/bbPU=", "CjKQ6DmBE+pNEqwJHoe+fG01mrmmaXn89Hvy6H04L8s=", "FUrenKNuJo3+s4RhQluw2MMSGdj6Dfx17NIb9pqgzHQ=", "J6qNPiU4DAsbFy15xvIu7pkjHvXcadjcE6S1CV0Ch3I=", "LPQFHmyrSDAaiy47ymCZ11a730ha+h9UnTlbvL2AZGE=", "MB5w9ynzyUsdP1F93/nyAVEx/quK+l7rsIQ9f4SyPnE=", "KYvrZPgS0l2LTZYgNHqwIzLcTO8ROuYNF6jXpMkfg7w=", "GzYucqX4R/hNA/0pHDxHHtHBShWyIWgKzxGj8C5GqpU=", "DciiFGEQwLN1QykCmZIj1aoe9ueOHl68vB2bpB3Bxzc=", "CkhmOzTOXhwF3JMJLLaXeMshcppy3cA6CK+h65Iv8nk=", "Coc5H7HNjN9glrZKgvnpXw/kbxQ7cC10VFuzFIgQmO4=", "G1spRvfCiXXwUS/45so2L4gm7dfqnCnzgrqKKgiS/V0=", "AQAc9RKsJB1H6+Ijkhm8ahc6i7y4pbmHtOrB9TMxW2s=", "L9l3xw9kXbT3BPp9dpPacnrAk9P7X1/rxyvrF9g1ijI=", "I8ADmj+rStPC18xogWTznnYdU1XAVETZm+djqXeTqcQ=", "GdQ+4MYIHAUsnA32Fh6qwa7DVs9DWIjnnyfyL/A/ol0=", "LZsQwvLnrBr93M/9lKVjAovym2RtAggwkZ+dXKHO/lk=", "JFfKbC8qow7Efkr/Wmb1zieZKD4Wb8gc2uLyufg+Qmc=", "Crw5L+he2oVYIFkkRQlAIoEe6Gdu1vDDBE37VKfBCzU=", "GdLMXKVJ0dQM68038+pU8xFhrDmTrPMQHSwrww6sHrA=", "D5euMDP/oBYIqvsmrhPNOT7g5OwEG6ZEo9OrVG6Yycg=", "FtvHj9KLf7gmDkBM8dQnp/oVU36k4WjoihZkluiM/so=", "JA+vKPEUmbkW8IX3O8TyLu+DROV2+K09GCeCA2bV4Hs=", "Chuwdao3/wz+bIUx5V4XcOq6gIyP222/RvjKtY2e8a8=", "LkfhXqSkf/GmqFOq86ZEyjjVsIWsEEL9xKcFp84In00=", "Fm5b8HM3g0iGDKSpwJ054Wc6sFmTX03zX7FFKDdXcrY=", "GLQtf/3S6k+vI1kC8FeidAyszNAnIzAB7RD5ZTjwkW8=", "CJyxsDIjj15JFHiOPjx+rU/DaAILPtOCId6rEFHDdwI=", "JCrNPrOi9yuvfHB23RZa34n5M5x7lxkh2ecIY0Ud2NE=", "F0+7EEpO4wK/R/K9gvzolurJoGgoPzJkdK+GBFckXDs=", "FzQOcdlvRm1h8wWM4JLGfSiR+yuzGGE/eAwnX+ERbGs=", "Ho5ArIU7fULwDy44OYLQJPCYufj9RVlTov04DE339rI=", "BSmJjcBkmQfh1NXihLjRB1GYxVytZuipv0D5KTji6WE=", "IWJ1TbC6oDC/feW7eXNk3OjHeqAX7h179l8hxNTl348=", "EsdVNpjEv2886yUK4AxYwqn5KR773kyEIb70R0F1LsY=", "KSZD47ogJq/8uMUnkxO9UaczyTNT6dnHnLcjE2UmUI4=", "AMzxPgy2+dgdUpUb6pkL1bbAfF2Y5m/3HbbnTVuH0Vg=", "GF0eIOI7CRfdZUEozy86qrZyOHPLMPwisPhsFatkW0s=", "FMYcg21V0990K98Rxg76GGd4494PAkwPE/5T+Nh2Th8=", "DzVoQbP1Vvzl2+RoBFdpHCkZ4q9TAIGE0D7hGV1yRJ4=", "G4/Z/zlxTgdd8ST4h79As4MUM3T9IIC6DAprbo+ls+g=", "DoaowgCcFAyj+HOSTiqqFPw8iuBOnfCz6RA0GHlvYCQ=", "LmxeiY9VR3cOVGKtky/N0jc/xDggyisWsIYUIeeRVcg=", "BdeX8as2RyN8FPnR3wMryf+f4aDs03eXLOX9WgwBRgQ=", "KaMRBGOlqudsPRUodZgdDB2vLc1lUZ71yokphR2owAg=", "KXTae8B0MiJzw6S5HAU1TNxxZAqLvR+GS3MvgWOIMxQ=", "HtD7BmmbokmyowYhwF6xLKKcuRqggsi/zOnFIoibR9w=", "HHk+8NzFESNlT/JtjYY/7q4p6MVy7KkS2AyK425A/ps=", "HmqsHG090xV5ViV9PSNO8YyR6CWJp4Fp+7Sodwl33C8=", "GiCtp1diNO7mJz3W+piyXtA3dICApH2Uj82jMlb7a/U=", "GRAz1thc6qb8epojpv2ZlmQtdyBF7OUTNdSTBnKK+Ww=", "AG5Zedp+fvU6glqm/dw6v8dvIAs3QLiyMu9IH10GKXs=", "Cw1+acZRkQu+8+aNQX6foPvVf1lsjymDHv+MAXTNsG0=", "Jcr1sMG5O8UWQ17AhOLs1ErEbbuwM8URLEsgolyc350=", "EsHqiSzDHg2a+LeW2WRYcvf3dELWL9TICFsvFQ9yRyo=", "Fq8paVFXq6m4u+Ov6yRf7uWpKdn5KLm4Heba3HjDKq4=", "ATbfRXyAWI3Wh/svO+GGkXBbh+xaTP3BaNMQhCVrZ9w=", "FjmijFtMgRZq6phPum5xR54Hse+8dENNuVooUGDnsIk=", "A9Yvv4L9HUMT+OZQ9YfsBoFsKLcAvcUPfiMr2bXKm3Y=", "Ea7rUn3IzkS00Uqt3KPP4vd6HkD8bal8JJgw3h7f3lQ=", "E/m5pBJ0EpR5xeYTjGyO42pnDmvGjHpJZCtkWAe/yCQ=", "Dkdy+j11F53ISEzSbHwfY13e7tepOUQMUGyui3680Vs=", "GzmgDLyB5CfeS97Fj+vo2LWXF1IGemErOfxGpoxdTbQ=", "K+22bhrVodVx4W4pU/SHMfZkY8LrVKJFRE0cCjolcH4=", "LPCgmlXKk6+KvQaPBqcof7CLGTtghYKic3nONdqRXew=", "LRvXj6kOd6qIgwyr/vL40n0aUSBQun2wdTyPuGPvs4c=", "BlYQxvT5JJH0I9MHHrg1OffA1JwThwYuYw1/0oPcM5Q=", "LZM/8ZIXpVRQE7Eoc0Ur68xfmWkDPxXsZC+0ZL1gc2g=", "GqnT/kxkSRD3a5Kz4Tsw1QDa5TVOeVCMPEnIqpngJYs=", "An7wSGnkgrHHSGOMWREcaycJX6dz4aygeM6h8chFC90=", "K31STFFyy7sV204AZoqMRJ9nomBdnsA4AuP6E2rQuPs=", "DHw4JEPGqnh8hxjYZ0fH90aTriWx5V3xP3w8Hdc12w8=", "ALRWcYa8P3xip7Vqz092IHofQ8LTDQ/kpifc3ZvXkHg=", "HkH8KbglRU/m1hc3/gi0f7B/5znkweYdAzdJCIPbT9U=", "ElB81Va3u8xy7m2vxhZYRCHhr4ctjA6JACro07oGU7Y=", "E9Q3CDVTAGvO8xLl5vUqXZfrNmF+82/k130+l/cctds=", "Fj7HMlH4VENociJIfdqaZUZ9kLIvCzhmRoYHfGpEhtU="],
        M: [["I20TOT74XMSKNR3Xht16HeXjmUIpYSf9h5RyI65RCK0=", "J3aGSU92RLvEqbGU4Qck65Z/HcWHGOWePO3IIbKnrhk=", "Aj22h4Tj8MwLhWGIJqmzUFEpwWR5lzsKhKRSnmawnGI=", "HTWdJF8obBLVDWY7rnM/l4rwjNvWMBfFezp1ZG/zgsE="], ["KnWhcVY7gH21Jb4llpmrKP6bx/sfcJQ/8Em8lw6EGgw=", "CDq/9eEAUfB44oJ9CS4a6Ai03T4VzMNwbzjOQVe2dw4=", "GlrXG7vs2Kl9xJz9uuMDrSTVxHQeq4t1aKn/glOh628=", "DXRf0A3RZ/uGdyEzZA8CzpRQBKe8LFnoeQ9yXF2E8K8="], ["IHBnnnmHgu9ZKlLKnO+CDUl60u7Lqn5C82az5SHE7UI=", "LhjIVw0gv134AHOaU9p12Qbs4xjNIkq2s6K+l54tfqs=", "D6hvDyfk091/M2fOhvaE8fLkOG0+W584+ig8aqcjtgg=", "A/Pm+reR8WYoFo5LFNuutlcDXuPaayyoPwwkkeC0A+s="], ["L1ReV4ICyXMkiFQOQfeDto/wYT/Xk3X4uos9MJWOdnc=", "I4EL+Ch3/Bm/9+7+rj+vS7gQTDK6TNcBWWoVYj0BR24=", "AU/NXrC+bVvur8SUQDTPMhwGjvkw8QviIH7VjSo0zdY=", "AMFfw6HVcz3YNerggj43f4ukqLYnYnzCu2YcJdIPtSo="]]
      };
      exports.default = _default;
    }
  });

  // protocol/node_modules/poseidon-lite/poseidon3.js
  var require_poseidon3 = __commonJS({
    "protocol/node_modules/poseidon-lite/poseidon3.js"(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", {
        value: true
      });
      exports.poseidon3 = poseidon32;
      var _poseidon = _interopRequireDefault(require_poseidon());
      var _unstringify = _interopRequireDefault(require_unstringify());
      var _ = _interopRequireDefault(require__3());
      function _interopRequireDefault(obj) {
        return obj && obj.__esModule ? obj : { default: obj };
      }
      var c = (0, _unstringify.default)(_.default);
      function poseidon32(inputs, nOuts) {
        return (0, _poseidon.default)(inputs, c, nOuts);
      }
    }
  });

  // protocol/node_modules/base64-js/index.js
  var require_base64_js = __commonJS({
    "protocol/node_modules/base64-js/index.js"(exports) {
      "use strict";
      exports.byteLength = byteLength;
      exports.toByteArray = toByteArray;
      exports.fromByteArray = fromByteArray;
      var lookup = [];
      var revLookup = [];
      var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
      var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      for (i = 0, len = code.length; i < len; ++i) {
        lookup[i] = code[i];
        revLookup[code.charCodeAt(i)] = i;
      }
      var i;
      var len;
      revLookup["-".charCodeAt(0)] = 62;
      revLookup["_".charCodeAt(0)] = 63;
      function getLens(b64) {
        var len2 = b64.length;
        if (len2 % 4 > 0) {
          throw new Error("Invalid string. Length must be a multiple of 4");
        }
        var validLen = b64.indexOf("=");
        if (validLen === -1) validLen = len2;
        var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
        return [validLen, placeHoldersLen];
      }
      function byteLength(b64) {
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function _byteLength(b64, validLen, placeHoldersLen) {
        return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
      }
      function toByteArray(b64) {
        var tmp;
        var lens = getLens(b64);
        var validLen = lens[0];
        var placeHoldersLen = lens[1];
        var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
        var curByte = 0;
        var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
        var i2;
        for (i2 = 0; i2 < len2; i2 += 4) {
          tmp = revLookup[b64.charCodeAt(i2)] << 18 | revLookup[b64.charCodeAt(i2 + 1)] << 12 | revLookup[b64.charCodeAt(i2 + 2)] << 6 | revLookup[b64.charCodeAt(i2 + 3)];
          arr[curByte++] = tmp >> 16 & 255;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 2) {
          tmp = revLookup[b64.charCodeAt(i2)] << 2 | revLookup[b64.charCodeAt(i2 + 1)] >> 4;
          arr[curByte++] = tmp & 255;
        }
        if (placeHoldersLen === 1) {
          tmp = revLookup[b64.charCodeAt(i2)] << 10 | revLookup[b64.charCodeAt(i2 + 1)] << 4 | revLookup[b64.charCodeAt(i2 + 2)] >> 2;
          arr[curByte++] = tmp >> 8 & 255;
          arr[curByte++] = tmp & 255;
        }
        return arr;
      }
      function tripletToBase64(num) {
        return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
      }
      function encodeChunk(uint8, start, end) {
        var tmp;
        var output = [];
        for (var i2 = start; i2 < end; i2 += 3) {
          tmp = (uint8[i2] << 16 & 16711680) + (uint8[i2 + 1] << 8 & 65280) + (uint8[i2 + 2] & 255);
          output.push(tripletToBase64(tmp));
        }
        return output.join("");
      }
      function fromByteArray(uint8) {
        var tmp;
        var len2 = uint8.length;
        var extraBytes = len2 % 3;
        var parts = [];
        var maxChunkLength = 16383;
        for (var i2 = 0, len22 = len2 - extraBytes; i2 < len22; i2 += maxChunkLength) {
          parts.push(encodeChunk(uint8, i2, i2 + maxChunkLength > len22 ? len22 : i2 + maxChunkLength));
        }
        if (extraBytes === 1) {
          tmp = uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
          );
        } else if (extraBytes === 2) {
          tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
          parts.push(
            lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
          );
        }
        return parts.join("");
      }
    }
  });

  // protocol/node_modules/ieee754/index.js
  var require_ieee754 = __commonJS({
    "protocol/node_modules/ieee754/index.js"(exports) {
      exports.read = function(buffer, offset, isLE, mLen, nBytes) {
        var e, m;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var nBits = -7;
        var i = isLE ? nBytes - 1 : 0;
        var d = isLE ? -1 : 1;
        var s = buffer[offset + i];
        i += d;
        e = s & (1 << -nBits) - 1;
        s >>= -nBits;
        nBits += eLen;
        for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
        }
        m = e & (1 << -nBits) - 1;
        e >>= -nBits;
        nBits += mLen;
        for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
        }
        if (e === 0) {
          e = 1 - eBias;
        } else if (e === eMax) {
          return m ? NaN : (s ? -1 : 1) * Infinity;
        } else {
          m = m + Math.pow(2, mLen);
          e = e - eBias;
        }
        return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
      };
      exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
        var e, m, c;
        var eLen = nBytes * 8 - mLen - 1;
        var eMax = (1 << eLen) - 1;
        var eBias = eMax >> 1;
        var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
        var i = isLE ? 0 : nBytes - 1;
        var d = isLE ? 1 : -1;
        var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
        value = Math.abs(value);
        if (isNaN(value) || value === Infinity) {
          m = isNaN(value) ? 1 : 0;
          e = eMax;
        } else {
          e = Math.floor(Math.log(value) / Math.LN2);
          if (value * (c = Math.pow(2, -e)) < 1) {
            e--;
            c *= 2;
          }
          if (e + eBias >= 1) {
            value += rt / c;
          } else {
            value += rt * Math.pow(2, 1 - eBias);
          }
          if (value * c >= 2) {
            e++;
            c /= 2;
          }
          if (e + eBias >= eMax) {
            m = 0;
            e = eMax;
          } else if (e + eBias >= 1) {
            m = (value * c - 1) * Math.pow(2, mLen);
            e = e + eBias;
          } else {
            m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
            e = 0;
          }
        }
        for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
        }
        e = e << mLen | m;
        eLen += mLen;
        for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
        }
        buffer[offset + i - d] |= s * 128;
      };
    }
  });

  // protocol/node_modules/buffer/index.js
  var require_buffer = __commonJS({
    "protocol/node_modules/buffer/index.js"(exports) {
      "use strict";
      var base64 = require_base64_js();
      var ieee754 = require_ieee754();
      var customInspectSymbol = typeof Symbol === "function" && typeof Symbol["for"] === "function" ? Symbol["for"]("nodejs.util.inspect.custom") : null;
      exports.Buffer = Buffer3;
      exports.SlowBuffer = SlowBuffer;
      exports.INSPECT_MAX_BYTES = 50;
      var K_MAX_LENGTH = 2147483647;
      exports.kMaxLength = K_MAX_LENGTH;
      Buffer3.TYPED_ARRAY_SUPPORT = typedArraySupport();
      if (!Buffer3.TYPED_ARRAY_SUPPORT && typeof console !== "undefined" && typeof console.error === "function") {
        console.error(
          "This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."
        );
      }
      function typedArraySupport() {
        try {
          const arr = new Uint8Array(1);
          const proto = { foo: function() {
            return 42;
          } };
          Object.setPrototypeOf(proto, Uint8Array.prototype);
          Object.setPrototypeOf(arr, proto);
          return arr.foo() === 42;
        } catch (e) {
          return false;
        }
      }
      Object.defineProperty(Buffer3.prototype, "parent", {
        enumerable: true,
        get: function() {
          if (!Buffer3.isBuffer(this)) return void 0;
          return this.buffer;
        }
      });
      Object.defineProperty(Buffer3.prototype, "offset", {
        enumerable: true,
        get: function() {
          if (!Buffer3.isBuffer(this)) return void 0;
          return this.byteOffset;
        }
      });
      function createBuffer(length) {
        if (length > K_MAX_LENGTH) {
          throw new RangeError('The value "' + length + '" is invalid for option "size"');
        }
        const buf = new Uint8Array(length);
        Object.setPrototypeOf(buf, Buffer3.prototype);
        return buf;
      }
      function Buffer3(arg, encodingOrOffset, length) {
        if (typeof arg === "number") {
          if (typeof encodingOrOffset === "string") {
            throw new TypeError(
              'The "string" argument must be of type string. Received type number'
            );
          }
          return allocUnsafe(arg);
        }
        return from(arg, encodingOrOffset, length);
      }
      Buffer3.poolSize = 8192;
      function from(value, encodingOrOffset, length) {
        if (typeof value === "string") {
          return fromString(value, encodingOrOffset);
        }
        if (ArrayBuffer.isView(value)) {
          return fromArrayView(value);
        }
        if (value == null) {
          throw new TypeError(
            "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
          );
        }
        if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof SharedArrayBuffer !== "undefined" && (isInstance(value, SharedArrayBuffer) || value && isInstance(value.buffer, SharedArrayBuffer))) {
          return fromArrayBuffer(value, encodingOrOffset, length);
        }
        if (typeof value === "number") {
          throw new TypeError(
            'The "value" argument must not be of type number. Received type number'
          );
        }
        const valueOf = value.valueOf && value.valueOf();
        if (valueOf != null && valueOf !== value) {
          return Buffer3.from(valueOf, encodingOrOffset, length);
        }
        const b = fromObject(value);
        if (b) return b;
        if (typeof Symbol !== "undefined" && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === "function") {
          return Buffer3.from(value[Symbol.toPrimitive]("string"), encodingOrOffset, length);
        }
        throw new TypeError(
          "The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type " + typeof value
        );
      }
      Buffer3.from = function(value, encodingOrOffset, length) {
        return from(value, encodingOrOffset, length);
      };
      Object.setPrototypeOf(Buffer3.prototype, Uint8Array.prototype);
      Object.setPrototypeOf(Buffer3, Uint8Array);
      function assertSize(size) {
        if (typeof size !== "number") {
          throw new TypeError('"size" argument must be of type number');
        } else if (size < 0) {
          throw new RangeError('The value "' + size + '" is invalid for option "size"');
        }
      }
      function alloc(size, fill, encoding) {
        assertSize(size);
        if (size <= 0) {
          return createBuffer(size);
        }
        if (fill !== void 0) {
          return typeof encoding === "string" ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
        }
        return createBuffer(size);
      }
      Buffer3.alloc = function(size, fill, encoding) {
        return alloc(size, fill, encoding);
      };
      function allocUnsafe(size) {
        assertSize(size);
        return createBuffer(size < 0 ? 0 : checked(size) | 0);
      }
      Buffer3.allocUnsafe = function(size) {
        return allocUnsafe(size);
      };
      Buffer3.allocUnsafeSlow = function(size) {
        return allocUnsafe(size);
      };
      function fromString(string, encoding) {
        if (typeof encoding !== "string" || encoding === "") {
          encoding = "utf8";
        }
        if (!Buffer3.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
        const length = byteLength(string, encoding) | 0;
        let buf = createBuffer(length);
        const actual = buf.write(string, encoding);
        if (actual !== length) {
          buf = buf.slice(0, actual);
        }
        return buf;
      }
      function fromArrayLike(array) {
        const length = array.length < 0 ? 0 : checked(array.length) | 0;
        const buf = createBuffer(length);
        for (let i = 0; i < length; i += 1) {
          buf[i] = array[i] & 255;
        }
        return buf;
      }
      function fromArrayView(arrayView) {
        if (isInstance(arrayView, Uint8Array)) {
          const copy = new Uint8Array(arrayView);
          return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength);
        }
        return fromArrayLike(arrayView);
      }
      function fromArrayBuffer(array, byteOffset, length) {
        if (byteOffset < 0 || array.byteLength < byteOffset) {
          throw new RangeError('"offset" is outside of buffer bounds');
        }
        if (array.byteLength < byteOffset + (length || 0)) {
          throw new RangeError('"length" is outside of buffer bounds');
        }
        let buf;
        if (byteOffset === void 0 && length === void 0) {
          buf = new Uint8Array(array);
        } else if (length === void 0) {
          buf = new Uint8Array(array, byteOffset);
        } else {
          buf = new Uint8Array(array, byteOffset, length);
        }
        Object.setPrototypeOf(buf, Buffer3.prototype);
        return buf;
      }
      function fromObject(obj) {
        if (Buffer3.isBuffer(obj)) {
          const len = checked(obj.length) | 0;
          const buf = createBuffer(len);
          if (buf.length === 0) {
            return buf;
          }
          obj.copy(buf, 0, 0, len);
          return buf;
        }
        if (obj.length !== void 0) {
          if (typeof obj.length !== "number" || numberIsNaN(obj.length)) {
            return createBuffer(0);
          }
          return fromArrayLike(obj);
        }
        if (obj.type === "Buffer" && Array.isArray(obj.data)) {
          return fromArrayLike(obj.data);
        }
      }
      function checked(length) {
        if (length >= K_MAX_LENGTH) {
          throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + K_MAX_LENGTH.toString(16) + " bytes");
        }
        return length | 0;
      }
      function SlowBuffer(length) {
        if (+length != length) {
          length = 0;
        }
        return Buffer3.alloc(+length);
      }
      Buffer3.isBuffer = function isBuffer2(b) {
        return b != null && b._isBuffer === true && b !== Buffer3.prototype;
      };
      Buffer3.compare = function compare(a, b) {
        if (isInstance(a, Uint8Array)) a = Buffer3.from(a, a.offset, a.byteLength);
        if (isInstance(b, Uint8Array)) b = Buffer3.from(b, b.offset, b.byteLength);
        if (!Buffer3.isBuffer(a) || !Buffer3.isBuffer(b)) {
          throw new TypeError(
            'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
          );
        }
        if (a === b) return 0;
        let x = a.length;
        let y = b.length;
        for (let i = 0, len = Math.min(x, y); i < len; ++i) {
          if (a[i] !== b[i]) {
            x = a[i];
            y = b[i];
            break;
          }
        }
        if (x < y) return -1;
        if (y < x) return 1;
        return 0;
      };
      Buffer3.isEncoding = function isEncoding(encoding) {
        switch (String(encoding).toLowerCase()) {
          case "hex":
          case "utf8":
          case "utf-8":
          case "ascii":
          case "latin1":
          case "binary":
          case "base64":
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return true;
          default:
            return false;
        }
      };
      Buffer3.concat = function concat(list, length) {
        if (!Array.isArray(list)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        }
        if (list.length === 0) {
          return Buffer3.alloc(0);
        }
        let i;
        if (length === void 0) {
          length = 0;
          for (i = 0; i < list.length; ++i) {
            length += list[i].length;
          }
        }
        const buffer = Buffer3.allocUnsafe(length);
        let pos = 0;
        for (i = 0; i < list.length; ++i) {
          let buf = list[i];
          if (isInstance(buf, Uint8Array)) {
            if (pos + buf.length > buffer.length) {
              if (!Buffer3.isBuffer(buf)) buf = Buffer3.from(buf);
              buf.copy(buffer, pos);
            } else {
              Uint8Array.prototype.set.call(
                buffer,
                buf,
                pos
              );
            }
          } else if (!Buffer3.isBuffer(buf)) {
            throw new TypeError('"list" argument must be an Array of Buffers');
          } else {
            buf.copy(buffer, pos);
          }
          pos += buf.length;
        }
        return buffer;
      };
      function byteLength(string, encoding) {
        if (Buffer3.isBuffer(string)) {
          return string.length;
        }
        if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
          return string.byteLength;
        }
        if (typeof string !== "string") {
          throw new TypeError(
            'The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type ' + typeof string
          );
        }
        const len = string.length;
        const mustMatch = arguments.length > 2 && arguments[2] === true;
        if (!mustMatch && len === 0) return 0;
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "ascii":
            case "latin1":
            case "binary":
              return len;
            case "utf8":
            case "utf-8":
              return utf8ToBytes(string).length;
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return len * 2;
            case "hex":
              return len >>> 1;
            case "base64":
              return base64ToBytes(string).length;
            default:
              if (loweredCase) {
                return mustMatch ? -1 : utf8ToBytes(string).length;
              }
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer3.byteLength = byteLength;
      function slowToString(encoding, start, end) {
        let loweredCase = false;
        if (start === void 0 || start < 0) {
          start = 0;
        }
        if (start > this.length) {
          return "";
        }
        if (end === void 0 || end > this.length) {
          end = this.length;
        }
        if (end <= 0) {
          return "";
        }
        end >>>= 0;
        start >>>= 0;
        if (end <= start) {
          return "";
        }
        if (!encoding) encoding = "utf8";
        while (true) {
          switch (encoding) {
            case "hex":
              return hexSlice(this, start, end);
            case "utf8":
            case "utf-8":
              return utf8Slice(this, start, end);
            case "ascii":
              return asciiSlice(this, start, end);
            case "latin1":
            case "binary":
              return latin1Slice(this, start, end);
            case "base64":
              return base64Slice(this, start, end);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return utf16leSlice(this, start, end);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = (encoding + "").toLowerCase();
              loweredCase = true;
          }
        }
      }
      Buffer3.prototype._isBuffer = true;
      function swap(b, n, m) {
        const i = b[n];
        b[n] = b[m];
        b[m] = i;
      }
      Buffer3.prototype.swap16 = function swap16() {
        const len = this.length;
        if (len % 2 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 16-bits");
        }
        for (let i = 0; i < len; i += 2) {
          swap(this, i, i + 1);
        }
        return this;
      };
      Buffer3.prototype.swap32 = function swap32() {
        const len = this.length;
        if (len % 4 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 32-bits");
        }
        for (let i = 0; i < len; i += 4) {
          swap(this, i, i + 3);
          swap(this, i + 1, i + 2);
        }
        return this;
      };
      Buffer3.prototype.swap64 = function swap64() {
        const len = this.length;
        if (len % 8 !== 0) {
          throw new RangeError("Buffer size must be a multiple of 64-bits");
        }
        for (let i = 0; i < len; i += 8) {
          swap(this, i, i + 7);
          swap(this, i + 1, i + 6);
          swap(this, i + 2, i + 5);
          swap(this, i + 3, i + 4);
        }
        return this;
      };
      Buffer3.prototype.toString = function toString() {
        const length = this.length;
        if (length === 0) return "";
        if (arguments.length === 0) return utf8Slice(this, 0, length);
        return slowToString.apply(this, arguments);
      };
      Buffer3.prototype.toLocaleString = Buffer3.prototype.toString;
      Buffer3.prototype.equals = function equals(b) {
        if (!Buffer3.isBuffer(b)) throw new TypeError("Argument must be a Buffer");
        if (this === b) return true;
        return Buffer3.compare(this, b) === 0;
      };
      Buffer3.prototype.inspect = function inspect() {
        let str = "";
        const max = exports.INSPECT_MAX_BYTES;
        str = this.toString("hex", 0, max).replace(/(.{2})/g, "$1 ").trim();
        if (this.length > max) str += " ... ";
        return "<Buffer " + str + ">";
      };
      if (customInspectSymbol) {
        Buffer3.prototype[customInspectSymbol] = Buffer3.prototype.inspect;
      }
      Buffer3.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
        if (isInstance(target, Uint8Array)) {
          target = Buffer3.from(target, target.offset, target.byteLength);
        }
        if (!Buffer3.isBuffer(target)) {
          throw new TypeError(
            'The "target" argument must be one of type Buffer or Uint8Array. Received type ' + typeof target
          );
        }
        if (start === void 0) {
          start = 0;
        }
        if (end === void 0) {
          end = target ? target.length : 0;
        }
        if (thisStart === void 0) {
          thisStart = 0;
        }
        if (thisEnd === void 0) {
          thisEnd = this.length;
        }
        if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
          throw new RangeError("out of range index");
        }
        if (thisStart >= thisEnd && start >= end) {
          return 0;
        }
        if (thisStart >= thisEnd) {
          return -1;
        }
        if (start >= end) {
          return 1;
        }
        start >>>= 0;
        end >>>= 0;
        thisStart >>>= 0;
        thisEnd >>>= 0;
        if (this === target) return 0;
        let x = thisEnd - thisStart;
        let y = end - start;
        const len = Math.min(x, y);
        const thisCopy = this.slice(thisStart, thisEnd);
        const targetCopy = target.slice(start, end);
        for (let i = 0; i < len; ++i) {
          if (thisCopy[i] !== targetCopy[i]) {
            x = thisCopy[i];
            y = targetCopy[i];
            break;
          }
        }
        if (x < y) return -1;
        if (y < x) return 1;
        return 0;
      };
      function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
        if (buffer.length === 0) return -1;
        if (typeof byteOffset === "string") {
          encoding = byteOffset;
          byteOffset = 0;
        } else if (byteOffset > 2147483647) {
          byteOffset = 2147483647;
        } else if (byteOffset < -2147483648) {
          byteOffset = -2147483648;
        }
        byteOffset = +byteOffset;
        if (numberIsNaN(byteOffset)) {
          byteOffset = dir ? 0 : buffer.length - 1;
        }
        if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
        if (byteOffset >= buffer.length) {
          if (dir) return -1;
          else byteOffset = buffer.length - 1;
        } else if (byteOffset < 0) {
          if (dir) byteOffset = 0;
          else return -1;
        }
        if (typeof val === "string") {
          val = Buffer3.from(val, encoding);
        }
        if (Buffer3.isBuffer(val)) {
          if (val.length === 0) {
            return -1;
          }
          return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
        } else if (typeof val === "number") {
          val = val & 255;
          if (typeof Uint8Array.prototype.indexOf === "function") {
            if (dir) {
              return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
            } else {
              return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
            }
          }
          return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
        }
        throw new TypeError("val must be string, number or Buffer");
      }
      function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
        let indexSize = 1;
        let arrLength = arr.length;
        let valLength = val.length;
        if (encoding !== void 0) {
          encoding = String(encoding).toLowerCase();
          if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
            if (arr.length < 2 || val.length < 2) {
              return -1;
            }
            indexSize = 2;
            arrLength /= 2;
            valLength /= 2;
            byteOffset /= 2;
          }
        }
        function read(buf, i2) {
          if (indexSize === 1) {
            return buf[i2];
          } else {
            return buf.readUInt16BE(i2 * indexSize);
          }
        }
        let i;
        if (dir) {
          let foundIndex = -1;
          for (i = byteOffset; i < arrLength; i++) {
            if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
              if (foundIndex === -1) foundIndex = i;
              if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
            } else {
              if (foundIndex !== -1) i -= i - foundIndex;
              foundIndex = -1;
            }
          }
        } else {
          if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
          for (i = byteOffset; i >= 0; i--) {
            let found = true;
            for (let j = 0; j < valLength; j++) {
              if (read(arr, i + j) !== read(val, j)) {
                found = false;
                break;
              }
            }
            if (found) return i;
          }
        }
        return -1;
      }
      Buffer3.prototype.includes = function includes(val, byteOffset, encoding) {
        return this.indexOf(val, byteOffset, encoding) !== -1;
      };
      Buffer3.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
      };
      Buffer3.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
        return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
      };
      function hexWrite(buf, string, offset, length) {
        offset = Number(offset) || 0;
        const remaining = buf.length - offset;
        if (!length) {
          length = remaining;
        } else {
          length = Number(length);
          if (length > remaining) {
            length = remaining;
          }
        }
        const strLen = string.length;
        if (length > strLen / 2) {
          length = strLen / 2;
        }
        let i;
        for (i = 0; i < length; ++i) {
          const parsed = parseInt(string.substr(i * 2, 2), 16);
          if (numberIsNaN(parsed)) return i;
          buf[offset + i] = parsed;
        }
        return i;
      }
      function utf8Write(buf, string, offset, length) {
        return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
      }
      function asciiWrite(buf, string, offset, length) {
        return blitBuffer(asciiToBytes(string), buf, offset, length);
      }
      function base64Write(buf, string, offset, length) {
        return blitBuffer(base64ToBytes(string), buf, offset, length);
      }
      function ucs2Write(buf, string, offset, length) {
        return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
      }
      Buffer3.prototype.write = function write(string, offset, length, encoding) {
        if (offset === void 0) {
          encoding = "utf8";
          length = this.length;
          offset = 0;
        } else if (length === void 0 && typeof offset === "string") {
          encoding = offset;
          length = this.length;
          offset = 0;
        } else if (isFinite(offset)) {
          offset = offset >>> 0;
          if (isFinite(length)) {
            length = length >>> 0;
            if (encoding === void 0) encoding = "utf8";
          } else {
            encoding = length;
            length = void 0;
          }
        } else {
          throw new Error(
            "Buffer.write(string, encoding, offset[, length]) is no longer supported"
          );
        }
        const remaining = this.length - offset;
        if (length === void 0 || length > remaining) length = remaining;
        if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
          throw new RangeError("Attempt to write outside buffer bounds");
        }
        if (!encoding) encoding = "utf8";
        let loweredCase = false;
        for (; ; ) {
          switch (encoding) {
            case "hex":
              return hexWrite(this, string, offset, length);
            case "utf8":
            case "utf-8":
              return utf8Write(this, string, offset, length);
            case "ascii":
            case "latin1":
            case "binary":
              return asciiWrite(this, string, offset, length);
            case "base64":
              return base64Write(this, string, offset, length);
            case "ucs2":
            case "ucs-2":
            case "utf16le":
            case "utf-16le":
              return ucs2Write(this, string, offset, length);
            default:
              if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
              encoding = ("" + encoding).toLowerCase();
              loweredCase = true;
          }
        }
      };
      Buffer3.prototype.toJSON = function toJSON() {
        return {
          type: "Buffer",
          data: Array.prototype.slice.call(this._arr || this, 0)
        };
      };
      function base64Slice(buf, start, end) {
        if (start === 0 && end === buf.length) {
          return base64.fromByteArray(buf);
        } else {
          return base64.fromByteArray(buf.slice(start, end));
        }
      }
      function utf8Slice(buf, start, end) {
        end = Math.min(buf.length, end);
        const res = [];
        let i = start;
        while (i < end) {
          const firstByte = buf[i];
          let codePoint = null;
          let bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
          if (i + bytesPerSequence <= end) {
            let secondByte, thirdByte, fourthByte, tempCodePoint;
            switch (bytesPerSequence) {
              case 1:
                if (firstByte < 128) {
                  codePoint = firstByte;
                }
                break;
              case 2:
                secondByte = buf[i + 1];
                if ((secondByte & 192) === 128) {
                  tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
                  if (tempCodePoint > 127) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 3:
                secondByte = buf[i + 1];
                thirdByte = buf[i + 2];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
                  if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
                    codePoint = tempCodePoint;
                  }
                }
                break;
              case 4:
                secondByte = buf[i + 1];
                thirdByte = buf[i + 2];
                fourthByte = buf[i + 3];
                if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
                  tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
                  if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
                    codePoint = tempCodePoint;
                  }
                }
            }
          }
          if (codePoint === null) {
            codePoint = 65533;
            bytesPerSequence = 1;
          } else if (codePoint > 65535) {
            codePoint -= 65536;
            res.push(codePoint >>> 10 & 1023 | 55296);
            codePoint = 56320 | codePoint & 1023;
          }
          res.push(codePoint);
          i += bytesPerSequence;
        }
        return decodeCodePointsArray(res);
      }
      var MAX_ARGUMENTS_LENGTH = 4096;
      function decodeCodePointsArray(codePoints) {
        const len = codePoints.length;
        if (len <= MAX_ARGUMENTS_LENGTH) {
          return String.fromCharCode.apply(String, codePoints);
        }
        let res = "";
        let i = 0;
        while (i < len) {
          res += String.fromCharCode.apply(
            String,
            codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
          );
        }
        return res;
      }
      function asciiSlice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i = start; i < end; ++i) {
          ret += String.fromCharCode(buf[i] & 127);
        }
        return ret;
      }
      function latin1Slice(buf, start, end) {
        let ret = "";
        end = Math.min(buf.length, end);
        for (let i = start; i < end; ++i) {
          ret += String.fromCharCode(buf[i]);
        }
        return ret;
      }
      function hexSlice(buf, start, end) {
        const len = buf.length;
        if (!start || start < 0) start = 0;
        if (!end || end < 0 || end > len) end = len;
        let out = "";
        for (let i = start; i < end; ++i) {
          out += hexSliceLookupTable[buf[i]];
        }
        return out;
      }
      function utf16leSlice(buf, start, end) {
        const bytes = buf.slice(start, end);
        let res = "";
        for (let i = 0; i < bytes.length - 1; i += 2) {
          res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
        }
        return res;
      }
      Buffer3.prototype.slice = function slice(start, end) {
        const len = this.length;
        start = ~~start;
        end = end === void 0 ? len : ~~end;
        if (start < 0) {
          start += len;
          if (start < 0) start = 0;
        } else if (start > len) {
          start = len;
        }
        if (end < 0) {
          end += len;
          if (end < 0) end = 0;
        } else if (end > len) {
          end = len;
        }
        if (end < start) end = start;
        const newBuf = this.subarray(start, end);
        Object.setPrototypeOf(newBuf, Buffer3.prototype);
        return newBuf;
      };
      function checkOffset(offset, ext, length) {
        if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
        if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
      }
      Buffer3.prototype.readUintLE = Buffer3.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul = 1;
        let i = 0;
        while (++i < byteLength2 && (mul *= 256)) {
          val += this[offset + i] * mul;
        }
        return val;
      };
      Buffer3.prototype.readUintBE = Buffer3.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          checkOffset(offset, byteLength2, this.length);
        }
        let val = this[offset + --byteLength2];
        let mul = 1;
        while (byteLength2 > 0 && (mul *= 256)) {
          val += this[offset + --byteLength2] * mul;
        }
        return val;
      };
      Buffer3.prototype.readUint8 = Buffer3.prototype.readUInt8 = function readUInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        return this[offset];
      };
      Buffer3.prototype.readUint16LE = Buffer3.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] | this[offset + 1] << 8;
      };
      Buffer3.prototype.readUint16BE = Buffer3.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        return this[offset] << 8 | this[offset + 1];
      };
      Buffer3.prototype.readUint32LE = Buffer3.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
      };
      Buffer3.prototype.readUint32BE = Buffer3.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
      };
      Buffer3.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const lo = first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24;
        const hi = this[++offset] + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24;
        return BigInt(lo) + (BigInt(hi) << BigInt(32));
      });
      Buffer3.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const hi = first * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        const lo = this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last;
        return (BigInt(hi) << BigInt(32)) + BigInt(lo);
      });
      Buffer3.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let val = this[offset];
        let mul = 1;
        let i = 0;
        while (++i < byteLength2 && (mul *= 256)) {
          val += this[offset + i] * mul;
        }
        mul *= 128;
        if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer3.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) checkOffset(offset, byteLength2, this.length);
        let i = byteLength2;
        let mul = 1;
        let val = this[offset + --i];
        while (i > 0 && (mul *= 256)) {
          val += this[offset + --i] * mul;
        }
        mul *= 128;
        if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
        return val;
      };
      Buffer3.prototype.readInt8 = function readInt8(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 1, this.length);
        if (!(this[offset] & 128)) return this[offset];
        return (255 - this[offset] + 1) * -1;
      };
      Buffer3.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset] | this[offset + 1] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer3.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 2, this.length);
        const val = this[offset + 1] | this[offset] << 8;
        return val & 32768 ? val | 4294901760 : val;
      };
      Buffer3.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
      };
      Buffer3.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
      };
      Buffer3.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = this[offset + 4] + this[offset + 5] * 2 ** 8 + this[offset + 6] * 2 ** 16 + (last << 24);
        return (BigInt(val) << BigInt(32)) + BigInt(first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 24);
      });
      Buffer3.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE(offset) {
        offset = offset >>> 0;
        validateNumber(offset, "offset");
        const first = this[offset];
        const last = this[offset + 7];
        if (first === void 0 || last === void 0) {
          boundsError(offset, this.length - 8);
        }
        const val = (first << 24) + // Overflow
        this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + this[++offset];
        return (BigInt(val) << BigInt(32)) + BigInt(this[++offset] * 2 ** 24 + this[++offset] * 2 ** 16 + this[++offset] * 2 ** 8 + last);
      });
      Buffer3.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, true, 23, 4);
      };
      Buffer3.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 4, this.length);
        return ieee754.read(this, offset, false, 23, 4);
      };
      Buffer3.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, true, 52, 8);
      };
      Buffer3.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
        offset = offset >>> 0;
        if (!noAssert) checkOffset(offset, 8, this.length);
        return ieee754.read(this, offset, false, 52, 8);
      };
      function checkInt(buf, value, offset, ext, max, min) {
        if (!Buffer3.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
        if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
      }
      Buffer3.prototype.writeUintLE = Buffer3.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let mul = 1;
        let i = 0;
        this[offset] = value & 255;
        while (++i < byteLength2 && (mul *= 256)) {
          this[offset + i] = value / mul & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeUintBE = Buffer3.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        byteLength2 = byteLength2 >>> 0;
        if (!noAssert) {
          const maxBytes = Math.pow(2, 8 * byteLength2) - 1;
          checkInt(this, value, offset, byteLength2, maxBytes, 0);
        }
        let i = byteLength2 - 1;
        let mul = 1;
        this[offset + i] = value & 255;
        while (--i >= 0 && (mul *= 256)) {
          this[offset + i] = value / mul & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeUint8 = Buffer3.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer3.prototype.writeUint16LE = Buffer3.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer3.prototype.writeUint16BE = Buffer3.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer3.prototype.writeUint32LE = Buffer3.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset + 3] = value >>> 24;
        this[offset + 2] = value >>> 16;
        this[offset + 1] = value >>> 8;
        this[offset] = value & 255;
        return offset + 4;
      };
      Buffer3.prototype.writeUint32BE = Buffer3.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      function wrtBigUInt64LE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        lo = lo >> 8;
        buf[offset++] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        hi = hi >> 8;
        buf[offset++] = hi;
        return offset;
      }
      function wrtBigUInt64BE(buf, value, offset, min, max) {
        checkIntBI(value, min, max, buf, offset, 7);
        let lo = Number(value & BigInt(4294967295));
        buf[offset + 7] = lo;
        lo = lo >> 8;
        buf[offset + 6] = lo;
        lo = lo >> 8;
        buf[offset + 5] = lo;
        lo = lo >> 8;
        buf[offset + 4] = lo;
        let hi = Number(value >> BigInt(32) & BigInt(4294967295));
        buf[offset + 3] = hi;
        hi = hi >> 8;
        buf[offset + 2] = hi;
        hi = hi >> 8;
        buf[offset + 1] = hi;
        hi = hi >> 8;
        buf[offset] = hi;
        return offset + 8;
      }
      Buffer3.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer3.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt("0xffffffffffffffff"));
      });
      Buffer3.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i = 0;
        let mul = 1;
        let sub = 0;
        this[offset] = value & 255;
        while (++i < byteLength2 && (mul *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
            sub = 1;
          }
          this[offset + i] = (value / mul >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          const limit = Math.pow(2, 8 * byteLength2 - 1);
          checkInt(this, value, offset, byteLength2, limit - 1, -limit);
        }
        let i = byteLength2 - 1;
        let mul = 1;
        let sub = 0;
        this[offset + i] = value & 255;
        while (--i >= 0 && (mul *= 256)) {
          if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
            sub = 1;
          }
          this[offset + i] = (value / mul >> 0) - sub & 255;
        }
        return offset + byteLength2;
      };
      Buffer3.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
        if (value < 0) value = 255 + value + 1;
        this[offset] = value & 255;
        return offset + 1;
      };
      Buffer3.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        return offset + 2;
      };
      Buffer3.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
        return offset + 2;
      };
      Buffer3.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        this[offset + 2] = value >>> 16;
        this[offset + 3] = value >>> 24;
        return offset + 4;
      };
      Buffer3.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
        if (value < 0) value = 4294967295 + value + 1;
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
        return offset + 4;
      };
      Buffer3.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE(value, offset = 0) {
        return wrtBigUInt64LE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      Buffer3.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE(value, offset = 0) {
        return wrtBigUInt64BE(this, value, offset, -BigInt("0x8000000000000000"), BigInt("0x7fffffffffffffff"));
      });
      function checkIEEE754(buf, value, offset, ext, max, min) {
        if (offset + ext > buf.length) throw new RangeError("Index out of range");
        if (offset < 0) throw new RangeError("Index out of range");
      }
      function writeFloat(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 4, 34028234663852886e22, -34028234663852886e22);
        }
        ieee754.write(buf, value, offset, littleEndian, 23, 4);
        return offset + 4;
      }
      Buffer3.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
        return writeFloat(this, value, offset, true, noAssert);
      };
      Buffer3.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
        return writeFloat(this, value, offset, false, noAssert);
      };
      function writeDouble(buf, value, offset, littleEndian, noAssert) {
        value = +value;
        offset = offset >>> 0;
        if (!noAssert) {
          checkIEEE754(buf, value, offset, 8, 17976931348623157e292, -17976931348623157e292);
        }
        ieee754.write(buf, value, offset, littleEndian, 52, 8);
        return offset + 8;
      }
      Buffer3.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
        return writeDouble(this, value, offset, true, noAssert);
      };
      Buffer3.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
        return writeDouble(this, value, offset, false, noAssert);
      };
      Buffer3.prototype.copy = function copy(target, targetStart, start, end) {
        if (!Buffer3.isBuffer(target)) throw new TypeError("argument should be a Buffer");
        if (!start) start = 0;
        if (!end && end !== 0) end = this.length;
        if (targetStart >= target.length) targetStart = target.length;
        if (!targetStart) targetStart = 0;
        if (end > 0 && end < start) end = start;
        if (end === start) return 0;
        if (target.length === 0 || this.length === 0) return 0;
        if (targetStart < 0) {
          throw new RangeError("targetStart out of bounds");
        }
        if (start < 0 || start >= this.length) throw new RangeError("Index out of range");
        if (end < 0) throw new RangeError("sourceEnd out of bounds");
        if (end > this.length) end = this.length;
        if (target.length - targetStart < end - start) {
          end = target.length - targetStart + start;
        }
        const len = end - start;
        if (this === target && typeof Uint8Array.prototype.copyWithin === "function") {
          this.copyWithin(targetStart, start, end);
        } else {
          Uint8Array.prototype.set.call(
            target,
            this.subarray(start, end),
            targetStart
          );
        }
        return len;
      };
      Buffer3.prototype.fill = function fill(val, start, end, encoding) {
        if (typeof val === "string") {
          if (typeof start === "string") {
            encoding = start;
            start = 0;
            end = this.length;
          } else if (typeof end === "string") {
            encoding = end;
            end = this.length;
          }
          if (encoding !== void 0 && typeof encoding !== "string") {
            throw new TypeError("encoding must be a string");
          }
          if (typeof encoding === "string" && !Buffer3.isEncoding(encoding)) {
            throw new TypeError("Unknown encoding: " + encoding);
          }
          if (val.length === 1) {
            const code = val.charCodeAt(0);
            if (encoding === "utf8" && code < 128 || encoding === "latin1") {
              val = code;
            }
          }
        } else if (typeof val === "number") {
          val = val & 255;
        } else if (typeof val === "boolean") {
          val = Number(val);
        }
        if (start < 0 || this.length < start || this.length < end) {
          throw new RangeError("Out of range index");
        }
        if (end <= start) {
          return this;
        }
        start = start >>> 0;
        end = end === void 0 ? this.length : end >>> 0;
        if (!val) val = 0;
        let i;
        if (typeof val === "number") {
          for (i = start; i < end; ++i) {
            this[i] = val;
          }
        } else {
          const bytes = Buffer3.isBuffer(val) ? val : Buffer3.from(val, encoding);
          const len = bytes.length;
          if (len === 0) {
            throw new TypeError('The value "' + val + '" is invalid for argument "value"');
          }
          for (i = 0; i < end - start; ++i) {
            this[i + start] = bytes[i % len];
          }
        }
        return this;
      };
      var errors = {};
      function E(sym, getMessage, Base) {
        errors[sym] = class NodeError extends Base {
          constructor() {
            super();
            Object.defineProperty(this, "message", {
              value: getMessage.apply(this, arguments),
              writable: true,
              configurable: true
            });
            this.name = `${this.name} [${sym}]`;
            this.stack;
            delete this.name;
          }
          get code() {
            return sym;
          }
          set code(value) {
            Object.defineProperty(this, "code", {
              configurable: true,
              enumerable: true,
              value,
              writable: true
            });
          }
          toString() {
            return `${this.name} [${sym}]: ${this.message}`;
          }
        };
      }
      E(
        "ERR_BUFFER_OUT_OF_BOUNDS",
        function(name) {
          if (name) {
            return `${name} is outside of buffer bounds`;
          }
          return "Attempt to access memory outside buffer bounds";
        },
        RangeError
      );
      E(
        "ERR_INVALID_ARG_TYPE",
        function(name, actual) {
          return `The "${name}" argument must be of type number. Received type ${typeof actual}`;
        },
        TypeError
      );
      E(
        "ERR_OUT_OF_RANGE",
        function(str, range, input) {
          let msg = `The value of "${str}" is out of range.`;
          let received = input;
          if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
            received = addNumericalSeparator(String(input));
          } else if (typeof input === "bigint") {
            received = String(input);
            if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
              received = addNumericalSeparator(received);
            }
            received += "n";
          }
          msg += ` It must be ${range}. Received ${received}`;
          return msg;
        },
        RangeError
      );
      function addNumericalSeparator(val) {
        let res = "";
        let i = val.length;
        const start = val[0] === "-" ? 1 : 0;
        for (; i >= start + 4; i -= 3) {
          res = `_${val.slice(i - 3, i)}${res}`;
        }
        return `${val.slice(0, i)}${res}`;
      }
      function checkBounds(buf, offset, byteLength2) {
        validateNumber(offset, "offset");
        if (buf[offset] === void 0 || buf[offset + byteLength2] === void 0) {
          boundsError(offset, buf.length - (byteLength2 + 1));
        }
      }
      function checkIntBI(value, min, max, buf, offset, byteLength2) {
        if (value > max || value < min) {
          const n = typeof min === "bigint" ? "n" : "";
          let range;
          if (byteLength2 > 3) {
            if (min === 0 || min === BigInt(0)) {
              range = `>= 0${n} and < 2${n} ** ${(byteLength2 + 1) * 8}${n}`;
            } else {
              range = `>= -(2${n} ** ${(byteLength2 + 1) * 8 - 1}${n}) and < 2 ** ${(byteLength2 + 1) * 8 - 1}${n}`;
            }
          } else {
            range = `>= ${min}${n} and <= ${max}${n}`;
          }
          throw new errors.ERR_OUT_OF_RANGE("value", range, value);
        }
        checkBounds(buf, offset, byteLength2);
      }
      function validateNumber(value, name) {
        if (typeof value !== "number") {
          throw new errors.ERR_INVALID_ARG_TYPE(name, "number", value);
        }
      }
      function boundsError(value, length, type) {
        if (Math.floor(value) !== value) {
          validateNumber(value, type);
          throw new errors.ERR_OUT_OF_RANGE(type || "offset", "an integer", value);
        }
        if (length < 0) {
          throw new errors.ERR_BUFFER_OUT_OF_BOUNDS();
        }
        throw new errors.ERR_OUT_OF_RANGE(
          type || "offset",
          `>= ${type ? 1 : 0} and <= ${length}`,
          value
        );
      }
      var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
      function base64clean(str) {
        str = str.split("=")[0];
        str = str.trim().replace(INVALID_BASE64_RE, "");
        if (str.length < 2) return "";
        while (str.length % 4 !== 0) {
          str = str + "=";
        }
        return str;
      }
      function utf8ToBytes(string, units) {
        units = units || Infinity;
        let codePoint;
        const length = string.length;
        let leadSurrogate = null;
        const bytes = [];
        for (let i = 0; i < length; ++i) {
          codePoint = string.charCodeAt(i);
          if (codePoint > 55295 && codePoint < 57344) {
            if (!leadSurrogate) {
              if (codePoint > 56319) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              } else if (i + 1 === length) {
                if ((units -= 3) > -1) bytes.push(239, 191, 189);
                continue;
              }
              leadSurrogate = codePoint;
              continue;
            }
            if (codePoint < 56320) {
              if ((units -= 3) > -1) bytes.push(239, 191, 189);
              leadSurrogate = codePoint;
              continue;
            }
            codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
          } else if (leadSurrogate) {
            if ((units -= 3) > -1) bytes.push(239, 191, 189);
          }
          leadSurrogate = null;
          if (codePoint < 128) {
            if ((units -= 1) < 0) break;
            bytes.push(codePoint);
          } else if (codePoint < 2048) {
            if ((units -= 2) < 0) break;
            bytes.push(
              codePoint >> 6 | 192,
              codePoint & 63 | 128
            );
          } else if (codePoint < 65536) {
            if ((units -= 3) < 0) break;
            bytes.push(
              codePoint >> 12 | 224,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else if (codePoint < 1114112) {
            if ((units -= 4) < 0) break;
            bytes.push(
              codePoint >> 18 | 240,
              codePoint >> 12 & 63 | 128,
              codePoint >> 6 & 63 | 128,
              codePoint & 63 | 128
            );
          } else {
            throw new Error("Invalid code point");
          }
        }
        return bytes;
      }
      function asciiToBytes(str) {
        const byteArray = [];
        for (let i = 0; i < str.length; ++i) {
          byteArray.push(str.charCodeAt(i) & 255);
        }
        return byteArray;
      }
      function utf16leToBytes(str, units) {
        let c, hi, lo;
        const byteArray = [];
        for (let i = 0; i < str.length; ++i) {
          if ((units -= 2) < 0) break;
          c = str.charCodeAt(i);
          hi = c >> 8;
          lo = c % 256;
          byteArray.push(lo);
          byteArray.push(hi);
        }
        return byteArray;
      }
      function base64ToBytes(str) {
        return base64.toByteArray(base64clean(str));
      }
      function blitBuffer(src, dst, offset, length) {
        let i;
        for (i = 0; i < length; ++i) {
          if (i + offset >= dst.length || i >= src.length) break;
          dst[i + offset] = src[i];
        }
        return i;
      }
      function isInstance(obj, type) {
        return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
      }
      function numberIsNaN(obj) {
        return obj !== obj;
      }
      var hexSliceLookupTable = (function() {
        const alphabet = "0123456789abcdef";
        const table = new Array(256);
        for (let i = 0; i < 16; ++i) {
          const i16 = i * 16;
          for (let j = 0; j < 16; ++j) {
            table[i16 + j] = alphabet[i] + alphabet[j];
          }
        }
        return table;
      })();
      function defineBigIntMethod(fn) {
        return typeof BigInt === "undefined" ? BufferBigIntNotDefined : fn;
      }
      function BufferBigIntNotDefined() {
        throw new Error("BigInt not supported");
      }
    }
  });

  // protocol/src/index.ts
  var index_exports = {};
  __export(index_exports, {
    ARKIV_BLOCK_TIME: () => ARKIV_BLOCK_TIME,
    DAY_OFFSET: () => DAY_OFFSET,
    DAY_SECONDS: () => DAY_SECONDS,
    DEBOUNCE_GAP: () => DEBOUNCE_GAP,
    EPOCH: () => EPOCH,
    EXPIRY_WARN: () => EXPIRY_WARN,
    FIELD_R: () => FIELD_R,
    LEAF_BATCH_MAX: () => LEAF_BATCH_MAX,
    MAX_DEPTH: () => MAX_DEPTH,
    MAX_PASS_DAYS: () => MAX_PASS_DAYS,
    PREPROVE: () => PREPROVE,
    PUBLIC_SIGNAL_ORDER: () => PUBLIC_SIGNAL_ORDER,
    QR_BASE45_CHARS: () => QR_BASE45_CHARS,
    QR_BYTES: () => QR_BYTES,
    ROOT_HEARTBEAT: () => ROOT_HEARTBEAT,
    ROOT_INTERVAL_DEMO: () => ROOT_INTERVAL_DEMO,
    ROOT_INTERVAL_PRODUCTION: () => ROOT_INTERVAL_PRODUCTION,
    ROOT_TTL: () => ROOT_TTL,
    SECRET_BITS: () => SECRET_BITS,
    SKEW: () => SKEW,
    STALE_MAX: () => STALE_MAX,
    STALE_WARN: () => STALE_WARN,
    ZONE_CLASS: () => ZONE_CLASS,
    assertDay: () => assertDay,
    assertField: () => assertField,
    assertSecret: () => assertSecret,
    assertZoneClass: () => assertZoneClass,
    buildCircuitInput: () => buildCircuitInput,
    buildTree: () => buildTree,
    day: () => day,
    dayOfEpoch: () => dayOfEpoch,
    epochId: () => epochId,
    hash1: () => hash1,
    hash2: () => hash2,
    hash3: () => hash3,
    idCommitment: () => idCommitment,
    merkleProof: () => merkleProof,
    nullifier: () => nullifier,
    passLeaf: () => passLeaf,
    randomSecret: () => randomSecret
  });

  // protocol/src/constants.ts
  var FIELD_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  var MAX_DEPTH = 20;
  var EPOCH = 600;
  var SKEW = 120;
  var DEBOUNCE_GAP = 1;
  var PREPROVE = 12;
  var ROOT_TTL = 36 * 3600;
  var ROOT_INTERVAL_PRODUCTION = 15 * 60;
  var ROOT_INTERVAL_DEMO = 60;
  var EXPIRY_WARN = 2 * 3600;
  var STALE_WARN = 24 * 3600;
  var STALE_MAX = 48 * 3600;
  var DAY_OFFSET = 19800;
  var DAY_SECONDS = 86400;
  var QR_BYTES = 427;
  var QR_BASE45_CHARS = 641;
  var LEAF_BATCH_MAX = 2e3;
  var MAX_PASS_DAYS = 90;
  var ROOT_HEARTBEAT = 6 * 3600;
  var ARKIV_BLOCK_TIME = 2;
  var ZONE_CLASS = { SECOND: 0, FIRST: 1, AC: 2 };
  var SECRET_BITS = 248;

  // protocol/src/time.ts
  function assertUnixSeconds(t) {
    if (!Number.isSafeInteger(t) || t < 0) throw new RangeError(`expected unix seconds, got ${t}`);
  }
  function day(unixSeconds) {
    assertUnixSeconds(unixSeconds);
    return Math.floor((unixSeconds + DAY_OFFSET) / DAY_SECONDS);
  }
  function epochId(unixSeconds) {
    assertUnixSeconds(unixSeconds);
    return Math.floor(unixSeconds / EPOCH);
  }
  function dayOfEpoch(epoch) {
    if (!Number.isSafeInteger(epoch) || epoch < 0) throw new RangeError(`expected epochId, got ${epoch}`);
    return day(epoch * EPOCH);
  }

  // protocol/src/hash.ts
  var import_poseidon1 = __toESM(require_poseidon1(), 1);
  var import_poseidon2 = __toESM(require_poseidon2(), 1);
  var import_poseidon3 = __toESM(require_poseidon3(), 1);
  function assertField(x, name = "value") {
    if (typeof x !== "bigint" || x < 0n || x >= FIELD_R) throw new RangeError(`${name} is not a field element < r`);
    return x;
  }
  function assertZoneClass(z) {
    if (z !== 0 && z !== 1 && z !== 2) throw new RangeError("zoneClass must be 0, 1 or 2");
    return z;
  }
  function assertDay(d, name) {
    if (!Number.isInteger(d) || d < 0 || d > 65535) throw new RangeError(`${name} must be a uint16`);
    return d;
  }
  function assertSecret(secret) {
    if (typeof secret !== "bigint" || secret <= 0n || secret >= 1n << BigInt(SECRET_BITS))
      throw new RangeError(`secret must be a nonzero ${SECRET_BITS}-bit integer`);
    return secret;
  }
  var hash1 = (a) => (0, import_poseidon1.poseidon1)([assertField(a)]);
  var hash2 = (a, b) => (0, import_poseidon2.poseidon2)([assertField(a), assertField(b)]);
  var hash3 = (a, b, c) => (0, import_poseidon3.poseidon3)([assertField(a), assertField(b), assertField(c)]);
  function idCommitment(secret) {
    return hash1(assertSecret(secret));
  }
  function passLeaf(idCommit, validUntilDay, zoneClass) {
    return hash3(idCommit, BigInt(assertDay(validUntilDay, "validUntilDay")), BigInt(assertZoneClass(zoneClass)));
  }
  function nullifier(secret, epoch) {
    if (!Number.isSafeInteger(epoch) || epoch < 0 || epoch > 4294967295) throw new RangeError("epochId must be a uint32");
    return hash2(assertSecret(secret), BigInt(epoch));
  }
  function randomSecret() {
    const bytes = new Uint8Array(SECRET_BITS / 8);
    for (; ; ) {
      globalThis.crypto.getRandomValues(bytes);
      let x = 0n;
      for (const b of bytes) x = x << 8n | BigInt(b);
      if (x !== 0n) return x;
    }
  }

  // protocol/node_modules/@zk-kit/utils/dist/lib.esm/type-checks.js
  var import_buffer = __toESM(require_buffer(), 1);
  function isDefined(value) {
    return typeof value !== "undefined";
  }
  function isNumber(value) {
    return typeof value === "number";
  }
  function isString(value) {
    return typeof value === "string";
  }
  function isFunction(value) {
    return typeof value === "function";
  }
  function isObject(value) {
    return typeof value === "object";
  }
  function isArray(value) {
    return isObject(value) && Array.isArray(value);
  }

  // protocol/node_modules/@zk-kit/utils/dist/lib.esm/error-handlers.js
  function requireDefined(parameterValue, parameterName) {
    if (!isDefined(parameterValue)) {
      throw new TypeError(`Parameter '${parameterName}' is not defined`);
    }
  }
  function requireNumber(parameterValue, parameterName) {
    if (!isNumber(parameterValue)) {
      throw new TypeError(`Parameter '${parameterName}' is not a number, received type: ${typeof parameterValue}`);
    }
  }
  function requireString(parameterValue, parameterName) {
    if (!isString(parameterValue)) {
      throw new TypeError(`Parameter '${parameterName}' is not a string, received type: ${typeof parameterValue}`);
    }
  }
  function requireFunction(parameterValue, parameterName) {
    if (!isFunction(parameterValue)) {
      throw new TypeError(`Parameter '${parameterName}' is not a function, received type: ${typeof parameterValue}`);
    }
  }
  function requireArray(parameterValue, parameterName) {
    if (!isArray(parameterValue)) {
      throw new TypeError(`Parameter '${parameterName}' is not an Array instance`);
    }
  }

  // protocol/node_modules/@zk-kit/lean-imt/dist/index.js
  var LeanIMT = class _LeanIMT {
    /**
     * It initializes the tree with a given hash function and an optional list of leaves.
     * @param hash The hash function used to create nodes.
     * @param leaves The list of leaves.
     */
    constructor(hash, leaves = []) {
      requireDefined(hash, "hash");
      requireFunction(hash, "hash");
      requireArray(leaves, "leaves");
      this._nodes = [[]];
      this._hash = hash;
      if (leaves.length > 0) {
        this.insertMany(leaves);
      }
    }
    /**
     * The root of the tree. This value doesn't need to be stored as
     * it is always the first and unique element of the last level of the tree.
     * Its value can be retrieved in `_nodes`.
     * @returns The root hash of the tree.
     */
    get root() {
      return this._nodes[this.depth][0];
    }
    /**
     * The depth of the tree, which equals the number of levels - 1.
     * @returns The depth of the tree.
     */
    get depth() {
      return this._nodes.length - 1;
    }
    /**
     * The leaves of the tree. They can be retrieved from the first
     * level of the tree using `_nodes`. The returned
     * value is a copy of the array and not the original object.
     * @returns The list of tree leaves.
     */
    get leaves() {
      return this._nodes[0].slice();
    }
    /**
     * The size of the tree, which the number of its leaves.
     * It's the length of the first level's list.
     * @returns The number of leaves of the tree.
     */
    get size() {
      return this._nodes[0].length;
    }
    /**
     * It returns the index of a leaf. If the leaf does not exist it returns -1.
     * @param leaf A leaf of the tree.
     * @returns The index of the leaf.
     */
    indexOf(leaf) {
      requireDefined(leaf, "leaf");
      return this._nodes[0].indexOf(leaf);
    }
    /**
     * It returns true if the leaf exists, and false otherwise
     * @param leaf A leaf of the tree.
     * @returns True if the tree has the leaf, and false otherwise.
     */
    has(leaf) {
      requireDefined(leaf, "leaf");
      return this._nodes[0].includes(leaf);
    }
    /**
     * The leaves are inserted incrementally. If 'i' is the index of the last
     * leaf, the new one will be inserted at position 'i + 1'. Every time a
     * new leaf is inserted, the nodes that separate the new leaf from the root
     * of the tree are created or updated if they already exist, from bottom to top.
     * When a node has only one child (the left one), its value takes on the value
     * of the child. Otherwise, the hash of the children is calculated.
     * @param leaf The new leaf to be inserted in the tree.
     */
    insert(leaf) {
      requireDefined(leaf, "leaf");
      if (this.depth < Math.ceil(Math.log2(this.size + 1))) {
        this._nodes.push([]);
      }
      let node = leaf;
      let index = this.size;
      for (let level = 0; level < this.depth; level += 1) {
        this._nodes[level][index] = node;
        if (index & 1) {
          const sibling = this._nodes[level][index - 1];
          node = this._hash(sibling, node);
        }
        index >>= 1;
      }
      this._nodes[this.depth] = [node];
    }
    /**
     * This function is useful when you want to insert N leaves all at once.
     * It is more efficient than using the {@link LeanIMT#insert} method N times because it
     * significantly reduces the number of cases where a node has only one
     * child, which is a common occurrence in gradual insertion.
     * @param leaves The list of leaves to be inserted.
     */
    insertMany(leaves) {
      requireDefined(leaves, "leaves");
      requireArray(leaves, "leaves");
      if (leaves.length === 0) {
        throw new Error("There are no leaves to add");
      }
      let startIndex = this.size >> 1;
      this._nodes[0] = this._nodes[0].concat(leaves);
      const numberOfNewLevels = Math.ceil(Math.log2(this.size)) - this.depth;
      for (let i = 0; i < numberOfNewLevels; i += 1) {
        this._nodes.push([]);
      }
      for (let level = 0; level < this.depth; level += 1) {
        const numberOfNodes = Math.ceil(this._nodes[level].length / 2);
        for (let index = startIndex; index < numberOfNodes; index += 1) {
          const rightNode = this._nodes[level][index * 2 + 1];
          const leftNode = this._nodes[level][index * 2];
          const parentNode = rightNode !== void 0 ? this._hash(leftNode, rightNode) : leftNode;
          this._nodes[level + 1][index] = parentNode;
        }
        startIndex >>= 1;
      }
    }
    /**
     * It updates a leaf in the tree. It's very similar to the {@link LeanIMT#insert} function.
     * @param index The index of the leaf to be updated.
     * @param newLeaf The new leaf to be inserted.
     */
    update(index, newLeaf) {
      requireDefined(index, "index");
      requireDefined(newLeaf, "newLeaf");
      requireNumber(index, "index");
      let node = newLeaf;
      for (let level = 0; level < this.depth; level += 1) {
        this._nodes[level][index] = node;
        if (index & 1) {
          const sibling = this._nodes[level][index - 1];
          node = this._hash(sibling, node);
        } else {
          const sibling = this._nodes[level][index + 1];
          if (sibling !== void 0) {
            node = this._hash(node, sibling);
          }
        }
        index >>= 1;
      }
      this._nodes[this.depth] = [node];
    }
    /**
     * Updates m leaves all at once.
     * It is more efficient than using the {@link LeanIMT#update} method m times because it
     * prevents updating middle nodes several times. This would happen when updating leaves
     * with common ancestors. The naive approach of calling 'update' m times has complexity
     * O(m*log(n)) (where n is the number of leaves of the tree), which ends up in
     * O(n*log(n)) when m ~ n. With this new approach, this ends up being O(n) because every
     * node is updated at most once and there are around 2*n nodes in the tree.
     * @param indices The list of indices of the respective leaves.
     * @param leaves The list of leaves to be updated.
     */
    updateMany(indices, leaves) {
      requireDefined(leaves, "leaves");
      requireDefined(indices, "indices");
      requireArray(leaves, "leaves");
      requireArray(indices, "indices");
      if (leaves.length !== indices.length) {
        throw new Error("There is no correspondence between indices and leaves");
      }
      let modifiedIndices = /* @__PURE__ */ new Set();
      for (let i = 0; i < indices.length; i += 1) {
        requireNumber(indices[i], `index ${i}`);
        if (indices[i] < 0 || indices[i] >= this.size) {
          throw new Error(`Index ${i} is out of range`);
        }
        if (modifiedIndices.has(indices[i])) {
          throw new Error(`Leaf ${indices[i]} is repeated`);
        }
        modifiedIndices.add(indices[i]);
      }
      modifiedIndices.clear();
      for (let leaf = 0; leaf < indices.length; leaf += 1) {
        this._nodes[0][indices[leaf]] = leaves[leaf];
        modifiedIndices.add(indices[leaf] >> 1);
      }
      for (let level = 1; level <= this.depth; level += 1) {
        const newModifiedIndices = [];
        for (const index of modifiedIndices) {
          const leftChild = this._nodes[level - 1][2 * index];
          const rightChild = this._nodes[level - 1][2 * index + 1];
          this._nodes[level][index] = rightChild !== void 0 ? this._hash(leftChild, rightChild) : leftChild;
          newModifiedIndices.push(index >> 1);
        }
        modifiedIndices = new Set(newModifiedIndices);
      }
    }
    /**
     * It generates a {@link LeanIMTMerkleProof} for a leaf of the tree.
     * That proof can be verified by this tree using the same hash function.
     * @param index The index of the leaf for which a Merkle proof will be generated.
     * @returns The Merkle proof of the leaf.
     */
    generateProof(index) {
      requireDefined(index, "index");
      requireNumber(index, "index");
      if (index < 0 || index >= this.size) {
        throw new Error(`The leaf at index '${index}' does not exist in this tree`);
      }
      const leaf = this.leaves[index];
      const siblings = [];
      const path = [];
      for (let level = 0; level < this.depth; level += 1) {
        const isRightNode = index & 1;
        const siblingIndex = isRightNode ? index - 1 : index + 1;
        const sibling = this._nodes[level][siblingIndex];
        if (sibling !== void 0) {
          path.push(isRightNode);
          siblings.push(sibling);
        }
        index >>= 1;
      }
      return {
        root: this.root,
        leaf,
        index: path.length === 0 ? 0 : Number.parseInt(path.reverse().join(""), 2),
        siblings
      };
    }
    /**
     * It verifies a {@link LeanIMTMerkleProof} to confirm that a leaf indeed
     * belongs to a tree.  Does not verify that the node belongs to this
     * tree in particular.  Equivalent to
     * `LeanIMT.verifyProof(proof, this._hash)`.
     * @param proof The Merkle tree proof.
     * @returns True if the leaf is part of the tree, and false otherwise.
     */
    verifyProof(proof) {
      return _LeanIMT.verifyProof(proof, this._hash);
    }
    /**
     * It verifies a {@link LeanIMTMerkleProof} to confirm that a leaf indeed
     * belongs to a tree.
     * @param proof The Merkle tree proof.
     * @returns True if the leaf is part of the tree, and false otherwise.
     */
    static verifyProof(proof, hash) {
      requireDefined(proof, "proof");
      const { root, leaf, siblings, index } = proof;
      requireDefined(proof.root, "proof.root");
      requireDefined(proof.leaf, "proof.leaf");
      requireDefined(proof.siblings, "proof.siblings");
      requireDefined(proof.index, "proof.index");
      requireArray(proof.siblings, "proof.siblings");
      requireNumber(proof.index, "proof.index");
      let node = leaf;
      for (let i = 0; i < siblings.length; i += 1) {
        if (index >> i & 1) {
          node = hash(siblings[i], node);
        } else {
          node = hash(node, siblings[i]);
        }
      }
      return root === node;
    }
    /**
     * It enables the conversion of the full tree structure into a JSON string,
     * facilitating future imports of the tree. This approach is beneficial for
     * large trees, as it saves time by storing hashes instead of recomputing them
     * @returns The stringified JSON of the tree.
     */
    export() {
      return JSON.stringify(this._nodes, (_, v) => typeof v === "bigint" ? v.toString() : v);
    }
    /**
     * It imports an entire tree by initializing the nodes without calculating
     * any hashes. Note that it is crucial to ensure the integrity of the tree
     * before or after importing it. If the map function is not defined, node
     * values will be converted to bigints by default.
     * @param hash The hash function used to create nodes.
     * @param nodes The stringified JSON of the tree.
     * @param map A function to map each node of the tree and convert their types.
     * @returns A LeanIMT instance.
     */
    static import(hash, nodes, map) {
      requireDefined(hash, "hash");
      requireDefined(nodes, "nodes");
      requireFunction(hash, "hash");
      requireString(nodes, "nodes");
      if (map) {
        requireDefined(map, "map");
        requireFunction(map, "map");
      }
      const tree = new _LeanIMT(hash);
      tree._nodes = JSON.parse(nodes, (_, value) => {
        if (typeof value === "string") {
          return map ? map(value) : BigInt(value);
        }
        return value;
      });
      return tree;
    }
  };

  // protocol/src/tree.ts
  function buildTree(leaves) {
    if (leaves.length > 2 ** MAX_DEPTH) throw new RangeError(`tree holds at most 2^${MAX_DEPTH} leaves`);
    leaves.forEach((l, i) => assertField(l, `leaf ${i}`));
    return new LeanIMT(hash2, [...leaves]);
  }
  function merkleProof(tree, leafIndex) {
    const p = tree.generateProof(leafIndex);
    const depth = p.siblings.length;
    if (depth > MAX_DEPTH) throw new RangeError(`proof depth ${depth} exceeds MAX_DEPTH`);
    if (p.index < 0 || p.index >= 2 ** MAX_DEPTH) throw new RangeError("path index out of range");
    const siblings = [...p.siblings, ...Array(MAX_DEPTH - depth).fill(0n)];
    return { root: p.root, leaf: p.leaf, depth, pathIndex: p.index, siblings };
  }

  // protocol/src/circuit-input.ts
  var PUBLIC_SIGNAL_ORDER = ["root", "nullifier", "epochId", "currentDay", "zoneClass"];
  function buildCircuitInput(args) {
    const { secret, validUntilDay, zoneClass, proof, epochId: epochId2 } = args;
    assertSecret(secret);
    assertDay(validUntilDay, "validUntilDay");
    assertZoneClass(zoneClass);
    return {
      root: proof.root.toString(),
      nullifier: nullifier(secret, epochId2).toString(),
      epochId: epochId2.toString(),
      currentDay: dayOfEpoch(epochId2).toString(),
      zoneClass: zoneClass.toString(),
      secret: secret.toString(),
      validUntilDay: validUntilDay.toString(),
      depth: proof.depth.toString(),
      pathIndex: proof.pathIndex.toString(),
      siblings: proof.siblings.map((s) => s.toString())
    };
  }
  return __toCommonJS(index_exports);
})();
/*! Bundled license information:

ieee754/index.js:
  (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)

buffer/index.js:
  (*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)

@zk-kit/utils/dist/lib.esm/type-checks.js:
@zk-kit/utils/dist/lib.esm/error-handlers.js:
  (**
   * @module @zk-kit/utils
   * @version 1.4.1
   * @file Essential zero-knowledge utility library for JavaScript developers.
   * @copyright Ethereum Foundation 2025
   * @license MIT
   * @see [Github]{@link https://github.com/privacy-scaling-explorations/zk-kit/tree/main/packages/utils}
  *)

@zk-kit/lean-imt/dist/index.js:
  (**
   * @module @zk-kit/lean-imt
   * @version 2.2.5
   * @file Lean Incremental Merkle tree implementation in TypeScript.
   * @copyright Ethereum Foundation 2026
   * @license MIT
   * @see [Github]{@link https://github.com/zk-kit/zk-kit/tree/main/packages/lean-imt}
  *)
*/
