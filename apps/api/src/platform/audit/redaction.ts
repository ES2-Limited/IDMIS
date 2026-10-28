/**
 * Detects if a column or field name matches sensitive patterns:
 * - Name parts / suffixes: `_hash$`, `_enc$`
 * - Words: `secret`, `token`, `password`, `hash`, `enc` as whole word parts (e.g. `totpSecretEnc`, `password_hash`)
 * Does NOT match arbitrary substrings (e.g. `fence`, `agency`, `science` do not match).
 */
export function isSensitiveFieldName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;

  // 1. Check suffixes
  if (/(?:_hash|_enc)$/i.test(name)) {
    return true;
  }

  // 2. Break camelCase and snake_case into individual word tokens
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split('_');

  return words.some(
    (word) =>
      word === 'secret' ||
      word === 'token' ||
      word === 'password' ||
      word === 'hash' ||
      word === 'enc',
  );
}

export const SENSITIVE_DENY_LIST = new Set([
  'password',
  'password_hash',
  'passwordHash',
  'totp_secret_enc',
  'totpSecretEnc',
  'refresh_token_hash',
  'refreshTokenHash',
  'code_hash',
  'codeHash',
  'temporary_password',
  'temporaryPassword',
  'temp_token',
  'tempToken',
  'token',
  'secret',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'bank_account_enc',
  'bankAccountEnc',
]);

/**
 * Deep-traverses any data structure and replaces values of sensitive keys with '[REDACTED]'.
 */
export function redactSensitiveFields(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_DENY_LIST.has(k) || isSensitiveFieldName(k)) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = redactSensitiveFields(v);
      }
    }
    return result;
  }

  return value;
}
