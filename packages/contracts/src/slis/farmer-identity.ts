import { z } from 'zod';
import { SlisReviewableColumnsSchema } from './common';

export const CreateFarmerIdentityInputSchema = z.object({
  id: z.string().uuid({ version: 'v7' }).optional(),
  farmerId: z.string().uuid(),
  documentTypeId: z.string().uuid(),
  number: z.string().min(1).max(50), // Plaintext on input, encrypted by service
  bankName: z.string().max(100).optional(),
  documentFileId: z.string().uuid().optional(),
});
export type CreateFarmerIdentityInput = z.infer<typeof CreateFarmerIdentityInputSchema>;

export const FarmerIdentityResponseSchema = SlisReviewableColumnsSchema.extend({
  farmerId: z.string().uuid(),
  documentTypeId: z.string().uuid(),
  numberLast4: z.string(),
  bankName: z.string().nullable(),
  documentFileId: z.string().uuid().nullable(),
  uniquePerPerson: z.boolean(),
});
export type FarmerIdentityResponse = z.infer<typeof FarmerIdentityResponseSchema>;

export const UnmaskedFarmerIdentityResponseSchema = FarmerIdentityResponseSchema.extend({
  number: z.string(), // Unmasked number for authorized slis.identity.view callers
});
export type UnmaskedFarmerIdentityResponse = z.infer<typeof UnmaskedFarmerIdentityResponseSchema>;
