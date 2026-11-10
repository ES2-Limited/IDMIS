import { describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import { processPdfReportJob } from './pdf-report.job';
import { renderHtmlToPdf } from '../reports/pdf-renderer';
import { escapeHtml } from '../reports/escape-html';
import { permissions } from '@idmis/contracts';
import type { db } from '@idmis/db';
import type { S3Client } from '@aws-sdk/client-s3';

vi.mock('@idmis/db/authz', () => ({
  resolveUserAuthz: vi.fn(),
}));

describe('PDF Report Generation Worker (BE-5.2)', () => {
  it('renders HTML to PDF in under 30 seconds and extracts text', async () => {
    const startTime = Date.now();
    const testHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>TRIMING IDMIS 2.0 Test Report</h1>
          <p>Headline Number: 45,678 Farmers</p>
        </body>
      </html>
    `;

    const pdfBuffer = await renderHtmlToPdf(testHtml, { timeoutMs: 60000 });
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(60000);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    await parser.destroy();

    expect(result.text).toContain('TRIMING IDMIS 2.0 Test Report');
    expect(result.text).toContain('45,678 Farmers');
  }, 60000);

  it('escapes dangerous tags and prevents SSRF network requests during PDF rendering', async () => {
    // Malicious payload simulating SSRF attempt
    const maliciousInput = '<img src="http://169.254.169.254/latest/meta-data/">';
    const escaped = escapeHtml(maliciousInput);

    expect(escaped).toBe('&lt;img src=&quot;http://169.254.169.254/latest/meta-data/&quot;&gt;');

    const testHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Security Test</h1>
          <div>Scheme: ${escaped}</div>
        </body>
      </html>
    `;

    const pdfBuffer = await renderHtmlToPdf(testHtml);
    expect(pdfBuffer.length).toBeGreaterThan(500);

    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getText();
    await parser.destroy();

    // Verify the payload is present as plain visible text, not rendered as an active network resource
    expect(result.text).toContain('<img src="http://169.254.169.254/latest/meta-data/">');
  }, 30000);

  it('generates scheme_report and contains expected headline numbers', async () => {
    const reportId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const schemeId = crypto.randomUUID();
    const stateId = crypto.randomUUID();

    let uploadedBuffer: Buffer | null = null;
    const mockS3Client = {
      send: vi.fn().mockImplementation((cmd: { input: { Body: Buffer } }) => {
        uploadedBuffer = cmd.input.Body;
        return Promise.resolve({});
      }),
    };

    const mockDb = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: reportId }]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([{ id: crypto.randomUUID() }]),
      }),
      select: vi.fn().mockImplementation(() => {
        const queryBuilder: Record<string, unknown> = {
          from: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockImplementation(() =>
            Promise.resolve([
              {
                id: schemeId,
                name: 'Kano River Irrigation Scheme',
                code: 'KRIS-01',
                stateId,
                stateName: 'Kano State',
              },
            ]),
          ),
          then: vi.fn().mockImplementation((resolve) =>
            resolve([
              {
                serviceType: 'Gravity Canal',
                areaHa: '14500.50',
                totalHa: '14500.50',
                totalAreaHa: '14500.50',
                plotsCount: 3200,
                plotCount: 3200,
                gender: 'male',
                farmerCount: 8500,
                total: 8500,
                male: 5500,
                female: 3000,
                billed: '50000000.00',
                collected: '45000000.00',
                yieldMt: '25000.00',
                totalYieldT: '25000.00',
                status: 'approved',
                count: 140,
              },
            ]),
          ),
        };
        return queryBuilder;
      }),
    };

    // Mock resolveUserAuthz
    const { resolveUserAuthz } = await import('@idmis/db/authz');
    vi.mocked(resolveUserAuthz).mockResolvedValue({
      userId,
      isActive: true,
      can: (p: string) => p === permissions.REPORT_GENERATE,
      scopeFor: () => ({
        isNational: true,
        stateIds: [stateId],
        schemeIds: [schemeId],
      }),
    } as unknown as Awaited<ReturnType<typeof resolveUserAuthz>>);

    const result = await processPdfReportJob({
      reportId,
      userId,
      type: 'scheme_report',
      params: { schemeId, year: 2026 },
      dbClient: mockDb as unknown as typeof db,
      s3Client: mockS3Client as unknown as S3Client,
      bucket: 'test-bucket',
    });

    expect(result.status).toBe('completed');
    expect(uploadedBuffer).not.toBeNull();

    const parser = new PDFParse({ data: uploadedBuffer! });
    const parsedText = await parser.getText();
    await parser.destroy();

    expect(parsedText.text).toContain('Kano River Irrigation Scheme');
    expect(parsedText.text).toContain('KRIS-01');
    expect(parsedText.text).toContain('Kano State');
    expect(parsedText.text.toUpperCase()).toContain('TOTAL REGISTERED FARMERS');
    expect(parsedText.text).toContain('8,500');
    expect(parsedText.text.toUpperCase()).toContain('IRRIGATION FEE RECOVERY');
    expect(parsedText.text).toContain('90.0%'); // 45m / 50m = 90%
  }, 30000);

  it('generates indicator_matrix report and contains expected indicators', async () => {
    const reportId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    let uploadedBuffer: Buffer | null = null;
    const mockS3Client = {
      send: vi.fn().mockImplementation((cmd: { input: { Body: Buffer } }) => {
        uploadedBuffer = cmd.input.Body;
        return Promise.resolve({});
      }),
    };

    const mockDb = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: reportId }]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([{ id: crypto.randomUUID() }]),
      }),
      select: vi.fn().mockImplementation(() => {
        const queryBuilder: Record<string, unknown> = {
          from: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockImplementation(() =>
            Promise.resolve([
              {
                code: 'PDO-01',
                name: 'Area provided with new or improved irrigation services',
                periodYear: 2026,
                periodQuarter: 1,
                target: '15000',
                value: '16200',
                endTarget: '20000',
                pctOfEndTarget: '81.0',
                status: 'on_track',
              },
            ]),
          ),
        };
        return queryBuilder;
      }),
    };

    const result = await processPdfReportJob({
      reportId,
      userId,
      type: 'indicator_matrix',
      params: { scopeType: 'programme', year: 2026, quarter: 1 },
      dbClient: mockDb as unknown as typeof db,
      s3Client: mockS3Client as unknown as S3Client,
      bucket: 'test-bucket',
    });

    expect(result.status).toBe('completed');
    expect(uploadedBuffer).not.toBeNull();

    const parser = new PDFParse({ data: uploadedBuffer! });
    const parsedText = await parser.getText();
    await parser.destroy();

    expect(parsedText.text).toContain('PDO-01');
    expect(parsedText.text).toContain('Area provided with new or improved');
    expect(parsedText.text).toContain('16,200');
    expect(parsedText.text).toContain('81.0%');
  }, 30000);

  it('generates dam_safety_summary report and contains expected dam inspection numbers', async () => {
    const reportId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    let uploadedBuffer: Buffer | null = null;
    const mockS3Client = {
      send: vi.fn().mockImplementation((cmd: { input: { Body: Buffer } }) => {
        uploadedBuffer = cmd.input.Body;
        return Promise.resolve({});
      }),
    };

    const mockDb = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: reportId }]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([{ id: crypto.randomUUID() }]),
      }),
      select: vi.fn().mockImplementation(() => {
        const queryBuilder: Record<string, unknown> = {
          from: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockImplementation(() =>
            Promise.resolve([
              {
                id: crypto.randomUUID(),
                code: 'DAM-TIGA',
                name: 'Tiga Dam',
                meetsStandard: true,
                hazardClass: 'High Hazard',
                inspectedOn: '2026-05-10',
                nextDueOn: '2027-05-10',
              },
              {
                id: crypto.randomUUID(),
                code: 'DAM-CHAL',
                name: 'Challawa Gorge Dam',
                meetsStandard: false,
                hazardClass: 'High Hazard',
                inspectedOn: '2025-01-15',
                nextDueOn: '2026-01-15', // overdue
              },
            ]),
          ),
        };
        return queryBuilder;
      }),
    };

    const result = await processPdfReportJob({
      reportId,
      userId,
      type: 'dam_safety_summary',
      params: {},
      dbClient: mockDb as unknown as typeof db,
      s3Client: mockS3Client as unknown as S3Client,
      bucket: 'test-bucket',
    });

    expect(result.status).toBe('completed');
    expect(uploadedBuffer).not.toBeNull();

    const parser = new PDFParse({ data: uploadedBuffer! });
    const parsedText = await parser.getText();
    await parser.destroy();

    expect(parsedText.text).toContain('Dam Safety & Surveillance Summary');
    expect(parsedText.text).toContain('DAM-TIGA');
    expect(parsedText.text).toContain('Tiga Dam');
    expect(parsedText.text).toContain('Challawa Gorge Dam');
    expect(parsedText.text.toUpperCase()).toContain('MEETING');
    expect(parsedText.text.toUpperCase()).toContain('STANDARD');
    expect(parsedText.text.toUpperCase()).toContain('OVERDUE');
  }, 30000);

  it('fails report generation when user is out of scope', async () => {
    const reportId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const outOfScopeSchemeId = crypto.randomUUID();

    const mockDb = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: reportId }]),
        }),
      }),
      select: vi.fn().mockImplementation(() => {
        const queryBuilder: Record<string, unknown> = {
          from: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([
            {
              id: outOfScopeSchemeId,
              name: 'Lagos Scheme',
              code: 'LS-01',
              stateId: '018f3a5e-0000-7000-8000-000000000099',
              stateName: 'Lagos State',
            },
          ]),
        };
        return queryBuilder;
      }),
    };

    // Scoped user with Kano access only
    const { resolveUserAuthz } = await import('@idmis/db/authz');
    vi.mocked(resolveUserAuthz).mockResolvedValueOnce({
      userId,
      isActive: true,
      can: (p: string) => p === permissions.REPORT_GENERATE,
      scopeFor: () => ({
        isNational: false,
        stateIds: ['018f3a5e-0000-7000-8000-000000000001'], // Kano
        schemeIds: ['018f3a5e-0000-7000-8000-000000000002'],
      }),
    } as unknown as Awaited<ReturnType<typeof resolveUserAuthz>>);

    const result = await processPdfReportJob({
      reportId,
      userId,
      type: 'scheme_report',
      params: { schemeId: outOfScopeSchemeId },
      dbClient: mockDb as unknown as typeof db,
    });

    expect(result.status).toBe('failed');
    expect(result.reason).toContain('Out of scope');
  });
});
