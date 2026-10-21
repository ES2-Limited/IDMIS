import { z } from 'zod';

export const AuthMeResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  phone: z.string().nullable().optional(),
  mustChangePassword: z.boolean(),
  isSystemAdmin: z.boolean(),
  totpEnabled: z.boolean(),
  roles: z.array(z.string()),
  createdAt: z.string(),
});

export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;
