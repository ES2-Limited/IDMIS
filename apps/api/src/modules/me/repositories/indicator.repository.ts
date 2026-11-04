import { Injectable } from '@nestjs/common';
import { db, indicator, eq, and, isNull } from '@idmis/db';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';

@Injectable()
export class IndicatorRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  async findById(id: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .select()
      .from(indicator)
      .where(and(eq(indicator.id, id), isNull(indicator.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async findByCode(code: string, frameworkId?: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions = [eq(indicator.code, code), isNull(indicator.deletedAt)];
    if (frameworkId) {
      conditions.push(eq(indicator.frameworkId, frameworkId));
    }
    const [row] = await client
      .select()
      .from(indicator)
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  }

  async listIndicators(frameworkId?: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions = [isNull(indicator.deletedAt)];
    if (frameworkId) {
      conditions.push(eq(indicator.frameworkId, frameworkId));
    }
    return client
      .select()
      .from(indicator)
      .where(and(...conditions))
      .orderBy(indicator.code);
  }
}
