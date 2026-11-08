import * as net from 'node:net';
import { Readable } from 'node:stream';
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { db as defaultDb, file, auditLog, eq } from '@idmis/db';
import type { SubscriberRegistry } from '../dispatcher/registry';
import { getWorkerS3Config } from '../config/storage';

const EICAR_SIGNATURE = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!';

export interface FileUploadedPayload {
  fileId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  ownerEntity?: string | null;
  ownerId?: string | null;
  uploadedBy?: string;
}

export function scanStreamViaClamd(
  stream: Readable,
  host: string,
  port: number,
  timeoutMs = 15000,
): Promise<{ scanStatus: 'clean' | 'infected'; virusDetails?: string | null }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = '';
    let isConnected = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      isConnected = true;
      socket.write('zINSTREAM\0');

      stream.on('data', (chunk: Buffer | Uint8Array) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(buf.length, 0);
        socket.write(lenBuf);
        socket.write(buf);
      });

      stream.on('end', () => {
        const zeroBuf = Buffer.alloc(4);
        socket.write(zeroBuf);
      });

      stream.on('error', (err) => {
        socket.destroy();
        reject(err);
      });
    });

    socket.on('data', (data) => {
      response += data.toString('utf-8');
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('ClamAV TCP connection timed out'));
    });

    socket.on('error', (err) => {
      if (!isConnected) {
        reject(new Error(`Failed to connect to ClamAV daemon at ${host}:${port}: ${err.message}`));
      } else {
        reject(err);
      }
    });

    socket.on('close', () => {
      const trimmed = response.trim().replace(/\0$/, '');
      if (trimmed.endsWith('OK')) {
        resolve({ scanStatus: 'clean', virusDetails: null });
      } else if (trimmed.includes('FOUND')) {
        const match = trimmed.match(/stream:\s*(.+)\s+FOUND/i);
        const virusName = match ? match[1].trim() : 'Infected';
        resolve({ scanStatus: 'infected', virusDetails: virusName });
      } else if (trimmed.includes('ERROR')) {
        reject(new Error(`ClamAV error: ${trimmed}`));
      } else if (trimmed.length === 0) {
        reject(new Error('ClamAV closed connection with empty response'));
      } else {
        reject(new Error(`Unexpected ClamAV response: ${trimmed}`));
      }
    });
  });
}

export function registerFileScanSubscribers(
  registry: SubscriberRegistry,
  dbClient = defaultDb,
): void {
  registry.register<FileUploadedPayload>(
    'core.file.uploaded',
    'clamav-file-scanner',
    async (payload) => {
      const { fileId, storageKey } = payload;

      // 1. Fetch file record from DB
      const [existingFile] = await dbClient.select().from(file).where(eq(file.id, fileId)).limit(1);

      if (!existingFile) {
        console.warn(`[FileScanSubscriber] File ${fileId} not found in database, skipping scan.`);
        return;
      }

      // If already scanned, skip
      if (existingFile.scanStatus === 'clean' || existingFile.scanStatus === 'infected') {
        return;
      }

      // 2. Fetch file from S3
      const { s3Client, bucket } = getWorkerS3Config();
      const getCmd = new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
      });

      const response = await s3Client.send(getCmd);
      if (!response.Body) {
        throw new Error(`Empty body for file ${storageKey} in S3`);
      }

      const stream = response.Body as Readable;

      const host = process.env.CLAMAV_HOST;
      const port = process.env.CLAMAV_PORT ? Number(process.env.CLAMAV_PORT) : 3310;

      let scanResult: { scanStatus: 'clean' | 'infected'; virusDetails?: string | null };

      if (host) {
        // clamd TCP scan (will throw if clamd unreachable -> retried with backoff)
        scanResult = await scanStreamViaClamd(stream, host, port);
      } else {
        // Non-production fallback (EICAR inspection)
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of stream) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(buf);
          total += buf.length;
          if (total > 2 * 1024 * 1024) break;
        }
        const sample = Buffer.concat(chunks).toString('utf-8');
        if (sample.includes(EICAR_SIGNATURE)) {
          scanResult = { scanStatus: 'infected', virusDetails: 'Win.Test.EICAR_HDB-1' };
        } else {
          scanResult = { scanStatus: 'clean', virusDetails: null };
        }
      }

      const now = new Date().toISOString();

      if (scanResult.scanStatus === 'infected') {
        // Infected -> storage object deleted, audited
        console.warn(
          `[FileScanSubscriber] File ${fileId} (${storageKey}) is INFECTED: ${scanResult.virusDetails}. Deleting from storage...`,
        );

        try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: storageKey,
            }),
          );
        } catch (delErr) {
          console.error(`[FileScanSubscriber] Failed to delete S3 object ${storageKey}:`, delErr);
        }

        await dbClient
          .update(file)
          .set({
            scanStatus: 'infected',
            updatedAt: now,
          })
          .where(eq(file.id, fileId));

        await dbClient.insert(auditLog).values({
          actorType: 'system',
          action: 'file.infected',
          entityType: 'core.file',
          entityId: fileId,
          changes: {
            after: {
              scanStatus: 'infected',
              virusDetails: scanResult.virusDetails,
            },
          },
          occurredAt: now,
        });
      } else {
        await dbClient
          .update(file)
          .set({
            scanStatus: 'clean',
            updatedAt: now,
          })
          .where(eq(file.id, fileId));

        await dbClient.insert(auditLog).values({
          actorType: 'system',
          action: 'file.scanned',
          entityType: 'core.file',
          entityId: fileId,
          changes: {
            after: {
              scanStatus: 'clean',
            },
          },
          occurredAt: now,
        });
      }
    },
  );
}
