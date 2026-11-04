import { Injectable } from '@nestjs/common';
import {
  db,
  indicatorValue,
  indicatorValueEvidence,
  file,
  SYSTEM_USER_ID,
  eq,
  and,
  isNull,
  sql,
  type SQL,
  desc,
} from '@idmis/db';
import type { RequestScope, ListIndicatorValuesQuery } from '@idmis/contracts';
import { applyScope } from '../../../platform/auth';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';

export interface CreateIndicatorValueData {
  id?: string;
  indicatorId: string;
  periodYear: number;
  periodQuarter?: number | null;
  scopeType: 'national' | 'state' | 'scheme' | 'rbda' | 'sector';
  scopeStateId?: string | null;
  scopeOrgId?: string | null;
  disaggregation?: Record<string, unknown>;
  value: string;
  source: 'manual' | 'computed' | 'import';
  computedAt?: string | null;
  notes?: string | null;
  status?: string;
  submittedBy?: string | null;
  submittedAt?: string | null;
  importBatchId?: string | null;
  createdBy?: string;
}

export interface UpdateIndicatorValueData {
  value?: string;
  notes?: string | null;
  disaggregation?: Record<string, unknown>;
  status?: string;
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  returnedBy?: string | null;
  returnedAt?: string | null;
  returnComment?: string | null;
  updatedBy?: string;
}

