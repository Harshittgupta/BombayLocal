/**
 * Base45 (RFC 9285). Every 2 bytes become 3 characters (low digit first), a trailing single byte becomes 2. The
 * alphabet is exactly the QR alphanumeric set, so the QR can use alphanumeric mode (SPEC §3.4: 427 B → 641 chars).
 */
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]));

export function base45Encode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const n = bytes[i]! * 256 + bytes[i + 1]!;
    out += ALPHABET[n % 45]! + ALPHABET[Math.floor(n / 45) % 45]! + ALPHABET[Math.floor(n / 2025)]!;
  }
  if (bytes.length % 2 === 1) {
    const n = bytes[bytes.length - 1]!;
    out += ALPHABET[n % 45]! + ALPHABET[Math.floor(n / 45)]!;
  }
  return out;
}

export function base45Decode(s: string): Uint8Array {
  if (s.length % 3 === 1) throw new Error("base45: bad length");
  const digit = (c: string): number => {
    const v = INDEX.get(c);
    if (v === undefined) throw new Error("base45: bad character");
    return v;
  };
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 3) {
    if (i + 2 < s.length) {
      const n = digit(s[i]!) + digit(s[i + 1]!) * 45 + digit(s[i + 2]!) * 2025;
      if (n > 0xffff) throw new Error("base45: group out of range");
      out.push(n >> 8, n & 0xff);
    } else {
      const n = digit(s[i]!) + digit(s[i + 1]!) * 45;
      if (n > 0xff) throw new Error("base45: byte out of range");
      out.push(n);
    }
  }
  return Uint8Array.from(out);
}
