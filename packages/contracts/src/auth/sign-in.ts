import { z } from 'zod';
import { AuthMeResponseSchema } from './me';

export const SignInInputSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  installationId: z.string().uuid().optional(),
  deviceLabel: z.string().max(100).optional(),
  platform: z.string().max(50).optional(),
});

export type SignInInput = z.infer<typeof SignInInputSchema>;

export const AuthenticatedResponseSchema = z.object({
  status: z.literal('authenticated'),
  accessToken: z.string(),
  expiresIn: z.number().int(),
  user: AuthMeResponseSchema,
});

export type AuthenticatedResponse = z.infer<typeof AuthenticatedResponseSchema>;

export const TotpRequiredResponseSchema = z.object({
  status: z.literal('totp_required'),
  tempToken: z.string(),
});

export type TotpRequiredResponse = z.infer<typeof TotpRequiredResponseSchema>;

export const TotpSetupRequiredResponseSchema = z.object({
  status: z.literal('totp_setup_required'),
  tempToken: z.string(),
});

export type TotpSetupRequiredResponse = z.infer<typeof TotpSetupRequiredResponseSchema>;

export const PasswordChangeRequiredResponseSchema = z.object({
  status: z.literal('password_change_required'),
  tempToken: z.string(),
});

export type PasswordChangeRequiredResponse = z.infer<typeof PasswordChangeRequiredResponseSchema>;

/**
 * Discriminated union on `status`.
 * When status is not 'authenticated', tempToken is valid for 5 minutes for that single next step only.
 */
export const SignInResponseSchema = z.discriminatedUnion('status', [
  AuthenticatedResponseSchema,
  TotpRequiredResponseSchema,
  TotpSetupRequiredResponseSchema,
  PasswordChangeRequiredResponseSchema,
]);

export type SignInResponse = z.infer<typeof SignInResponseSchema>;

export const TotpSetupInputSchema = z.object({
  tempToken: z.string().min(1, 'Temporary token is required'),
});

export type TotpSetupInput = z.infer<typeof TotpSetupInputSchema>;

export const TotpSetupResponseSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
  recoveryCodes: z.array(z.string()).length(10, 'Must provide exactly 10 recovery codes'),
});

export type TotpSetupResponse = z.infer<typeof TotpSetupResponseSchema>;

export const TotpVerifyInputSchema = z
  .object({
    tempToken: z.string().min(1, 'Temporary token is required'),
    totpCode: z
      .string()
      .length(6, 'TOTP code must be 6 digits')
      .regex(/^\d{6}$/, 'TOTP code must be numeric')
      .optional(),
    recoveryCode: z.string().min(8, 'Recovery code must be at least 8 characters').optional(),
  })
  .refine((data) => (data.totpCode !== undefined) !== (data.recoveryCode !== undefined), {
    message: 'Must provide exactly one of totpCode or recoveryCode',
    path: ['totpCode'],
  });

export type TotpVerifyInput = z.infer<typeof TotpVerifyInputSchema>;
