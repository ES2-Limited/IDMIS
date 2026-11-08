import { Inject, Injectable, Optional } from '@nestjs/common';
import { IdentityHashService as SharedIdentityHashService } from '@idmis/db/security';
import { validateApiEnv, type ApiEnv } from '../config/env';

@Injectable()
export class IdentityHashService extends SharedIdentityHashService {
  constructor(@Optional() @Inject('API_ENV') customEnv?: ApiEnv) {
    const env = customEnv || validateApiEnv();
    super({
      identityHashKey: env.IDENTITY_HASH_KEY,
      identityHashKeys: env.IDENTITY_HASH_KEYS,
      nodeEnv: env.NODE_ENV,
    });
  }
}