@Injectable()
export class IndicatorValueRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  async findById(id: string, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [eq(indicatorValue.id, id), isNull(indicatorValue.deletedAt)];

    if (scope) {
      const scopeCond = applyScope(scope, {
        state: indicatorValue.scopeStateId,
        scheme: indicatorValue.scopeOrgId,
      });
      if (scopeCond) {
        conditions.push(scopeCond);
      }
    }

    const [row] = await client
      .select()
      .from(indicatorValue)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async findBySlot(
    indicatorId: string,
    periodYear: number,
    periodQuarter: number | null,
    scopeType: string,
    scopeStateId: string | null,
    scopeOrgId: string | null,
    disaggregation: Record<string, unknown> = {},
    txDb?: DatabaseOrTx,
  ) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [
      eq(indicatorValue.indicatorId, indicatorId),
      eq(indicatorValue.periodYear, periodYear),
      periodQuarter !== null && periodQuarter !== undefined
        ? eq(indicatorValue.periodQuarter, periodQuarter)
        : isNull(indicatorValue.periodQuarter),
      eq(
        indicatorValue.scopeType,
        scopeType as 'national' | 'state' | 'scheme' | 'rbda' | 'sector',
      ),
      scopeStateId
        ? eq(indicatorValue.scopeStateId, scopeStateId)
        : isNull(indicatorValue.scopeStateId),
      scopeOrgId ? eq(indicatorValue.scopeOrgId, scopeOrgId) : isNull(indicatorValue.scopeOrgId),
      sql`${indicatorValue.disaggregation} = ${JSON.stringify(disaggregation)}::jsonb`,
      isNull(indicatorValue.deletedAt),
    ];

    const [row] = await client
      .select()
      .from(indicatorValue)
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async listValues(
    scope: RequestScope,
    filters: Partial<ListIndicatorValuesQuery> = {},
    txDb?: DatabaseOrTx,
  ) {
    const client = this.getDb(txDb);
    const limit = Math.min(filters.limit ?? 50, 100);
    const conditions: SQL[] = [isNull(indicatorValue.deletedAt)];

    const scopeCond = applyScope(scope, {
      state: indicatorValue.scopeStateId,
      scheme: indicatorValue.scopeOrgId,
    });
    if (scopeCond) {
      conditions.push(scopeCond);
    }

    if (filters.indicatorId) {
      conditions.push(eq(indicatorValue.indicatorId, filters.indicatorId));
    }
    if (filters.periodYear) {
      conditions.push(eq(indicatorValue.periodYear, filters.periodYear));
    }
    if (filters.periodQuarter !== undefined) {
      conditions.push(eq(indicatorValue.periodQuarter, filters.periodQuarter));
    }
    if (filters.status) {
      conditions.push(eq(indicatorValue.status, filters.status));
    }
    if (filters.scopeType) {
      conditions.push(eq(indicatorValue.scopeType, filters.scopeType));
    }

    return client
      .select()
      .from(indicatorValue)
      .where(and(...conditions))
      .orderBy(desc(indicatorValue.periodYear), indicatorValue.createdAt)
      .limit(limit);
  }

  async create(data: CreateIndicatorValueData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [row] = await client
      .insert(indicatorValue)
      .values({
        id: data.id ?? crypto.randomUUID(),
        indicatorId: data.indicatorId,
        periodYear: data.periodYear,
        periodQuarter: data.periodQuarter ?? null,
        scopeType: data.scopeType,
        scopeStateId: data.scopeStateId ?? null,
        scopeOrgId: data.scopeOrgId ?? null,
        disaggregation: data.disaggregation ?? {},
        value: data.value,
        source: data.source,
        computedAt: data.computedAt ?? null,
        notes: data.notes ?? null,
        status: data.status ?? 'draft',
        submittedBy: data.submittedBy ?? null,
        submittedAt: data.submittedAt ?? null,
        importBatchId: data.importBatchId ?? null,
        createdBy: data.createdBy ?? SYSTEM_USER_ID,
        updatedBy: data.createdBy ?? SYSTEM_USER_ID,
      })
      .returning();

    return row!;
  }

  async update(
    id: string,
    expectedVersion: number,
    data: UpdateIndicatorValueData,
    txDb?: DatabaseOrTx,
  ) {
    const client = this.getDb(txDb);
    const updatePayload: Record<string, unknown> = {
      version: sql`${indicatorValue.version} + 1`,
      updatedBy: data.updatedBy,
      updatedAt: new Date().toISOString(),
    };

    if (data.value !== undefined) updatePayload.value = data.value;
    if (data.notes !== undefined) updatePayload.notes = data.notes;
    if (data.disaggregation !== undefined) updatePayload.disaggregation = data.disaggregation;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.submittedBy !== undefined) updatePayload.submittedBy = data.submittedBy;
    if (data.submittedAt !== undefined) updatePayload.submittedAt = data.submittedAt;
    if (data.approvedBy !== undefined) updatePayload.approvedBy = data.approvedBy;
    if (data.approvedAt !== undefined) updatePayload.approvedAt = data.approvedAt;
    if (data.returnedBy !== undefined) updatePayload.returnedBy = data.returnedBy;
    if (data.returnedAt !== undefined) updatePayload.returnedAt = data.returnedAt;
    if (data.returnComment !== undefined) updatePayload.returnComment = data.returnComment;

    const [updated] = await client
      .update(indicatorValue)
      .set(updatePayload)
      .where(
        and(
          eq(indicatorValue.id, id),
          eq(indicatorValue.version, expectedVersion),
          isNull(indicatorValue.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      const existing = await client
        .select()
        .from(indicatorValue)
        .where(eq(indicatorValue.id, id))
        .limit(1);
      throw new ConflictProblemException({
        detail: 'Indicator value version mismatch or record not found',
        current: existing[0] ?? null,
        currentVersion: existing[0]?.version ?? 0,
      });
    }

    return updated;
  }

  async softDelete(id: string, deletedBy?: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const [deleted] = await client
      .update(indicatorValue)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: deletedBy,
      })
      .where(and(eq(indicatorValue.id, id), isNull(indicatorValue.deletedAt)))
      .returning();

    return deleted ?? null;
  }

  async attachEvidence(valueId: string, fileId: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    await client
      .insert(indicatorValueEvidence)
      .values({
        indicatorValueId: valueId,
        fileId,
      })
      .onConflictDoNothing();

    await client
      .update(file)
      .set({
        ownerEntity: 'me.indicator_value',
        ownerId: valueId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(file.id, fileId));
  }

  async removeEvidence(valueId: string, fileId: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    await client
      .delete(indicatorValueEvidence)
      .where(
        and(
          eq(indicatorValueEvidence.indicatorValueId, valueId),
          eq(indicatorValueEvidence.fileId, fileId),
        ),
      );
  }

  async listEvidence(valueId: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    return client
      .select({
        fileId: file.id,
        storageKey: file.storageKey,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        scanStatus: file.scanStatus,
        createdAt: file.createdAt,
      })
      .from(indicatorValueEvidence)
      .innerJoin(file, eq(indicatorValueEvidence.fileId, file.id))
      .where(and(eq(indicatorValueEvidence.indicatorValueId, valueId), isNull(file.deletedAt)));
  }

  async upsertComputedSlot(data: CreateIndicatorValueData, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const existing = await this.findBySlot(
      data.indicatorId,
      data.periodYear,
      data.periodQuarter ?? null,
      data.scopeType,
      data.scopeStateId ?? null,
      data.scopeOrgId ?? null,
      data.disaggregation ?? {},
      txDb,
    );

    if (existing) {
      // Golden rule: A computed value never overwrites a manual indicator's value
      if (existing.source !== 'computed') {
        return existing;
      }

      const [updated] = await client
        .update(indicatorValue)
        .set({
          value: data.value,
          status: 'approved',
          computedAt: data.computedAt ?? new Date().toISOString(),
          version: sql`${indicatorValue.version} + 1`,
          updatedAt: new Date().toISOString(),
          updatedBy: SYSTEM_USER_ID,
          deletedAt: null,
        })
        .where(eq(indicatorValue.id, existing.id))
        .returning();
      return updated!;
    }

    const [created] = await client
      .insert(indicatorValue)
      .values({
        id: data.id ?? crypto.randomUUID(),
        indicatorId: data.indicatorId,
        periodYear: data.periodYear,
        periodQuarter: data.periodQuarter ?? null,
        scopeType: data.scopeType,
        scopeStateId: data.scopeStateId ?? null,
        scopeOrgId: data.scopeOrgId ?? null,
        disaggregation: data.disaggregation ?? {},
        value: data.value,
        source: 'computed',
        status: 'approved',
        computedAt: data.computedAt ?? new Date().toISOString(),
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .returning();
    return created!;
  }

  async deleteComputedSlot(
    indicatorId: string,
    periodYear: number,
    periodQuarter: number | null,
    scopeType: string,
    scopeStateId: string | null,
    scopeOrgId: string | null,
    disaggregation: Record<string, unknown> = {},
    txDb?: DatabaseOrTx,
  ) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [
      eq(indicatorValue.indicatorId, indicatorId),
      eq(indicatorValue.periodYear, periodYear),
      periodQuarter !== null && periodQuarter !== undefined
        ? eq(indicatorValue.periodQuarter, periodQuarter)
        : isNull(indicatorValue.periodQuarter),
      eq(
        indicatorValue.scopeType,
        scopeType as 'national' | 'state' | 'scheme' | 'rbda' | 'sector',
      ),
      scopeStateId
        ? eq(indicatorValue.scopeStateId, scopeStateId)
        : isNull(indicatorValue.scopeStateId),
      scopeOrgId ? eq(indicatorValue.scopeOrgId, scopeOrgId) : isNull(indicatorValue.scopeOrgId),
      sql`${indicatorValue.disaggregation} = ${JSON.stringify(disaggregation)}::jsonb`,
      eq(indicatorValue.source, 'computed'),
    ];

    return client.delete(indicatorValue).where(and(...conditions));
  }
}
