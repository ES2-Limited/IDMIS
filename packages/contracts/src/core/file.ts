import { z } from 'zod';
import { BaseListQuerySchema, StandardResponseColumnsSchema } from './common';
import { FileScanStatusSchema } from './enums';

export const CreateFileInputSchema = z.object({
  id: z.uuid({ version: 'v7' }).optional(),
  storageKey: z.string().min(1),
  originalName: z.string().nullable().optional(),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  ownerEntity: z.string().nullable().optional(),
  ownerId: z.uuid().nullable().optional(),
});
export type CreateFileInput = z.infer<typeof CreateFileInputSchema>;

export const FileResponseSchema = StandardResponseColumnsSchema.extend({
  storageKey: z.string(),
  originalName: z.string().nullable(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  sha256: z.string(),
  scanStatus: FileScanStatusSchema,
  ownerEntity: z.string().nullable(),
  ownerId: z.uuid().nullable(),
});
export type FileResponse = z.infer<typeof FileResponseSchema>;

export const ListFilesQuerySchema = BaseListQuerySchema.extend({
  scanStatus: FileScanStatusSchema.optional(),
  ownerEntity: z.string().optional(),
  ownerId: z.uuid().optional(),
});
export type ListFilesQuery = z.infer<typeof ListFilesQuerySchema>;
