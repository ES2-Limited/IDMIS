import { describe, expect, it } from 'vitest';
import {
  CompleteUploadInputSchema,
  InitiateUploadInputSchema,
  InitiateUploadResponseSchema,
  FileDownloadUrlResponseSchema,
} from './file';
import {
  InitiateImportInputSchema,
  ImportBatchResponseSchema,
  ImportRowResponseSchema,
  sanitizeFormulaSafety,
  isFormulaUnsafe,
  WUA_IMPORT_DEFINITION,
} from './import';
import {
  KNOWN_EVENT_TYPES,
  KnownEventTypeSchema,
  FileUploadedEventPayloadSchema,
  ImportCommittedEventPayloadSchema,
} from '../platform/events';
import { ListAuditLogsQuerySchema, AuditLogResponseSchema } from '../platform/audit';

describe('Contracts Specification (BE-1.7, BE-1.6, BE-1.8)', () => {
  describe('File Storage Contracts (BE-1.7)', () => {
    it('validates initiate upload input schema', () => {
      const valid = InitiateUploadInputSchema.safeParse({
        fileName: 'report.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: 1048576,
        sha256: 'a'.repeat(64),
      });
      expect(valid.success).toBe(true);

      const invalid = InitiateUploadInputSchema.safeParse({
        fileName: '',
        mimeType: 'app/unknown',
        sizeBytes: -10,
      });
      expect(invalid.success).toBe(false);
    });

    it('validates single-part and multipart initiate upload response', () => {
      const single = InitiateUploadResponseSchema.safeParse({
        fileId: '018f3a5e-0000-7000-8000-000000000001',
        storageKey: 'files/018f3a5e-0000-7000-8000-000000000001',
        isMultipart: false,
        uploadUrl: 'https://storage.idmis.ng/upload/signed-url',
        expiresInSeconds: 900,
      });
      expect(single.success).toBe(true);

      const multipart = InitiateUploadResponseSchema.safeParse({
        fileId: '018f3a5e-0000-7000-8000-000000000001',
        storageKey: 'files/018f3a5e-0000-7000-8000-000000000001',
        isMultipart: true,
        uploadId: 'upload_12345',
        parts: [
          { partNumber: 1, uploadUrl: 'https://storage.idmis.ng/part1' },
          { partNumber: 2, uploadUrl: 'https://storage.idmis.ng/part2' },
        ],
        partSizeBytes: 5242880,
        expiresInSeconds: 3600,
      });
      expect(multipart.success).toBe(true);
    });

    it('validates complete upload and download url schemas', () => {
      const complete = CompleteUploadInputSchema.safeParse({
        fileId: '018f3a5e-0000-7000-8000-000000000001',
        uploadId: 'upload_12345',
        parts: [{ partNumber: 1, etag: 'etag-1' }],
        sha256: 'b'.repeat(64),
      });
      expect(complete.success).toBe(true);

      const download = FileDownloadUrlResponseSchema.safeParse({
        downloadUrl:
          'https://storage.idmis.ng/files/018f3a5e-0000-7000-8000-000000000001?signed=true',
        expiresInSeconds: 300,
      });
      expect(download.success).toBe(true);
    });
  });

  describe('Import Engine Contracts & Safety (BE-1.8)', () => {
    it('formula safety: detects unsafe formula prefixes and escapes them', () => {
      expect(isFormulaUnsafe('=SUM(A1:A10)')).toBe(true);
      expect(isFormulaUnsafe('+123')).toBe(true);
      expect(isFormulaUnsafe('-456')).toBe(true);
      expect(isFormulaUnsafe('@cmd')).toBe(true);
      expect(isFormulaUnsafe('\tcalc')).toBe(true);
      expect(isFormulaUnsafe('Safe Text')).toBe(false);

      expect(sanitizeFormulaSafety('=cmd|’ /C calc’!A0')).toBe(`'=cmd|’ /C calc’!A0`);
      expect(sanitizeFormulaSafety('+Dangerous')).toBe(`'+Dangerous`);
      expect(sanitizeFormulaSafety('Regular Name')).toBe('Regular Name');
    });

    it('validates initiate import input schema and batch response', () => {
      const valid = InitiateImportInputSchema.safeParse({
        dataset: 'wua',
        fileId: '018f3a5e-0000-7000-8000-000000000001',
        schemeId: '018f3a5e-0000-7000-8000-000000000002',
      });
      expect(valid.success).toBe(true);

      const batch = ImportBatchResponseSchema.safeParse({
        id: '018f3a5e-0000-7000-8000-000000000001',
        version: 1,
        dataset: 'wua',
        fileId: '018f3a5e-0000-7000-8000-000000000002',
        status: 'validated',
        totalRows: 100,
        validRows: 98,
        errorRows: 2,
        committedRows: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(batch.success).toBe(true);
    });

    it('validates import row schema with column errors', () => {
      const row = ImportRowResponseSchema.safeParse({
        id: '018f3a5e-0000-7000-8000-000000000003',
        batchId: '018f3a5e-0000-7000-8000-000000000004',
        rowNumber: 2,
        rawData: { name: 'Kano North WUA', level: 'sector' },
        status: 'error',
        errors: [
          { column: 'schemeCode', message: 'Scheme code not found in scheme organisations' },
        ],
      });
      expect(row.success).toBe(true);
    });

    it('verifies WUA import dataset definition matches natural key and column constraints', () => {
      expect(WUA_IMPORT_DEFINITION.dataset).toBe('wua');
      expect(WUA_IMPORT_DEFINITION.targetTable).toBe('core.wua');
      expect(WUA_IMPORT_DEFINITION.naturalKeyColumns).toEqual(['regNo', 'name']);
      expect(WUA_IMPORT_DEFINITION.columns.length).toBeGreaterThan(5);

      const nameCol = WUA_IMPORT_DEFINITION.columns.find((c) => c.name === 'name');
      expect(nameCol?.required).toBe(true);
    });
  });

  describe('Outbox Events & Audit Contracts (BE-1.5, BE-1.6, BE-1.7, BE-1.8)', () => {
    it('contains all required known event types in the catalogue', () => {
      const expected = [
        'core.assignment.changed',
        'core.role_permission.changed',
        'core.user.created',
        'core.user.updated',
        'core.user.deactivated',
        'core.file.uploaded',
        'core.file.scanned',
        'core.file.deleted',
        'core.import.uploaded',
        'core.import.validated',
        'core.import.committed',
        'core.import.undone',
      ];
      for (const evt of expected) {
        expect(KNOWN_EVENT_TYPES).toContain(evt);
        expect(KnownEventTypeSchema.safeParse(evt).success).toBe(true);
      }
    });

    it('validates file and import event payloads', () => {
      const fileEvt = FileUploadedEventPayloadSchema.safeParse({
        fileId: '018f3a5e-0000-7000-8000-000000000001',
        storageKey: 'files/018f3a5e-0000-7000-8000-000000000001',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        sha256: 'c'.repeat(64),
      });
      expect(fileEvt.success).toBe(true);

      const importEvt = ImportCommittedEventPayloadSchema.safeParse({
        batchId: '018f3a5e-0000-7000-8000-000000000002',
        dataset: 'wua',
        committedRows: 150,
        status: 'committed',
      });
      expect(importEvt.success).toBe(true);
    });

    it('validates audit log list query schema and response schema', () => {
      const parsed = ListAuditLogsQuerySchema.safeParse({
        page: '2',
        limit: '25',
        action: 'import',
        entityType: 'core.wua',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.page).toBe(2);
        expect(parsed.data.limit).toBe(25);
      }

      const res = AuditLogResponseSchema.safeParse({
        id: '018f3a5e-0000-7000-8000-000000000001',
        occurredAt: new Date(),
        actorType: 'user',
        actorUserId: '018f3a5e-0000-7000-8000-000000000002',
        requestId: 'req-123',
        action: 'import',
        entityType: 'core.wua',
        entityId: '018f3a5e-0000-7000-8000-000000000003',
        stateId: null,
        changes: { before: null, after: { name: 'WUA 1' } },
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      });
      expect(res.success).toBe(true);
    });
  });
});
