import { Injectable } from '@nestjs/common';
import {
  db,
  damSafetyInspection,
  damComponentCondition,
  dam,
  basin,
  lookupValue,
  mvDamStatus,
  eq,
  and,
  isNull,
  sql,
  type SQL,
  inArray,
  desc,
} from '@idmis/db';
import type { RequestScope, ListDamInspectionsQuery, MvDamStatus } from '@idmis/contracts';
import type { DatabaseOrTx } from '../../core/repositories/file.repository';
import { txStorage } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';

export interface CreateDamInspectionData {
  id?: string;
  damId: string;
  inspectedOn: string;
  nextDueOn?: string | null;
  hazardClassId?: string | null;
  specificHazards?: string | null;
  safetyContact?: string | null;
  staffOnSite?: number | null;
  staffQualifications?: string | null;
  safetyBudgetNgn?: string | null;
  meetsStandard: boolean;
  status: 'submitted' | 'approved' | 'returned';
  submittedBy?: string | null;
  submittedAt?: string | null;
  createdBy: string;
}

export interface UpdateDamInspectionData {
  inspectedOn?: string;
  nextDueOn?: string | null;
  hazardClassId?: string | null;
  specificHazards?: string | null;
  safetyContact?: string | null;
  staffOnSite?: number | null;
  staffQualifications?: string | null;
  safetyBudgetNgn?: string | null;
  meetsStandard?: boolean;
  status?: 'submitted' | 'approved' | 'returned';
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  returnedBy?: string | null;
  returnedAt?: string | null;
  returnComment?: string | null;
  updatedBy: string;
}

export interface ComponentConditionData {
  component:
    'dam_body' | 'spillway_1' | 'spillway_2' | 'inlet' | 'outlet' | 'electrical' | 'mechanical';
  ratingId: string;
  notes?: string | null;
}

@Injectable()
export class DamInspectionRepository {
  private getDb(txDb?: DatabaseOrTx): DatabaseOrTx {
    return txDb ?? (txStorage.getStore() as unknown as DatabaseOrTx) ?? db;
  }

