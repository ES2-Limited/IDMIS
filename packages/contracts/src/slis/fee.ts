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
  })
  .refine((data) => Boolean(data.wuaId) !== Boolean(data.farmerId), {
    message: 'Exactly one of wuaId or farmerId must be provided',
    path: ['farmerId'],
  });
export type CreateFeeBillingInput = z.infer<typeof CreateFeeBillingInputSchema>;

export const FeeBillingResponseSchema = StandardResponseColumnsSchema.extend({
  schemeId: z.string().uuid(),
  seasonId: z.string().uuid(),
  wuaId: z.string().uuid().nullable(),
  farmerId: z.string().uuid().nullable(),
  amountNgn: MoneySchema,
  importBatchId: z.string().uuid().nullable().optional(),
});
export type FeeBillingResponse = z.infer<typeof FeeBillingResponseSchema>;

export const ListFeeBillingsQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
  seasonId: z.string().uuid().optional(),
  wuaId: z.string().uuid().optional(),
  farmerId: z.string().uuid().optional(),
});
export type ListFeeBillingsQuery = z.infer<typeof ListFeeBillingsQuerySchema>;

// --- Fee Collection ---
export const CreateFeeCollectionInputSchema = z
  .object({
    id: z.string().uuid({ version: 'v7' }).optional(),
    schemeId: z.string().uuid(),
    seasonId: z.string().uuid(),
    wuaId: z.string().uuid().optional(),
    farmerId: z.string().uuid().optional(),
    amountNgn: MoneySchema,
    paidOn: z.iso.date(),
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
