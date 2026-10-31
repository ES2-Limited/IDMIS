import { Inject, Injectable, Optional } from '@nestjs/common';
import { EncryptionService as SharedEncryptionService } from '@idmis/db/security';
import { validateApiEnv, type ApiEnv } from '../config/env';

@Injectable()
export class EncryptionService extends SharedEncryptionService {
  constructor(@Optional() @Inject('API_ENV') customEnv?: ApiEnv) {
    const env = customEnv || validateApiEnv();
    super({
      encryptionKey: env.ENCRYPTION_KEY,
      encryptionKeys: env.ENCRYPTION_KEYS,
      nodeEnv: env.NODE_ENV,
    });
  }
}
