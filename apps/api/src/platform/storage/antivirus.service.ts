import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from './storage.service';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

export interface ScanResult {
  scanStatus: 'clean' | 'infected' | 'failed';
  virusDetails?: string | null;
}

const EICAR_SIGNATURE = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!';

@Injectable()
export class AntivirusService {
  private readonly logger = new Logger(AntivirusService.name);

  constructor(private readonly storageService: StorageService) {}

  /**
   * Scans an uploaded file in storage.
   * In Phase 0-3 this is a stub scanner detecting the industry-standard EICAR test signature.
   * Full ClamAV daemon integration connects in Phase 5.
   */
  async scanFile(storageKey: string): Promise<ScanResult> {
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
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buffer);
        totalBytes += buffer.length;

        // Don't buffer more than 2MB for the stub EICAR scan
        if (totalBytes > 2 * 1024 * 1024) break;
      }

      const sample = Buffer.concat(chunks).toString('utf-8');
      if (sample.includes(EICAR_SIGNATURE)) {
        this.logger.warn(`Infected file detected: ${storageKey} matches EICAR signature`);
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
}
