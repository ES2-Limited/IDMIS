import { z } from 'zod';

export const AdminResetPasswordInputSchema = z.object({
  userId: z.string().uuid(),
});

export type AdminResetPasswordInput = z.infer<typeof AdminResetPasswordInputSchema>;

/**
 * Admin-triggered password reset response.
 *
 * Security considerations:
 * - temporaryPassword: A high-entropy cryptographically random string returned once to the admin.
 * - single-use: Valid only until used once to establish a session.
 * - forces change: Immediately sets must_change_password = true on the user.
 * - audited: Every admin-triggered password reset is recorded in the audit log.
 */
export const AdminResetPasswordResponseSchema = z.object({
  userId: z.string().uuid(),
  temporaryPassword: z.string(),
  mustChangePassword: z.literal(true),
});

export type AdminResetPasswordResponse = z.infer<typeof AdminResetPasswordResponseSchema>;
