import { z } from 'zod';
import { AuthMeResponseSchema } from './me';

/**
 * Refresh and sign-out endpoints take no tokens in the body.
 * The refresh token is transmitted solely via a secure httpOnly cookie.
 */
export const RefreshTokenInputSchema = z.object({}).strict();

export type RefreshTokenInput = z.infer<typeof RefreshTokenInputSchema>;

export const RefreshTokenResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  user: AuthMeResponseSchema,
});

export type RefreshTokenResponse = z.infer<typeof RefreshTokenResponseSchema>;

export const SignOutResponseSchema = z.object({
  success: z.boolean(),
});

export type SignOutResponse = z.infer<typeof SignOutResponseSchema>;
