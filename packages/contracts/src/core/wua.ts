import { z } from 'zod';
import { BaseListQuerySchema, StandardResponseColumnsSchema } from './common';
import { WuaLevelSchema, WuaOfficeSchema } from './enums';

// --- WUA ---
export const CreateWuaInputSchema = z.object({
  id: z.uuid({ version: 'v7' }).optional(),
  level: WuaLevelSchema,
  parentId: z.uuid().nullable().optional(),
  organisationId: z.uuid(),
  wardId: z.uuid().nullable().optional(),
  regNo: z.string().nullable().optional(),
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  bankAccountNumber: z.string().min(10).max(20).nullable().optional(),
  isOperational: z.boolean().default(false),
  hasMaintenanceFund: z.boolean().default(false),
});
export type CreateWuaInput = z.infer<typeof CreateWuaInputSchema>;

export const UpdateWuaInputSchema = CreateWuaInputSchema.omit({ id: true }).partial();
export type UpdateWuaInput = z.infer<typeof UpdateWuaInputSchema>;

export const WuaResponseSchema = StandardResponseColumnsSchema.extend({
  level: WuaLevelSchema,
  parentId: z.uuid().nullable(),
  organisationId: z.uuid(),
  wardId: z.uuid().nullable(),
  regNo: z.string().nullable(),
  name: z.string(),
  address: z.string().nullable(),
  bankName: z.string().nullable(),
  bankAccountLast4: z.string().nullable(),
  isOperational: z.boolean(),
  hasMaintenanceFund: z.boolean(),
  importBatchId: z.uuid().nullable().optional(),
});
export type WuaResponse = z.infer<typeof WuaResponseSchema>;

export const ListWuasQuerySchema = BaseListQuerySchema.extend({
  level: WuaLevelSchema.optional(),
  organisationId: z.uuid().optional(),
  isOperational: z.coerce.boolean().optional(),
});
export type ListWuasQuery = z.infer<typeof ListWuasQuerySchema>;

// --- WUA Officer ---
export const CreateWuaOfficerInputSchema = z
  .object({
    id: z.uuid({ version: 'v7' }).optional(),
    wuaId: z.uuid(),
    office: WuaOfficeSchema,
    fullName: z.string().min(1),
    phone: z.string().nullable().optional(),
    fromOn: z.iso.date().nullable().optional(),
    toOn: z.iso.date().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.fromOn && data.toOn) {
        return data.fromOn <= data.toOn;
      }
      return true;
    },
    {
      message: 'fromOn must be before or equal to toOn',
      path: ['toOn'],
    },
  );
export type CreateWuaOfficerInput = z.infer<typeof CreateWuaOfficerInputSchema>;

export const UpdateWuaOfficerInputSchema = z
  .object({
    wuaId: z.uuid().optional(),
    office: WuaOfficeSchema.optional(),
    fullName: z.string().min(1).optional(),
    phone: z.string().nullable().optional(),
    fromOn: z.iso.date().nullable().optional(),
    toOn: z.iso.date().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.fromOn && data.toOn) {
        return data.fromOn <= data.toOn;
      }
      return true;
    },
    {
      message: 'fromOn must be before or equal to toOn',
      path: ['toOn'],
    },
  );
export type UpdateWuaOfficerInput = z.infer<typeof UpdateWuaOfficerInputSchema>;

export const WuaOfficerResponseSchema = StandardResponseColumnsSchema.extend({
  wuaId: z.uuid(),
  office: WuaOfficeSchema,
  fullName: z.string(),
  phone: z.string().nullable(),
  fromOn: z.iso.date().nullable(),
  toOn: z.iso.date().nullable(),
});
export type WuaOfficerResponse = z.infer<typeof WuaOfficerResponseSchema>;

export const ListWuaOfficersQuerySchema = BaseListQuerySchema.extend({
  wuaId: z.uuid().optional(),
  office: WuaOfficeSchema.optional(),
});
export type ListWuaOfficersQuery = z.infer<typeof ListWuaOfficersQuerySchema>;