  private buildScopeCondition(scope: RequestScope): SQL {
    if (scope.isNational) {
      return sql`1 = 1`;
    }
    const conditions: SQL[] = [];
    if (scope.rbdaIds && scope.rbdaIds.length > 0) {
      conditions.push(
        inArray(
          dam.basinId,
          db
            .select({ id: basin.id })
            .from(basin)
            .where(and(inArray(basin.rbdaId, scope.rbdaIds), isNull(basin.deletedAt))),
        ),
      );
    }
    if (scope.stateIds && scope.stateIds.length > 0) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM core.lga l
          WHERE l.id = ${dam.lgaId}
            AND l.state_id = ANY(ARRAY[${sql.join(
              scope.stateIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )}])
        )`,
      );
    }
    return conditions.length > 0 ? sql`(${sql.join(conditions, sql` OR `)})` : sql`1 = 0`;
  }

  async findById(id: string, scope?: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [
      eq(damSafetyInspection.id, id),
      isNull(damSafetyInspection.deletedAt),
    ];

    if (scope && !scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    const [row] = await client
      .select({
        id: damSafetyInspection.id,
        damId: damSafetyInspection.damId,
        damName: dam.name,
        damCode: dam.code,
        basinId: dam.basinId,
        inspectedOn: damSafetyInspection.inspectedOn,
        nextDueOn: damSafetyInspection.nextDueOn,
        hazardClassId: damSafetyInspection.hazardClassId,
        hazardClass: lookupValue.label,
        specificHazards: damSafetyInspection.specificHazards,
        safetyContact: damSafetyInspection.safetyContact,
        staffOnSite: damSafetyInspection.staffOnSite,
        staffQualifications: damSafetyInspection.staffQualifications,
        safetyBudgetNgn: damSafetyInspection.safetyBudgetNgn,
        meetsStandard: damSafetyInspection.meetsStandard,
        status: damSafetyInspection.status,
        submittedBy: damSafetyInspection.submittedBy,
        submittedAt: damSafetyInspection.submittedAt,
        approvedBy: damSafetyInspection.approvedBy,
        approvedAt: damSafetyInspection.approvedAt,
        returnedBy: damSafetyInspection.returnedBy,
        returnedAt: damSafetyInspection.returnedAt,
        returnComment: damSafetyInspection.returnComment,
        createdAt: damSafetyInspection.createdAt,
        createdBy: damSafetyInspection.createdBy,
        updatedAt: damSafetyInspection.updatedAt,
        updatedBy: damSafetyInspection.updatedBy,
        version: damSafetyInspection.version,
      })
      .from(damSafetyInspection)
      .innerJoin(dam, eq(dam.id, damSafetyInspection.damId))
      .leftJoin(lookupValue, eq(lookupValue.id, damSafetyInspection.hazardClassId))
      .where(and(...conditions))
      .limit(1);

    return row ?? null;
  }

  async findComponents(inspectionId: string, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    return client
      .select({
        inspectionId: damComponentCondition.inspectionId,
        component: damComponentCondition.component,
        ratingId: damComponentCondition.ratingId,
        ratingCode: lookupValue.code,
        ratingLabel: lookupValue.label,
        notes: damComponentCondition.notes,
      })
      .from(damComponentCondition)
      .leftJoin(lookupValue, eq(lookupValue.id, damComponentCondition.ratingId))
      .where(eq(damComponentCondition.inspectionId, inspectionId));
  }

  async create(
    data: CreateDamInspectionData,
    components?: ComponentConditionData[],
    txDb?: DatabaseOrTx,
  ) {
    const client = this.getDb(txDb);
    const now = new Date().toISOString();

    const [row] = await client
      .insert(damSafetyInspection)
      .values({
        id: data.id ?? crypto.randomUUID(),
        damId: data.damId,
        inspectedOn: data.inspectedOn,
        nextDueOn: data.nextDueOn ?? null,
        hazardClassId: data.hazardClassId ?? null,
        specificHazards: data.specificHazards ?? null,
        safetyContact: data.safetyContact ?? null,
        staffOnSite: data.staffOnSite ?? null,
        staffQualifications: data.staffQualifications ?? null,
        safetyBudgetNgn: data.safetyBudgetNgn ?? null,
        meetsStandard: data.meetsStandard,
        status: data.status,
        submittedBy: data.submittedBy ?? null,
        submittedAt: data.submittedAt ?? null,
        createdAt: now,
        createdBy: data.createdBy,
        updatedAt: now,
        updatedBy: data.createdBy,
        version: 1,
      })
      .returning();

    if (components && components.length > 0) {
      await client.insert(damComponentCondition).values(
        components.map((c) => ({
          inspectionId: row.id,
          component: c.component,
          ratingId: c.ratingId,
          notes: c.notes ?? null,
        })),
      );
    }

    return row;
  }

  async update(
    id: string,
    version: number,
    data: UpdateDamInspectionData,
    components?: ComponentConditionData[],
    txDb?: DatabaseOrTx,
  ) {
    const client = this.getDb(txDb);
    const now = new Date().toISOString();

    const updatePayload: Record<string, unknown> = {
      ...data,
      updatedAt: now,
      version: version + 1,
    };

    const [updated] = await client
      .update(damSafetyInspection)
      .set(updatePayload)
      .where(
        and(
          eq(damSafetyInspection.id, id),
          eq(damSafetyInspection.version, version),
          isNull(damSafetyInspection.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      const current = await this.findById(id, undefined, txDb);
      throw new ConflictProblemException({
        detail: 'Optimistic concurrency conflict on dam inspection update',
        current,
        currentVersion: current?.version ?? 0,
      });
    }

    if (components !== undefined) {
      // Replace component conditions
      await client.delete(damComponentCondition).where(eq(damComponentCondition.inspectionId, id));

      if (components.length > 0) {
        await client.insert(damComponentCondition).values(
          components.map((c) => ({
            inspectionId: id,
            component: c.component,
            ratingId: c.ratingId,
            notes: c.notes ?? null,
          })),
        );
      }
    }

    return updated;
  }

  async list(query: ListDamInspectionsQuery, scope: RequestScope, txDb?: DatabaseOrTx) {
    const client = this.getDb(txDb);
    const conditions: SQL[] = [isNull(damSafetyInspection.deletedAt)];

    if (!scope.isNational) {
      conditions.push(this.buildScopeCondition(scope));
    }

    if (query.damId) {
      conditions.push(eq(damSafetyInspection.damId, query.damId));
    }

    if (query.status) {
      conditions.push(eq(damSafetyInspection.status, query.status));
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const [countRow] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(damSafetyInspection)
      .innerJoin(dam, eq(dam.id, damSafetyInspection.damId))
      .where(and(...conditions));

    const total = countRow?.count ?? 0;

    const items = await client
      .select({
        id: damSafetyInspection.id,
        damId: damSafetyInspection.damId,
        damName: dam.name,
        damCode: dam.code,
        basinId: dam.basinId,
        inspectedOn: damSafetyInspection.inspectedOn,
        nextDueOn: damSafetyInspection.nextDueOn,
        hazardClassId: damSafetyInspection.hazardClassId,
        hazardClass: lookupValue.label,
        specificHazards: damSafetyInspection.specificHazards,
        safetyContact: damSafetyInspection.safetyContact,
        staffOnSite: damSafetyInspection.staffOnSite,
        staffQualifications: damSafetyInspection.staffQualifications,
        safetyBudgetNgn: damSafetyInspection.safetyBudgetNgn,
        meetsStandard: damSafetyInspection.meetsStandard,
        status: damSafetyInspection.status,
        submittedBy: damSafetyInspection.submittedBy,
        submittedAt: damSafetyInspection.submittedAt,
        approvedBy: damSafetyInspection.approvedBy,
        approvedAt: damSafetyInspection.approvedAt,
        returnedBy: damSafetyInspection.returnedBy,
        returnedAt: damSafetyInspection.returnedAt,
        returnComment: damSafetyInspection.returnComment,
        createdAt: damSafetyInspection.createdAt,
        createdBy: damSafetyInspection.createdBy,
        updatedAt: damSafetyInspection.updatedAt,
        updatedBy: damSafetyInspection.updatedBy,
        version: damSafetyInspection.version,
      })
      .from(damSafetyInspection)
      .innerJoin(dam, eq(dam.id, damSafetyInspection.damId))
      .leftJoin(lookupValue, eq(lookupValue.id, damSafetyInspection.hazardClassId))
      .where(and(...conditions))
      .orderBy(desc(damSafetyInspection.inspectedOn), desc(damSafetyInspection.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async refreshMvDamStatus(txDb?: DatabaseOrTx): Promise<void> {
    const client = this.getDb(txDb);
    await client.execute(sql`SELECT blis.refresh_mv_dam_status()`);
  }

  async getLatestDamStatus(damId: string, txDb?: DatabaseOrTx): Promise<MvDamStatus | null> {
    const client = this.getDb(txDb);
    const [row] = await client
      .select({
        damId: mvDamStatus.damId,
        inspectionId: mvDamStatus.inspectionId,
        inspectedOn: mvDamStatus.inspectedOn,
        meetsStandard: mvDamStatus.meetsStandard,
        hazardClassId: mvDamStatus.hazardClassId,
        hazardClass: mvDamStatus.hazardClass,
        nextDueOn: mvDamStatus.nextDueOn,
        approvedAt: mvDamStatus.approvedAt,
        isOverdue: sql<boolean>`COALESCE(${mvDamStatus.nextDueOn} < (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Lagos')::date, false)`,
      })
      .from(mvDamStatus)
      .where(eq(mvDamStatus.damId, damId));

    if (!row) return null;
    return {
      ...row,
      isOverdue: Boolean(row.isOverdue),
    };
  }
}
