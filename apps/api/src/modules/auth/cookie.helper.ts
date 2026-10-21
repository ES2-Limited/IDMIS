import type { FastifyReply } from 'fastify';

export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

export function setRefreshTokenCookie(
  reply: FastifyReply,
  token: string,
  maxAgeSeconds = REFRESH_TOKEN_MAX_AGE_SECONDS,
): void {
  const isProd = process.env.NODE_ENV === 'production';
  const cookie = `${REFRESH_TOKEN_COOKIE_NAME}=${encodeURIComponent(
    token,
  )}; Path=/auth; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}; Max-Age=${maxAgeSeconds}`;
  reply.header('Set-Cookie', cookie);
}

export function clearRefreshTokenCookie(reply: FastifyReply): void {
  reply.header(
    'Set-Cookie',
    `${REFRESH_TOKEN_COOKIE_NAME}=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  );
}
