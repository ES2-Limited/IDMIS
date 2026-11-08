import { Injectable } from '@nestjs/common';
import { db, mvIndicatorMatrix, eq, and, sql, type SQL } from '@idmis/db';
import type { RequestScope, GetIndicatorMatrixQuery } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';

@Injectable()
export class IndicatorMatrixRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  async getMatrix(query: GetIndicatorMatrixQuery, scope: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [];

    // Apply user scope
    const scopeCond = applyScope(scope, {
      state: mvIndicatorMatrix.scopeStateId,
      scheme: mvIndicatorMatrix.scopeOrgId,
    });
    if (scopeCond) {
      conditions.push(scopeCond);
    }

    if (query.year !== undefined) {
      conditions.push(eq(mvIndicatorMatrix.periodYear, query.year));
    }
    if (query.quarter !== undefined) {
      conditions.push(eq(mvIndicatorMatrix.periodQuarter, query.quarter));
    }
    if (query.scopeType !== undefined) {
      conditions.push(eq(mvIndicatorMatrix.scopeType, query.scopeType));
    }
    if (query.scopeId !== undefined) {
      if (query.scopeType === 'state') {
        conditions.push(eq(mvIndicatorMatrix.scopeStateId, query.scopeId));
      } else if (query.scopeType === 'scheme') {
        conditions.push(eq(mvIndicatorMatrix.scopeOrgId, query.scopeId));
      }
    }

    const rows = await client
      .select({
        indicatorId: mvIndicatorMatrix.indicatorId,
        indicatorCode: mvIndicatorMatrix.indicatorCode,
        indicatorName: mvIndicatorMatrix.indicatorName,
        periodYear: mvIndicatorMatrix.periodYear,
        periodQuarter: mvIndicatorMatrix.periodQuarter,
        scopeType: mvIndicatorMatrix.scopeType,
        scopeStateId: mvIndicatorMatrix.scopeStateId,
        scopeOrgId: mvIndicatorMatrix.scopeOrgId,
        disaggregation: mvIndicatorMatrix.disaggregation,
        target: mvIndicatorMatrix.target,
        endTarget: mvIndicatorMatrix.endTarget,
        value: mvIndicatorMatrix.value,
        status: mvIndicatorMatrix.status,
        message: mvIndicatorMatrix.message,
        pctOfEndTarget: mvIndicatorMatrix.pctOfEndTarget,
        computedAt: mvIndicatorMatrix.computedAt,
      })
      .from(mvIndicatorMatrix)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        mvIndicatorMatrix.indicatorCode,
        mvIndicatorMatrix.periodYear,
        mvIndicatorMatrix.periodQuarter,
      );

    return {
      items: rows.map((r) => ({
        ...r,
        disaggregation: (r.disaggregation as Record<string, string>) ?? {},
      })),
      total: rows.length,
    };
  }

  async refreshMatrix(txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    await client.execute(sql`SELECT me.refresh_mv_indicator_matrix();`);
  }

  async getLastRefreshedAt(txDb?: DatabaseOrTx): Promise<string | null> {
    const client = this.getDb(txDb);
    const [row] = await client
      .select({ computedAt: sql<string | null>`max(${mvIndicatorMatrix.computedAt})` })
      .from(mvIndicatorMatrix);
    return row?.computedAt ? String(row.computedAt) : null;
  }
}
