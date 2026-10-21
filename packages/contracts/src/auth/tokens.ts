import { z } from 'zod';

/**
 * Access token JWT payload.
 * Intentionally minimal: contains only user identity (sub) and session ID (sid).
 * Extra claims are strictly rejected; user details and scopes are loaded in RequestContext.
 */
export const AccessTokenPayloadSchema = z
  .object({
    sub: z.string().uuid(),
    sid: z.string().uuid(),
    iat: z.number().int().optional(),
    exp: z.number().int().optional(),
  })
  .strict();

export type AccessTokenPayload = z.infer<typeof AccessTokenPayloadSchema>;
