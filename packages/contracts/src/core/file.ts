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

// Presigned Upload Contracts
export const InitiateUploadInputSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'Must be a 64-character SHA-256 hex string')
    .optional(),
  ownerEntity: z.string().min(1).max(100).optional(),
  ownerId: z.uuid().optional(),
});
export type InitiateUploadInput = z.infer<typeof InitiateUploadInputSchema>;

export const PresignedPartSchema = z.object({
  partNumber: z.number().int().positive(),
  uploadUrl: z.string().url(),
});
export type PresignedPart = z.infer<typeof PresignedPartSchema>;

export const InitiateUploadResponseSchema = z.object({
  fileId: z.uuid(),
  storageKey: z.string().min(1),
  isMultipart: z.boolean(),
  uploadUrl: z.string().url().optional(),
  uploadId: z.string().optional(),
  parts: z.array(PresignedPartSchema).optional(),
  partSizeBytes: z.number().int().positive().optional(),
  expiresInSeconds: z.number().int().positive(),
});
export type InitiateUploadResponse = z.infer<typeof InitiateUploadResponseSchema>;

export const UploadPartInputSchema = z.object({
  partNumber: z.number().int().positive(),
  etag: z.string().min(1),
});
export type UploadPartInput = z.infer<typeof UploadPartInputSchema>;

export const CompleteUploadInputSchema = z.object({
  fileId: z.uuid(),
  uploadId: z.string().optional(),
  parts: z.array(UploadPartInputSchema).optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
});
export type CompleteUploadInput = z.infer<typeof CompleteUploadInputSchema>;

export const CompleteUploadResponseSchema = FileResponseSchema;
export type CompleteUploadResponse = z.infer<typeof CompleteUploadResponseSchema>;

export const FileDownloadUrlResponseSchema = z.object({
  downloadUrl: z.string().url(),
  expiresInSeconds: z.number().int().positive(),
});
export type FileDownloadUrlResponse = z.infer<typeof FileDownloadUrlResponseSchema>;
