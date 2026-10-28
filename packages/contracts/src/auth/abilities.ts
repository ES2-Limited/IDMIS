import { z } from 'zod';

export const RequestScopeSchema = z.object({
  isNational: z.boolean(),
  stateIds: z.array(z.string().uuid()),
  rbdaIds: z.array(z.string().uuid()),
  schemeIds: z.array(z.string().uuid()),
  sectorIds: z.array(z.string().uuid()),
});

export type RequestScope = z.infer<typeof RequestScopeSchema>;

export const CaslRuleSchema = z.object({
  action: z.string(),
  subject: z.string(),
  fields: z.array(z.string()).optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  inverted: z.boolean().optional(),
  reason: z.string().optional(),
});

export type CaslRule = z.infer<typeof CaslRuleSchema>;

export const UserAbilitiesResponseSchema = z.object({
  permissions: z.array(z.string()),
  scopes: z.record(z.string(), RequestScopeSchema),
  rules: z.array(CaslRuleSchema),
});

export type UserAbilitiesResponse = z.infer<typeof UserAbilitiesResponseSchema>;
