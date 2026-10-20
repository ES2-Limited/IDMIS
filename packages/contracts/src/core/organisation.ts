import { z } from 'zod';
import { BaseListQuerySchema, StandardResponseColumnsSchema } from './common';
import { OrgTypeSchema } from './enums';

export const CreateOrganisationInputSchema = z.object({
  id: z.uuid({ version: 'v7' }).optional(),
  type: OrgTypeSchema,
  parentId: z.uuid().nullable().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1),
  shortName: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  geom: z.unknown().nullable().optional(),
  isActive: z.boolean().default(true),
  stateIds: z.array(z.uuid()).default([]),
});
export type CreateOrganisationInput = z.infer<typeof CreateOrganisationInputSchema>;

export const UpdateOrganisationInputSchema = CreateOrganisationInputSchema.omit({
  id: true,
}).partial();
export type UpdateOrganisationInput = z.infer<typeof UpdateOrganisationInputSchema>;

export const OrganisationResponseSchema = StandardResponseColumnsSchema.extend({
  type: OrgTypeSchema,
  parentId: z.uuid().nullable(),
  code: z.string(),
  name: z.string(),
  shortName: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  geom: z.unknown().nullable().optional(),
  isActive: z.boolean(),
  stateIds: z.array(z.uuid()),
});
export type OrganisationResponse = z.infer<typeof OrganisationResponseSchema>;

export const ListOrganisationsQuerySchema = BaseListQuerySchema.extend({
  type: OrgTypeSchema.optional(),
  parentId: z.uuid().optional(),
  stateId: z.uuid().optional(),
  isActive: z.coerce.boolean().optional(),
});
export type ListOrganisationsQuery = z.infer<typeof ListOrganisationsQuerySchema>;

export const SetOrganisationStatesInputSchema = z.object({
  organisationId: z.uuid(),
  stateIds: z.array(z.uuid()),
});
export type SetOrganisationStatesInput = z.infer<typeof SetOrganisationStatesInputSchema>;
