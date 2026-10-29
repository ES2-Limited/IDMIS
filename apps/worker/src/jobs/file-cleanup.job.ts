import { and, isNull, lt, eq } from '@idmis/db';
import { db, file } from '@idmis/db';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

export interface FileCleanupOptions {
  olderThanHours?: number;
  batchSize?: number;
  s3Client?: S3Client;
  bucket?: string;
  dbClient?: typeof db;
}

export async function cleanupExpiredFilesJob(options: FileCleanupOptions = {}) {
  const olderThanHours = options.olderThanHours ?? 24;
  const batchSize = options.batchSize ?? 100;
  const dbClient = options.dbClient ?? db;
  const bucket = options.bucket ?? process.env.S3_BUCKET ?? 'idmis-files';

  const s3Client =
    options.s3Client ??
    new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT,
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
      forcePathStyle: true,
    });

  const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

  // Find files with scan_status = 'pending' created before cutoff
  const expiredFiles = await dbClient
    .select()
    .from(file)
    .where(
      and(
        eq(file.scanStatus, 'pending'),
        lt(file.createdAt, cutoffDate.toISOString()),
        isNull(file.deletedAt),
      ),
    )
    .limit(batchSize);

  let cleanedCount = 0;

  for (const f of expiredFiles) {
    try {
      // Delete from S3
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: f.storageKey,
        }),
      );

      // Soft delete in database
      await dbClient
        .update(file)
        .set({
          deletedAt: new Date().toISOString(),
        })
        .where(eq(file.id, f.id));

      cleanedCount++;
    } catch (err) {
      console.error(`Failed to clean up expired file ${f.id} (${f.storageKey}):`, err);
    }
  }

  return { cleanedCount, totalFound: expiredFiles.length };
}
