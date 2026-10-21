import { z } from 'zod';

/**
 * Input for changing password.
 * Accepts either:
 * - standard Bearer Authorization access token (authenticated session), OR
 * - password_change tempToken (during initial sign-in forced password change).
 *
 * Service side enforces additional checks against a common-password blocklist.
 */
export const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(10, 'New password must be at least 10 characters long')
    .max(128, 'Password cannot exceed 128 characters'),
  tempToken: z.string().optional(),
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

export const ChangePasswordResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type ChangePasswordResponse = z.infer<typeof ChangePasswordResponseSchema>;
