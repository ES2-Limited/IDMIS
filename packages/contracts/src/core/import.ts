import { z } from 'zod';
import { BaseListQuerySchema, StandardResponseColumnsSchema } from './common';

export const IMPORT_BATCH_STATUSES = [
  'uploaded',
  'validating',
  'validated',
  'validation_failed',
  'committing',
  'committed',
  'commit_failed',
  'undoing',
  'undone',
  'undo_failed',
] as const;
export const ImportBatchStatusSchema = z.enum(IMPORT_BATCH_STATUSES);
export type ImportBatchStatus = z.infer<typeof ImportBatchStatusSchema>;

export const IMPORT_ROW_STATUSES = ['valid', 'error', 'duplicate', 'committed'] as const;
export const ImportRowStatusSchema = z.enum(IMPORT_ROW_STATUSES);
export type ImportRowStatus = z.infer<typeof ImportRowStatusSchema>;

export const InitiateImportInputSchema = z.object({
  dataset: z.string().min(1).max(50),
  fileId: z.uuid(),
  schemeId: z.uuid().optional(),
  stateId: z.uuid().optional(),
});
export type InitiateImportInput = z.infer<typeof InitiateImportInputSchema>;

export const ImportBatchResponseSchema = StandardResponseColumnsSchema.extend({
  dataset: z.string(),
  fileId: z.uuid(),
  status: ImportBatchStatusSchema,
  schemeId: z.uuid().nullable().optional(),
  stateId: z.uuid().nullable().optional(),
  totalRows: z.number().int().default(0),
  validRows: z.number().int().default(0),
  errorRows: z.number().int().default(0),
  committedRows: z.number().int().default(0),
  errorMessage: z.string().nullable().optional(),
  committedAt: z.iso.datetime().nullable().optional(),
  undoneAt: z.iso.datetime().nullable().optional(),
  createdBy: z.uuid().nullable().optional(),
});
export type ImportBatchResponse = z.infer<typeof ImportBatchResponseSchema>;

export const ListImportBatchesQuerySchema = BaseListQuerySchema.extend({
  dataset: z.string().optional(),
  status: ImportBatchStatusSchema.optional(),
  schemeId: z.uuid().optional(),
  stateId: z.uuid().optional(),
});
export type ListImportBatchesQuery = z.infer<typeof ListImportBatchesQuerySchema>;

export const ImportRowErrorSchema = z.object({
  column: z.string(),
  message: z.string(),
  code: z.string().optional(),
});
export type ImportRowError = z.infer<typeof ImportRowErrorSchema>;

export const ImportRowResponseSchema = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
  rowNumber: z.number().int().positive(),
  rawData: z.record(z.string(), z.unknown()),
  status: ImportRowStatusSchema,
  errors: z.array(ImportRowErrorSchema).default([]),
  naturalKey: z.string().nullable().optional(),
  targetEntityId: z.uuid().nullable().optional(),
});
export type ImportRowResponse = z.infer<typeof ImportRowResponseSchema>;

export const ImportPreviewResponseSchema = z.object({
  batch: ImportBatchResponseSchema,
  rows: z.array(ImportRowResponseSchema),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalRows: z.number().int().nonnegative(),
  totalErrorRows: z.number().int().nonnegative(),
  totalValidRows: z.number().int().nonnegative(),
});
export type ImportPreviewResponse = z.infer<typeof ImportPreviewResponseSchema>;

export const ImportSseTokenResponseSchema = z.object({
  sseToken: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
});
export type ImportSseTokenResponse = z.infer<typeof ImportSseTokenResponseSchema>;

export const ImportProgressMessageSchema = z.object({
  batchId: z.uuid(),
  dataset: z.string(),
  status: ImportBatchStatusSchema,
  progress: z.number().min(0).max(100),
  totalRows: z.number().int().nonnegative(),
  processedRows: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(),
  errorRows: z.number().int().nonnegative(),
  committedRows: z.number().int().nonnegative(),
  message: z.string().optional(),
});
export type ImportProgressMessage = z.infer<typeof ImportProgressMessageSchema>;

export const ImportColumnDefinitionSchema = z.object({
  name: z.string(),
  header: z.string(),
  required: z.boolean().default(false),
  type: z.enum(['string', 'number', 'boolean', 'date', 'uuid']),
  description: z.string().optional(),
  example: z.union([z.string(), z.number(), z.boolean()]).optional(),
  lookupType: z.string().optional(),
});
export type ImportColumnDefinition = z.infer<typeof ImportColumnDefinitionSchema>;

export const ImportDatasetDefinitionSchema = z.object({
  dataset: z.string(),
  targetTable: z.string(),
  version: z.number().int().positive().default(1),
  naturalKeyColumns: z.array(z.string()),
  columns: z.array(ImportColumnDefinitionSchema),
});
export type ImportDatasetDefinition = z.infer<typeof ImportDatasetDefinitionSchema>;

// Formula safety helper to mitigate CSV / Excel Injection
export function sanitizeFormulaSafety<T>(value: T): T {
  if (typeof value === 'string') {
    if (/^[=+\-@\t\r]/.test(value)) {
      return `'${value}` as unknown as T;
    }
  }
  return value;
}

export function isFormulaUnsafe(value: unknown): boolean {
  return typeof value === 'string' && /^[=+\-@\t\r]/.test(value);
}

// First Import Dataset Definition: WUAs
export const WUA_IMPORT_DEFINITION: ImportDatasetDefinition = {
  dataset: 'wua',
  targetTable: 'core.wua',
  version: 1,
  naturalKeyColumns: ['regNo', 'name'],
  columns: [
    {
      name: 'name',
      header: 'WUA Name',
      required: true,
      type: 'string',
      description: 'Official name of the Water User Association',
    },
    {
      name: 'regNo',
      header: 'Registration Number',
      required: false,
      type: 'string',
      description: 'CAC or State registration number',
    },
    {
      name: 'level',
      header: 'Level',
      required: true,
      type: 'string',
      description: 'apex | sector | unit',
    },
    {
      name: 'schemeCode',
      header: 'Scheme Code',
      required: true,
      type: 'string',
      description: 'Code of the scheme organisation',
    },
    {
      name: 'wardCode',
      header: 'Ward Code',
      required: false,
      type: 'string',
      description: 'Code of the administrative ward',
    },
    {
      name: 'address',
      header: 'Address',
      required: false,
      type: 'string',
    },
    {
      name: 'bankName',
      header: 'Bank Name',
      required: false,
      type: 'string',
    },
    {
      name: 'bankAccountNumber',
      header: 'Account Number',
      required: false,
      type: 'string',
    },
    {
      name: 'isOperational',
      header: 'Is Operational',
      required: false,
      type: 'boolean',
    },
    {
      name: 'hasMaintenanceFund',
      header: 'Has Maintenance Fund',
      required: false,
      type: 'boolean',
    },
  ],
};
