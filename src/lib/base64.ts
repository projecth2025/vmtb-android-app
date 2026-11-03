/**
 * Base64 → bytes without `atob`: Hermes has none, and the only polyfill in
 * the tree ships as a Jitsi SDK side-effect, which must not be load-bearing
 * for PDF validation.
 */
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function decodeBase64(value: string) {
  const clean = value.replace(/[^A-Za-z0-9+/]/g, '');
  const output = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let offset = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = BASE64_ALPHABET.indexOf(clean[i]);
    const c2 = BASE64_ALPHABET.indexOf(clean[i + 1]);
    const c3 = BASE64_ALPHABET.indexOf(clean[i + 2]);
    const c4 = BASE64_ALPHABET.indexOf(clean[i + 3]);
    if (c1 < 0 || c2 < 0) break;
    output[offset++] = (c1 << 2) | (c2 >> 4);
    if (c3 >= 0) output[offset++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (c4 >= 0) output[offset++] = ((c3 & 3) << 6) | c4;
  }
  return output.subarray(0, offset);
}
