import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { validateApiEnv, type ApiEnv } from '../config/env';
import { isMimeTypeCompatible, sniffMimeType } from './magic-sniff';

export interface PresignedPartUrl {
  partNumber: number;
  uploadUrl: string;
}

export interface UploadInspectionResult {
  sizeBytes: number;
  sha256: string;
  sniffedMimeType: string | null;
  isValidMimeType: boolean;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(@Optional() @Inject('API_ENV') customEnv?: ApiEnv) {
    const env = customEnv ?? validateApiEnv();
    this.bucket = env.S3_BUCKET;

    this.s3Client = new S3Client({
      region: env.S3_REGION || 'auto',
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID || 'minioadmin',
        secretAccessKey: env.S3_SECRET_ACCESS_KEY || 'minioadmin',
      },
      forcePathStyle: true, // Required for MinIO and local testing
    });
  }

  getBucket(): string {
    return this.bucket;
  }

  getClient(): S3Client {
    return this.s3Client;
  }

  /**
   * Generates a single-part presigned PUT URL.
   */
  async getSinglePartUploadUrl(
    storageKey: string,
    mimeType: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: mimeType,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Initiates a multipart upload and returns uploadId.
   */
  async initiateMultipartUpload(storageKey: string, mimeType: string): Promise<string> {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: mimeType,
    });
    const response = await this.s3Client.send(command);
    if (!response.UploadId) {
      throw new Error(`Failed to initiate multipart upload for ${storageKey}`);
    }
    return response.UploadId;
  }

  /**
   * Generates presigned URLs for each part in a multipart upload.
   */
  async getMultipartUploadPartUrls(
    storageKey: string,
    uploadId: string,
    partCount: number,
    expiresInSeconds = 3600,
  ): Promise<PresignedPartUrl[]> {
    const parts: PresignedPartUrl[] = [];
    for (let partNumber = 1; partNumber <= partCount; partNumber++) {
      const command = new UploadPartCommand({
        Bucket: this.bucket,
        Key: storageKey,
        UploadId: uploadId,
        PartNumber: partNumber,
      });
      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });
      parts.push({ partNumber, uploadUrl });
    }
    return parts;
  }

  /**
   * Completes a multipart upload with part numbers and ETags.
   */
  async completeMultipartUpload(
    storageKey: string,
    uploadId: string,
    parts: Array<{ partNumber: number; etag: string }>,
  ): Promise<void> {
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: storageKey,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p) => ({
          PartNumber: p.partNumber,
          ETag: p.etag,
        })),
      },
    });
    await this.s3Client.send(command);
  }

  /**
   * Aborts an active multipart upload.
   */
  async abortMultipartUpload(storageKey: string, uploadId: string): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: storageKey,
      UploadId: uploadId,
    });
    await this.s3Client.send(command);
  }

  /**
   * Generates a presigned GET URL for downloading a file.
   */
  async getDownloadUrl(
    storageKey: string,
    expiresInSeconds = 300,
    originalName?: string | null,
  ): Promise<string> {
    const contentDisposition = originalName
      ? `attachment; filename="${encodeURIComponent(originalName)}"`
      : undefined;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ResponseContentDisposition: contentDisposition,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Inspects uploaded object in S3: computes sha256 checksum and sniffs magic bytes.
   */
  async inspectUploadedObject(
    storageKey: string,
    declaredMimeType: string,
  ): Promise<UploadInspectionResult> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });
    const response = await this.s3Client.send(command);
    if (!response.Body) {
      throw new Error(`Object body is empty for key: ${storageKey}`);
    }

    const hash = createHash('sha256');
    let totalBytes = 0;
    const headerChunks: Buffer[] = [];
    let headerBytes = 0;

    const stream = response.Body as Readable;
    for await (const chunk of stream) {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += bufferChunk.length;
      hash.update(bufferChunk);

      if (headerBytes < 4096) {
        headerChunks.push(bufferChunk);
        headerBytes += bufferChunk.length;
      }
    }

    const headerBuffer = Buffer.concat(headerChunks);
    const sniffedMimeType = sniffMimeType(headerBuffer);
    const isValidMimeType = isMimeTypeCompatible(sniffedMimeType, declaredMimeType);

    return {
      sizeBytes: totalBytes,
      sha256: hash.digest('hex'),
      sniffedMimeType,
      isValidMimeType,
    };
  }

  /**
   * Reads an object from S3 and returns its contents as a Buffer.
   */
  async getObjectBuffer(storageKey: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });
    const response = await this.s3Client.send(command);
    if (!response.Body) {
      throw new Error(`Object body is empty for key: ${storageKey}`);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /**
   * Deletes an object from S3.
   */
  async deleteObject(storageKey: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });
      await this.s3Client.send(command);
    } catch (err) {
      this.logger.warn(`Failed to delete object ${storageKey}: ${(err as Error).message}`);
    }
  }

  /**
   * Checks if an object exists in S3.
   */
  async objectExists(storageKey: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });
      await this.s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}
