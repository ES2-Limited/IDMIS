import { Module, OnModuleInit, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { getActiveAuditWriter } from '../database/transaction.helper';
import { initAuditWriter } from './audit-writer';

@Module({})
export class AuditModule implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(AuditModule.name);

  onModuleInit() {
    initAuditWriter();
    this.logger.log('Persistent database audit writer registered successfully.');
  }

  onApplicationBootstrap() {
    const isProduction = process.env.NODE_ENV === 'production';
    const writer = getActiveAuditWriter();

    if (!writer && isProduction) {
      throw new Error(
        '[AuditModuleError] No audit writer registered on application bootstrap in production environment.',
      );
    }
  }
}
