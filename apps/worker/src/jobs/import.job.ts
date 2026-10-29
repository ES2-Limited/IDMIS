import { db, importBatch, importRow, file, eq } from '@idmis/db';
import ExcelJS from 'exceljs';
import { sanitizeFormulaSafety } from '@idmis/contracts';
import type { S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

export interface ImportJobOptions {
  batchId: string;
  s3Client: S3Client;
  bucket: string;
}

export async function processImportValidationJob(options: ImportJobOptions) {
  const { batchId, s3Client, bucket } = options;

  const [batch] = await db.select().from(importBatch).where(eq(importBatch.id, batchId)).limit(1);

  if (!batch || batch.status !== 'uploaded') {
    return { status: 'skipped', reason: `Batch not in uploaded status: ${batch?.status}` };
  }

  const [fileRow] = await db.select().from(file).where(eq(file.id, batch.fileId)).limit(1);
  if (!fileRow) {
    await db
      .update(importBatch)
      .set({ status: 'validation_failed', errorMessage: 'File not found' })
      .where(eq(importBatch.id, batchId));
    return { status: 'failed', reason: 'File not found' };
  }

  const getCmd = new GetObjectCommand({
    Bucket: bucket,
    Key: fileRow.storageKey,
  });
  const res = await s3Client.send(getCmd);
  if (!res.Body) {
    return { status: 'failed', reason: 'Empty S3 body' };
  }

  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const fileBuffer = Buffer.concat(chunks);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    fileBuffer as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0],
  );

  const sheet = workbook.getWorksheet('Data') || workbook.worksheets[0];
  if (!sheet) {
    await db
      .update(importBatch)
      .set({ status: 'validation_failed', errorMessage: 'Sheet missing' })
      .where(eq(importBatch.id, batchId));
    return { status: 'failed', reason: 'Sheet missing' };
  }

  // Row validation
  let validCount = 0;
  const errorCount = 0;

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (!row.hasValues) continue;

    const nameCell = row.getCell(1).value;
    if (!nameCell) continue;

    const sanitizedName = sanitizeFormulaSafety(nameCell);
    validCount++;

    await db.insert(importRow).values({
      batchId,
      rowNumber: r,
      rawData: { name: sanitizedName },
      parsedData: { name: sanitizedName },
      status: 'valid',
      errors: [],
    });
  }

  const finalStatus = errorCount === 0 && validCount > 0 ? 'validated' : 'validation_failed';
  await db
    .update(importBatch)
    .set({
      totalRows: validCount + errorCount,
      validRows: validCount,
      errorRows: errorCount,
      status: finalStatus,
    })
    .where(eq(importBatch.id, batchId));

  return { status: finalStatus, validRows: validCount, errorRows: errorCount };
}
