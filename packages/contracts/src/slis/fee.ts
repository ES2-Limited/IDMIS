import { z } from 'zod';
import { BaseListQuerySchema, StandardResponseColumnsSchema } from '../core/common';
import { RecordStatusSchema } from '../core/enums';
import { MoneySchema, SlisReviewableColumnsSchema } from './common';

// --- Fee Billing ---
export const CreateFeeBillingInputSchema = z
  .object({
    id: z.string().uuid({ version: 'v7' }).optional(),
    schemeId: z.string().uuid(),
    seasonId: z.string().uuid(),
    wuaId: z.string().uuid().optional(),
    farmerId: z.string().uuid().optional(),
    amountNgn: MoneySchema,
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be YYYY-MM-DD')
      .optional(),
  })
  .refine((data) => Boolean(data.wuaId) !== Boolean(data.farmerId), {
    message: 'Exactly one of wuaId or farmerId must be provided',
    path: ['farmerId'],
  });
export type CreateFeeBillingInput = z.infer<typeof CreateFeeBillingInputSchema>;

export const UpdateFeeBillingInputSchema = z.object({
  amountNgn: MoneySchema.optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be YYYY-MM-DD')
    .optional(),
  status: RecordStatusSchema.optional(),
});
export type UpdateFeeBillingInput = z.infer<typeof UpdateFeeBillingInputSchema>;

export const FeeBillingResponseSchema = StandardResponseColumnsSchema.extend({
  schemeId: z.string().uuid(),
  seasonId: z.string().uuid(),
  wuaId: z.string().uuid().nullable(),
  farmerId: z.string().uuid().nullable(),
  amountNgn: MoneySchema,
  dueDate: z.string(),
  importBatchId: z.string().uuid().nullable().optional(),
});
export type FeeBillingResponse = z.infer<typeof FeeBillingResponseSchema>;

export const ListFeeBillingsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  seasonId: z.string().uuid().optional(),
  wuaId: z.string().uuid().optional(),
  farmerId: z.string().uuid().optional(),
  status: RecordStatusSchema.optional(),
});
export type ListFeeBillingsQuery = z.infer<typeof ListFeeBillingsQuerySchema>;

// --- Fee Collection ---
export const CreateFeeCollectionInputSchema = z
  .object({
    id: z.string().uuid({ version: 'v7' }).optional(),
    schemeId: z.string().uuid(),
    seasonId: z.string().uuid(),
    billingId: z.string().uuid().optional(),
    wuaId: z.string().uuid().optional(),
    farmerId: z.string().uuid().optional(),
    amountNgn: MoneySchema,
    paidOn: z.iso.date(),
    receiptNo: z.string().min(1).max(100).optional(),
    deviceId: z.string().uuid().optional(),
    fieldReceiptRef: z.string().min(1).max(100).optional(),
  })
  .refine((data) => Boolean(data.wuaId) !== Boolean(data.farmerId), {
    message: 'Exactly one of wuaId or farmerId must be provided',
    path: ['farmerId'],
  })
  .refine(
    (data) => {
      // If captured on a mobile device, fieldReceiptRef is required
      if (data.deviceId && !data.fieldReceiptRef) {
        return false;
      }
      return true;
    },
    {
      message: 'fieldReceiptRef is required for device-captured collections',
      path: ['fieldReceiptRef'],
    },
  );
export type CreateFeeCollectionInput = z.infer<typeof CreateFeeCollectionInputSchema>;

export const UpdateFeeCollectionInputSchema = z.object({
  amountNgn: MoneySchema.optional(),
  paidOn: z.iso.date().optional(),
  receiptNo: z.string().min(1).max(100).optional(),
  fieldReceiptRef: z.string().min(1).max(100).optional(),
  status: RecordStatusSchema.optional(),
});
export type UpdateFeeCollectionInput = z.infer<typeof UpdateFeeCollectionInputSchema>;

export const FeeCollectionResponseSchema = SlisReviewableColumnsSchema.extend({
  schemeId: z.string().uuid(),
  seasonId: z.string().uuid(),
  wuaId: z.string().uuid().nullable(),
  farmerId: z.string().uuid().nullable(),
  amountNgn: MoneySchema,
  receiptNo: z.string().nullable(), // Official server-assigned receipt number
  fieldReceiptRef: z.string().nullable(), // Paper receipt book ref or device offline ref
  paidOn: z.iso.date(),
});
export type FeeCollectionResponse = z.infer<typeof FeeCollectionResponseSchema>;

export const ListFeeCollectionsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  seasonId: z.string().uuid().optional(),
  wuaId: z.string().uuid().optional(),
  farmerId: z.string().uuid().optional(),
  status: RecordStatusSchema.optional(),
  receiptNo: z.string().optional(),
  fieldReceiptRef: z.string().optional(),
});
export type ListFeeCollectionsQuery = z.infer<typeof ListFeeCollectionsQuerySchema>;
