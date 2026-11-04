/**
 * UUIDv7 implementation conforming to RFC 9562.
 * Generates time-sortable, monotonically ordered 128-bit UUIDs.
 * Format: 48-bit timestamp (ms) | 4-bit version (0111) | 12-bit counter/rand | 2-bit variant (10) | 62-bit rand
 */

let lastMs = 0;
let seq = 0;

export function generateUuidV7(): string {
  let now = Date.now();

  if (now <= lastMs) {
    // If within the same millisecond or clock stepped back, increment sequence counter
    seq++;
    now = lastMs;
  } else {
    lastMs = now;
    seq = Math.floor(Math.random() * 0x1000);
  }

  // 48-bit millisecond timestamp
  const timeHex = now.toString(16).padStart(12, '0');

  // 12-bit sequence / random (version 7 marker at highest 4 bits: 0x7000 | (seq & 0x0fff))
  const verAndSeq = (0x7000 | (seq & 0x0fff)).toString(16).padStart(4, '0');

  // Variant (10xx) and 62-bit random bytes
  const randBytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randBytes);
  } else {
    for (let i = 0; i < 8; i++) {
      randBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Set RFC 4122/9562 variant: 10xxxxxx
  randBytes[0] = (randBytes[0] & 0x3f) | 0x80;

  const randHex = Array.from(randBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Format as 8-4-4-4-12
  return `${timeHex.slice(0, 8)}-${timeHex.slice(8, 12)}-${verAndSeq}-${randHex.slice(0, 4)}-${randHex.slice(4, 16)}`;
}
