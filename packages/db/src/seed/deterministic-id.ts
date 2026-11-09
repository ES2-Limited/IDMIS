import crypto from 'node:crypto';

/**
 * Well-known UUID namespace for IDMIS reference data entities (RFC 4122 UUID v5).
 * Generates deterministic UUIDs from entity type and code across all environments.
 */
export const IDMIS_REFERENCE_NAMESPACE = '018f3a5e-0000-7000-8000-000000000099';

export function generateDeterministicId(
  type: string,
  code: string,
  namespace: string = IDMIS_REFERENCE_NAMESPACE,
): string {
  const nsBuffer = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = crypto.createHash('sha1');
  hash.update(nsBuffer);
  hash.update(Buffer.from(`${type}:${code.trim().toUpperCase()}`, 'utf8'));
  const buf = hash.digest();

  // Set version to 5 (0101)
  buf[6] = (buf[6]! & 0x0f) | 0x50;
  // Set variant to RFC 4122 (10xx)
  buf[8] = (buf[8]! & 0x3f) | 0x80;

  return [
    buf.subarray(0, 4).toString('hex'),
    buf.subarray(4, 6).toString('hex'),
    buf.subarray(6, 8).toString('hex'),
    buf.subarray(8, 10).toString('hex'),
    buf.subarray(10, 16).toString('hex'),
  ].join('-');
}
