import { z } from 'zod';
import { RequestScopeSchema, type RequestScope } from '@idmis/contracts';

export { RequestScopeSchema, type RequestScope };

export const RequestUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  roles: z.array(z.string()).default([]),
  isSystemAdmin: z.boolean().default(false), // UI-informational only! Never used for access decisions.
  mustChangePassword: z.boolean().default(false),
  scope: RequestScopeSchema,
  permissions: z.array(z.string()),
});

export type RequestUser = z.infer<typeof RequestUserSchema>;

export const RequestContextSchema = z.object({
  requestId: z.string(),
  user: RequestUserSchema.optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

export type RequestContext = z.infer<typeof RequestContextSchema>;
