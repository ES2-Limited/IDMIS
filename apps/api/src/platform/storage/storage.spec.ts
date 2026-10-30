import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StorageService } from './storage.service';
import { AntivirusService } from './antivirus.service';
import { Readable } from 'node:stream';

describe('Storage & Antivirus Service Specification (BE-1.7)', () => {
  let storageService: StorageService;
  let antivirusService: AntivirusService;

  beforeEach(() => {
    storageService = new StorageService({
      NODE_ENV: 'test',
      PORT: 3000,
      DATABASE_URL: 'postgresql://localhost/dummy',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-secret-min-16-chars',
      APP_URL: 'http://localhost:5173',
      API_URL: 'http://localhost:3000',
      COOKIE_PATH: '/auth',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'test-bucket',
      S3_ACCESS_KEY_ID: 'minioadmin',
      S3_SECRET_ACCESS_KEY: 'minioadmin',
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
      API_PUBLIC_BASE_PATH: '/',
    });
    antivirusService = new AntivirusService(storageService);
  });

  describe('StorageService', () => {
    it('generates a presigned single-part upload URL', async () => {
      const url = await storageService.getSinglePartUploadUrl(
        'files/uuid-1',
        'application/pdf',
        600,
      );
      expect(url).toContain('http://localhost:9000/test-bucket/files/uuid-1');
      expect(url).toContain('X-Amz-Signature');
    });

    it('generates a presigned download URL with attachment header', async () => {
      const url = await storageService.getDownloadUrl('files/uuid-1', 300, 'report.pdf');
      expect(url).toContain('http://localhost:9000/test-bucket/files/uuid-1');
      expect(url).toContain('response-content-disposition');
      expect(url).toContain('report.pdf');
    });

    it('inspects object stream and detects valid PDF magic bytes and sha256', async () => {
      const pdfContent = Buffer.from('%PDF-1.4 sample content for sha256 check');
      const fakeStream = Readable.from([pdfContent]);

      vi.spyOn(storageService.getClient(), 'send').mockResolvedValueOnce({
        Body: fakeStream,
      } as never);

      const inspection = await storageService.inspectUploadedObject(
        'files/uuid-1',
        'application/pdf',
      );
      expect(inspection.isValidMimeType).toBe(true);
      expect(inspection.sniffedMimeType).toBe('application/pdf');
      expect(inspection.sizeBytes).toBe(pdfContent.length);
      expect(inspection.sha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it('detects mismatched MIME type on executable content masquerading as PDF', async () => {
      const exeContent = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);
      const fakeStream = Readable.from([exeContent]);

      vi.spyOn(storageService.getClient(), 'send').mockResolvedValueOnce({
        Body: fakeStream,
      } as never);

      const inspection = await storageService.inspectUploadedObject(
        'files/uuid-1',
        'application/pdf',
      );
      expect(inspection.isValidMimeType).toBe(false);
      expect(inspection.sniffedMimeType).not.toBe('application/pdf');
    });
  });

  describe('AntivirusService (Stub Scanner)', () => {
    it('scans clean file stream and returns status clean', async () => {
      const cleanStream = Readable.from([Buffer.from('Regular document content without viruses')]);
      vi.spyOn(storageService.getClient(), 'send').mockResolvedValueOnce({
        Body: cleanStream,
      } as never);

      const result = await antivirusService.scanFile('files/clean-1');
      expect(result.scanStatus).toBe('clean');
      expect(result.virusDetails).toBeNull();
    });

    it('detects EICAR test signature and marks file as infected', async () => {
      const eicarBuffer = Buffer.from(
        'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      );
      const infectedStream = Readable.from([eicarBuffer]);
      vi.spyOn(storageService.getClient(), 'send').mockResolvedValueOnce({
        Body: infectedStream,
      } as never);

      const result = await antivirusService.scanFile('files/infected-1');
      expect(result.scanStatus).toBe('infected');
      expect(result.virusDetails).toContain('EICAR');
    });
  });
});
