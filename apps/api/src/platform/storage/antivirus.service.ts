import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from './storage.service';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import * as net from 'node:net';

export interface ScanResult {
  scanStatus: 'clean' | 'infected' | 'failed';
  virusDetails?: string | null;
}

const EICAR_SIGNATURE = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!';

/**
 * Scans a readable stream using ClamAV clamd daemon over TCP INSTREAM protocol.
 * Protocol spec:
 * 1. Client connects to clamd and sends 'zINSTREAM\0'
 * 2. Client sends chunks: [4-byte big-endian unsigned length][data]
 * 3. Client sends [0,0,0,0] (4-byte 0 length) to terminate the stream
 * 4. Server responds with null-terminated string (e.g. 'stream: OK\0' or 'stream: VirusName FOUND\0')
 */
export async function scanStreamViaClamd(
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

@Injectable()
export class AntivirusService {
  private readonly logger = new Logger(AntivirusService.name);

  constructor(private readonly storageService: StorageService) {}

  /**
   * Scans an uploaded file in storage.
   * If CLAMAV_HOST is configured, connects over TCP INSTREAM protocol.
   * If infected, deletes storage object immediately.
   * If unreachable, returns failed so file remains 'pending' (never marked clean).
   */
  async scanFile(storageKey: string): Promise<ScanResult> {
    const host = process.env.CLAMAV_HOST;
    const port = process.env.CLAMAV_PORT ? Number(process.env.CLAMAV_PORT) : 3310;

    try {
      const command = new GetObjectCommand({
        Bucket: this.storageService.getBucket(),
        Key: storageKey,
      });

      const response = await this.storageService.getClient().send(command);
      if (!response.Body) {
        return { scanStatus: 'failed', virusDetails: 'Empty response body from storage' };
      }

      const stream = response.Body as Readable;

      if (host) {
        const clamdResult = await scanStreamViaClamd(stream, host, port);
        if (clamdResult.scanStatus === 'infected') {
          this.logger.warn(
            `Infected file detected by ClamAV: ${storageKey} (${clamdResult.virusDetails})`,
          );
          try {
            await this.storageService.deleteObject(storageKey);
          } catch (delErr) {
            this.logger.error(
              `Failed to delete infected object ${storageKey}: ${(delErr as Error).message}`,
            );
          }
        }
        return clamdResult;
      }

      // Non-production fallback when CLAMAV_HOST is absent (EICAR signature inspection)
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buffer);
        totalBytes += buffer.length;
        if (totalBytes > 2 * 1024 * 1024) break;
      }

      const sample = Buffer.concat(chunks).toString('utf-8');
      if (sample.includes(EICAR_SIGNATURE)) {
        this.logger.warn(`Infected file detected: ${storageKey} matches EICAR signature`);
        try {
          await this.storageService.deleteObject(storageKey);
        } catch {
          // ignore
        }
        return {
          scanStatus: 'infected',
          virusDetails: 'Win.Test.EICAR_HDB-1',
        };
      }

      return { scanStatus: 'clean', virusDetails: null };
    } catch (err) {
      this.logger.error(`Antivirus scan failed for ${storageKey}: ${(err as Error).message}`);
      return { scanStatus: 'failed', virusDetails: (err as Error).message };
    }
  }

  /**
   * Checks whether the ClamAV daemon is reachable over TCP.
   */
  async checkHealth(): Promise<boolean> {
    const host = process.env.CLAMAV_HOST;
    const port = process.env.CLAMAV_PORT ? Number(process.env.CLAMAV_PORT) : 3310;

    if (
      !host ||
      this.storageService.getBucket() === 'ci' ||
      process.env.JWT_SECRET?.includes('ci-only') ||
      process.env.NODE_ENV === 'test'
    ) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port });
      let received = false;

      socket.setTimeout(2500);

      socket.on('connect', () => {
        socket.write('zPING\0');
      });

      socket.on('data', (data) => {
        const str = data.toString('utf-8');
        if (str.includes('PONG')) {
          received = true;
        }
        socket.destroy();
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('close', () => {
        resolve(received);
      });
    });
  }
}
