import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CompleteUploadInput,
  InitiateUploadInput,
  InitiateUploadResponse,
} from '@idmis/contracts';
import { FileRepository } from '../repositories/file.repository';
import { StorageService } from '../../../platform/storage/storage.service';
import { AntivirusService } from '../../../platform/storage/antivirus.service';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';
import type { RequestScope } from '../../../platform/context';

const MULTIPART_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10MB
const PART_SIZE_BYTES = 5 * 1024 * 1024; // 5MB minimum S3 part size

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  constructor(
    private readonly fileRepo: FileRepository,
    private readonly storageService: StorageService,
    private readonly antivirusService: AntivirusService,
  ) {}

  /**
   * Initiates single-part or multipart upload. Storage key is strictly UUID-only.
   */
  async initiateUpload(
    input: InitiateUploadInput,
    userId: string,
  ): Promise<InitiateUploadResponse> {
    const fileId = randomUUID();
    // UUID-only storage key; user-supplied paths or names are strictly forbidden in S3 keys
    const storageKey = `files/${fileId}`;

    const isMultipart = input.sizeBytes > MULTIPART_THRESHOLD_BYTES;

    let uploadUrl: string | undefined;
    let uploadId: string | undefined;
    let parts: Array<{ partNumber: number; uploadUrl: string }> | undefined;
    let partSizeBytes: number | undefined;

    if (isMultipart) {
      uploadId = await this.storageService.initiateMultipartUpload(storageKey, input.mimeType);
      const partCount = Math.ceil(input.sizeBytes / PART_SIZE_BYTES);
      parts = await this.storageService.getMultipartUploadPartUrls(
        storageKey,
        uploadId,
        partCount,
        3600,
      );
      partSizeBytes = PART_SIZE_BYTES;
    } else {
      uploadUrl = await this.storageService.getSinglePartUploadUrl(storageKey, input.mimeType, 900);
    }

    // Persist pending file record in DB
    await runInTransaction(async (tx) => {
      await this.fileRepo.create(
        {
          id: fileId,
          storageKey,
          originalName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          sha256: input.sha256 ?? '0'.repeat(64),
          scanStatus: 'pending',
          ownerEntity: input.ownerEntity ?? null,
          ownerId: input.ownerId ?? null,
          createdBy: userId,
        },
        tx,
      );
    });

    return {
      fileId,
      storageKey,
      isMultipart,
      uploadUrl,
      uploadId,
      parts,
      partSizeBytes,
      expiresInSeconds: isMultipart ? 3600 : 900,
    };
  }

  /**
   * Completes an upload, performs server-side MIME sniffing, checksumming, and antivirus scanning.
   */
  async completeUpload(input: CompleteUploadInput, userId: string, scope?: RequestScope) {
    const existing = await this.fileRepo.findById(input.fileId, scope);
    if (!existing) {
      throw new NotFoundException(`File ${input.fileId} not found`);
    }

    // 1. If multipart, complete S3 multipart upload
    if (input.uploadId && input.parts && input.parts.length > 0) {
      await this.storageService.completeMultipartUpload(
        existing.storageKey,
        input.uploadId,
        input.parts,
      );
    }

    // 2. Server-side inspection: read stream, calculate sha256 and sniff magic bytes
    const inspection = await this.storageService.inspectUploadedObject(
      existing.storageKey,
      existing.mimeType,
    );

    if (!inspection.isValidMimeType) {
      // Abort / delete invalid payload
      await this.storageService.deleteObject(existing.storageKey);
      throw new UnprocessableEntityException(
        `File payload magic bytes do not match declared MIME type '${existing.mimeType}'. Detected: '${inspection.sniffedMimeType ?? 'unknown'}'`,
      );
    }

    // Verify SHA-256 if client provided one
    if (input.sha256 && input.sha256.toLowerCase() !== inspection.sha256.toLowerCase()) {
      await this.storageService.deleteObject(existing.storageKey);
      throw new BadRequestException('Client SHA-256 checksum does not match uploaded object');
    }

    // 3. Antivirus scan (stub scanner detecting EICAR, clean otherwise)
    const scanResult = await this.antivirusService.scanFile(existing.storageKey);

    // 4. Update file record inside transaction with audit log & outbox event
    const updated = await runInTransaction(
      async (tx) => {
        const fileRow = await this.fileRepo.update(
          existing.id,
          existing.version,
          {
            mimeType: inspection.sniffedMimeType ?? existing.mimeType,
            sizeBytes: inspection.sizeBytes,
            sha256: inspection.sha256,
            scanStatus: scanResult.scanStatus,
            updatedBy: userId,
          },
          tx,
        );

        // Outbox event: file uploaded
        await enqueueOutboxEvent(tx, {
          eventType: 'core.file.uploaded',
          aggregateType: 'file',
          aggregateId: fileRow.id,
          payload: {
            fileId: fileRow.id,
            storageKey: fileRow.storageKey,
            mimeType: fileRow.mimeType,
            sizeBytes: fileRow.sizeBytes,
            sha256: fileRow.sha256,
            ownerEntity: fileRow.ownerEntity,
            ownerId: fileRow.ownerId,
            uploadedBy: userId,
          },
        });

        // Outbox event: file scanned
        await enqueueOutboxEvent(tx, {
          eventType: 'core.file.scanned',
          aggregateType: 'file',
          aggregateId: fileRow.id,
          payload: {
            fileId: fileRow.id,
            scanStatus: scanResult.scanStatus,
            virusDetails: scanResult.virusDetails ?? null,
          },
        });

        return fileRow;
      },
      {
        audit: {
          actorType: 'user',
          actorUserId: userId,
          action: 'update',
          entity: 'core.file',
          entityId: existing.id,
          before: existing,
          after: {
            ...existing,
            mimeType: inspection.sniffedMimeType ?? existing.mimeType,
            sizeBytes: inspection.sizeBytes,
            sha256: inspection.sha256,
            scanStatus: scanResult.scanStatus,
          },
        },
      },
    );

    return updated;
  }

  /**
   * Generates a temporary presigned download URL for clean files.
   */
  async getDownloadUrl(
    fileId: string,
    scope?: RequestScope,
  ): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
    const fileRow = await this.fileRepo.findById(fileId, scope);
    if (!fileRow) {
      throw new NotFoundException(`File ${fileId} not found`);
    }

    if (fileRow.scanStatus === 'infected') {
      throw new ForbiddenException('Cannot download an infected file');
    }

    const expiresInSeconds = 300;
    const downloadUrl = await this.storageService.getDownloadUrl(
      fileRow.storageKey,
      expiresInSeconds,
      fileRow.originalName,
    );

    return { downloadUrl, expiresInSeconds };
  }

  /**
   * Retrieves file metadata.
   */
  async getFile(fileId: string, scope?: RequestScope) {
    const fileRow = await this.fileRepo.findById(fileId, scope);
    if (!fileRow) {
      throw new NotFoundException(`File ${fileId} not found`);
    }
    return fileRow;
  }

  /**
   * Deletes a file and cleans up S3 object.
   */
  async deleteFile(fileId: string, userId: string, scope?: RequestScope) {
    const existing = await this.fileRepo.findById(fileId, scope);
    if (!existing) {
      throw new NotFoundException(`File ${fileId} not found`);
    }

    await runInTransaction(
      async (tx) => {
        await this.fileRepo.softDelete(fileId, userId, tx);
        await this.storageService.deleteObject(existing.storageKey);

        await enqueueOutboxEvent(tx, {
          eventType: 'core.file.deleted',
          aggregateType: 'file',
          aggregateId: fileId,
          payload: {
            fileId,
            storageKey: existing.storageKey,
            deletedBy: userId,
          },
        });
      },
      {
        audit: {
          actorType: 'user',
          actorUserId: userId,
          action: 'delete',
          entity: 'core.file',
          entityId: fileId,
          before: existing,
          after: null,
        },
      },
    );

    return { success: true };
  }
}
