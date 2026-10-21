import { z } from 'zod';

export const RequestScopeSchema = z.object({
  isNational: z.boolean(),
  stateIds: z.array(z.string().uuid()),
  schemeIds: z.array(z.string().uuid()),
  sectorIds: z.array(z.string().uuid()),
});

export type RequestScope = z.infer<typeof RequestScopeSchema>;

export const RequestUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  roles: z.array(z.string()).default([]),
  isSystemAdmin: z.boolean().default(false),
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
