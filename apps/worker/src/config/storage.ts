import { S3Client } from '@aws-sdk/client-s3';

export function getWorkerS3Config(): { s3Client: S3Client; bucket: string } {
  const isProduction = process.env.NODE_ENV === 'production';
  const bucket = process.env.S3_BUCKET || 'idmis-files';
  const region = process.env.S3_REGION || 'auto';
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  const isLoopbackDb =
    process.env.DATABASE_URL?.includes('127.0.0.1') ||
    process.env.DATABASE_URL?.includes('localhost');

  if (isProduction && !isLoopbackDb) {
    if (!accessKeyId) {
      throw new Error('S3_ACCESS_KEY_ID is required when NODE_ENV=production');
    }
    if (!secretAccessKey) {
      throw new Error('S3_SECRET_ACCESS_KEY is required when NODE_ENV=production');
    }
  }

  const s3Client = new S3Client({
    region,
    endpoint: endpoint || (isProduction ? undefined : 'http://localhost:9000'),
    credentials: {
      accessKeyId: accessKeyId || (isProduction ? '' : 'minioadmin'),
      secretAccessKey: secretAccessKey || (isProduction ? '' : 'minioadmin'),
    },
    forcePathStyle: true,
  });

  return { s3Client, bucket };
}
