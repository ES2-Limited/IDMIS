import { Injectable } from '@nestjs/common';
import { db, computeResult, eq, and, isNull, sql, type SQL } from '@idmis/db';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';

export interface InsertComputeResultData {
  id?: string;
  indicatorId: string;
  periodYear: number;
  periodQuarter: number;
  scopeType: 'national' | 'state' | 'scheme' | 'rbda' | 'sector';
  scopeStateId?: string | null;
  scopeOrgId?: string | null;
  disaggregation?: Record<string, unknown>;
  status: 'computed' | 'not_available' | 'error';
  message?: string | null;
  computedAt?: string;
}

@Injectable()
export class ComputeResultRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  async findBySlot(
    indicatorId: string,
    periodYear: number,
    periodQuarter: number,
    scopeType: string,
    scopeStateId: string | null,
    scopeOrgId: string | null,
    disaggregation: Record<string, unknown> = {},
    txDb?: DatabaseOrTx,
  ) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [
      eq(computeResult.indicatorId, indicatorId),
      eq(computeResult.periodYear, periodYear),
      eq(computeResult.periodQuarter, periodQuarter),
      eq(computeResult.scopeType, scopeType as 'national' | 'state' | 'scheme' | 'rbda' | 'sector'),
      scopeStateId
        ? eq(computeResult.scopeStateId, scopeStateId)
        : isNull(computeResult.scopeStateId),
      scopeOrgId ? eq(computeResult.scopeOrgId, scopeOrgId) : isNull(computeResult.scopeOrgId),
      sql`${computeResult.disaggregation} = ${JSON.stringify(disaggregation)}::jsonb`,
    ];

    const [row] = await client
      .select()
      .from(computeResult)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async upsert(data: InsertComputeResultData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const existing = await this.findBySlot(
      data.indicatorId,
      data.periodYear,
      data.periodQuarter,
      data.scopeType,
      data.scopeStateId ?? null,
      data.scopeOrgId ?? null,
      data.disaggregation ?? {},
      txDb,
    );

    const now = new Date().toISOString();

    if (existing) {
      const [updated] = await client
        .update(computeResult)
        .set({
          status: data.status,
          message: data.message ?? null,
          computedAt: data.computedAt ?? now,
          updatedAt: now,
        })
        .where(eq(computeResult.id, existing.id))
        .returning();
      return updated!;
    }

    const [inserted] = await client
      .insert(computeResult)
      .values({
        id: data.id ?? crypto.randomUUID(),
        indicatorId: data.indicatorId,
        periodYear: data.periodYear,
        periodQuarter: data.periodQuarter,
        scopeType: data.scopeType,
        scopeStateId: data.scopeStateId ?? null,
        scopeOrgId: data.scopeOrgId ?? null,
        disaggregation: data.disaggregation ?? {},
        status: data.status,
        message: data.message ?? null,
        computedAt: data.computedAt ?? now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return inserted!;
  }
}
