/**
 * Blocklist of commonly used, easily guessable passwords.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  'password1234',
  'admin123',
  '1234567890',
  '12345678',
  '123456789',
  'qwertyuiop',
  'letmein123',
  'idmis12345',
  'changeme123',
  'welcome123',
  'systemadmin',
  'passcode123',
  'nigeria1234',
  'triming1234',
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase().trim());
}
