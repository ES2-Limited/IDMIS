import { Injectable } from '@nestjs/common';
import {
  permissions,
  ORGANISATION_IMPORT_DEFINITION,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import { organisation, organisationState, state, wua, eq, and, isNull, sql } from '@idmis/db';
import { generateDeterministicId } from '@idmis/db';
import type {
  ImportDatasetHandler,
  ImportBatchEntity,
  ParseRowResult,
  CommitRowResult,
  UndoRowResult,
} from './import-handler.interface';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class OrganisationImportHandler implements ImportDatasetHandler {
  readonly dataset = 'organisation';
  readonly version = ORGANISATION_IMPORT_DEFINITION.version;
  readonly permission = permissions.CORE_ORGANISATION_MANAGE;
  readonly columns: ImportColumnDefinition[] = ORGANISATION_IMPORT_DEFINITION.columns;

  private batchOrgs = new Map<string, Map<string, { type: string; code: string }>>();

  getExampleRow(): Record<string, unknown> {
    return {
      code: 'KRIS',
      name: 'Kano River Irrigation Scheme',
      type: 'scheme',
      parent_code: 'HJRBDA',
      state_codes: 'KN',
      short_name: 'KRIS',
      irrigable_area_ha: 15000,
    };
  }

  async parseRow(
    rawRow: Record<string, unknown>,
    ctx?: { batch: ImportBatchEntity; authz?: UserAuthz },
  ): Promise<ParseRowResult> {
    const rawData: Record<string, unknown> = { ...rawRow };
    const parsedData: Record<string, unknown> = { ...rawRow };
    const errors: Array<{ column: string; message: string; code?: string }> = [];

    const batchId = ctx?.batch?.id || 'default';
    if (!this.batchOrgs.has(batchId)) {
      this.batchOrgs.set(batchId, new Map());
    }

    const code = String(rawData.code || '')
      .trim()
      .toUpperCase();
    if (!code) {
      errors.push({ column: 'code', message: 'Organisation Code is required' });
    } else {
      parsedData.code = code;
    }

    const name = String(rawData.name || '').trim();
    if (!name) {
      errors.push({ column: 'name', message: 'Organisation Name is required' });
    } else {
      parsedData.name = name;
    }

    const type = String(rawData.type || '')
      .trim()
      .toLowerCase();
    if (!['rbda', 'scheme', 'sector'].includes(type)) {
      errors.push({
        column: 'type',
        message: "Type must be one of 'rbda', 'scheme', or 'sector'",
      });
    } else {
      parsedData.type = type;
      if (code) {
        this.batchOrgs.get(batchId)!.set(code, { type, code });
      }
    }
    parsedData._batchId = batchId;

    if (rawData.parent_code || rawData.parentCode) {
      parsedData.parent_code = String(rawData.parent_code || rawData.parentCode)
        .trim()
        .toUpperCase();
    } else {
      parsedData.parent_code = null;
    }

    if (rawData.state_codes || rawData.stateCodes) {
      parsedData.state_codes = String(rawData.state_codes || rawData.stateCodes).trim();
    } else {
      parsedData.state_codes = null;
    }

    if (rawData.short_name || rawData.shortName) {
      parsedData.short_name = String(rawData.short_name || rawData.shortName).trim();
    }

    if (rawData.address) parsedData.address = String(rawData.address).trim();
    if (rawData.phone) parsedData.phone = String(rawData.phone).trim();
    if (rawData.email) parsedData.email = String(rawData.email).trim();

    const areaVal = rawData.irrigable_area_ha ?? rawData.irrigableAreaHa;
    if (areaVal !== undefined && areaVal !== null && String(areaVal).trim() !== '') {
      const parsedNum = Number(areaVal);
      if (isNaN(parsedNum) || parsedNum < 0) {
        errors.push({
          column: 'irrigable_area_ha',
          message: 'Irrigable Area must be a positive number',
        });
      } else {
        parsedData.irrigable_area_ha = parsedNum;
      }
    }

    return { rawData, parsedData, errors };
  }

  async validateRow(
    row: {
      rowNumber: number;
      rawData: Record<string, unknown>;
      parsedData: Record<string, unknown>;
    },
    scope: RequestScope,
    tx: TransactionClient,
  ): Promise<Array<{ column: string; message: string; code?: string }>> {
    const errors: Array<{ column: string; message: string; code?: string }> = [];
    const type = String(row.parsedData.type || '').toLowerCase();
    const parentCode = row.parsedData.parent_code
      ? String(row.parsedData.parent_code).toUpperCase()
      : null;
    const stateCodesRaw = row.parsedData.state_codes ? String(row.parsedData.state_codes) : null;
    const batchId = (row.parsedData._batchId as string) || 'default';
    const inBatchParent = parentCode ? this.batchOrgs.get(batchId)?.get(parentCode) : null;

    // 1. Parent Rules Enforcement: (scheme -> rbda, sector -> scheme)
    if (type === 'scheme') {
      if (!parentCode) {
        errors.push({
          column: 'parent_code',
          message: "Parent organisation code is required for scheme (must reference an 'rbda')",
        });
      } else {
        const [parentOrg] = await tx
          .select({ id: organisation.id, type: organisation.type, code: organisation.code })
          .from(organisation)
          .where(
            and(eq(sql`UPPER(${organisation.code})`, parentCode), isNull(organisation.deletedAt)),
          )
          .limit(1);

        if (!parentOrg && !inBatchParent) {
          errors.push({
            column: 'parent_code',
            message: `Referenced parent organisation '${parentCode}' does not exist`,
          });
        } else if (parentOrg && parentOrg.type !== 'rbda') {
          errors.push({
            column: 'parent_code',
            message: `Parent organisation for a scheme must have type 'rbda' (found '${parentOrg.type}')`,
          });
        } else if (!parentOrg && inBatchParent && inBatchParent.type !== 'rbda') {
          errors.push({
            column: 'parent_code',
            message: `Parent organisation for a scheme must have type 'rbda' (found '${inBatchParent.type}')`,
          });
        } else if (parentOrg) {
          row.parsedData.parentId = parentOrg.id;
        }
      }
    } else if (type === 'sector') {
      if (!parentCode) {
        errors.push({
          column: 'parent_code',
          message: "Parent organisation code is required for sector (must reference a 'scheme')",
        });
      } else {
        const [parentOrg] = await tx
          .select({ id: organisation.id, type: organisation.type, code: organisation.code })
          .from(organisation)
          .where(
            and(eq(sql`UPPER(${organisation.code})`, parentCode), isNull(organisation.deletedAt)),
          )
          .limit(1);

        if (!parentOrg && !inBatchParent) {
          errors.push({
            column: 'parent_code',
            message: `Referenced parent organisation '${parentCode}' does not exist`,
          });
        } else if (parentOrg && parentOrg.type !== 'scheme') {
          errors.push({
            column: 'parent_code',
            message: `Parent organisation for a sector must have type 'scheme' (found '${parentOrg.type}')`,
          });
        } else if (!parentOrg && inBatchParent && inBatchParent.type !== 'scheme') {
          errors.push({
            column: 'parent_code',
            message: `Parent organisation for a sector must have type 'scheme' (found '${inBatchParent.type}')`,
          });
        } else if (parentOrg) {
          row.parsedData.parentId = parentOrg.id;
        }
      }
    } else if (type === 'rbda') {
      // Top-level organisation; optional parent
      if (parentCode) {
        const [parentOrg] = await tx
          .select({ id: organisation.id, type: organisation.type })
          .from(organisation)
          .where(
            and(eq(sql`UPPER(${organisation.code})`, parentCode), isNull(organisation.deletedAt)),
          )
          .limit(1);

        if (!parentOrg) {
          errors.push({
            column: 'parent_code',
            message: `Referenced parent organisation '${parentCode}' does not exist`,
          });
        } else {
          row.parsedData.parentId = parentOrg.id;
        }
      } else {
        row.parsedData.parentId = null;
      }
    }

    // 2. State Codes Validation
    const stateIds: string[] = [];
    if (stateCodesRaw) {
      const splitCodes = stateCodesRaw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      for (const sc of splitCodes) {
        const [st] = await tx
          .select({ id: state.id })
          .from(state)
          .where(eq(sql`UPPER(${state.code})`, sc))
          .limit(1);

        if (!st) {
          errors.push({
            column: 'state_codes',
            message: `Referenced State Code '${sc}' does not exist`,
          });
        } else {
          stateIds.push(st.id);
        }
      }
    }
    row.parsedData.stateIds = stateIds;

    // 3. Scope Checks
    if (!scope.isNational) {
      if (type === 'rbda') {
        errors.push({
          column: 'code',
          message: 'RBDA organisations require national administrative scope',
          code: 'out_of_scope',
        });
      } else if (type === 'scheme') {
        const allowedState = stateIds.some((sId) => scope.stateIds?.includes(sId));
        const allowedRbda =
          row.parsedData.parentId && scope.rbdaIds?.includes(row.parsedData.parentId as string);
        if (!allowedState && !allowedRbda) {
          errors.push({
            column: 'code',
            message: 'Target location is outside your assigned scope',
            code: 'out_of_scope',
          });
        }
      } else if (type === 'sector') {
        const allowedScheme =
          row.parsedData.parentId && scope.schemeIds?.includes(row.parsedData.parentId as string);
        const allowedState = stateIds.some((sId) => scope.stateIds?.includes(sId));
        if (!allowedScheme && !allowedState) {
          errors.push({
            column: 'code',
            message: 'Target location is outside your assigned scope',
            code: 'out_of_scope',
          });
        }
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    return String(parsedData.code || '')
      .trim()
      .toUpperCase();
  }

  async commitRow(
    row: {
      id: string;
      rowNumber: number;
      rawData: Record<string, unknown>;
      parsedData: Record<string, unknown>;
      batchId: string;
    },
    authz: UserAuthz,
    tx: TransactionClient,
  ): Promise<CommitRowResult> {
    const data = row.parsedData;
    const code = String(data.code).trim().toUpperCase();
    const name = String(data.name).trim();
    const type = String(data.type).toLowerCase() as 'rbda' | 'scheme' | 'sector';
    let parentId = (data.parentId as string) || null;
    if (!parentId && data.parent_code) {
      const pCode = String(data.parent_code).trim().toUpperCase();
      const [parentOrg] = await tx
        .select({ id: organisation.id })
        .from(organisation)
        .where(and(eq(sql`UPPER(${organisation.code})`, pCode), isNull(organisation.deletedAt)))
        .limit(1);
      if (parentOrg) {
        parentId = parentOrg.id;
      }
    }
    const shortName = data.short_name ? String(data.short_name) : null;
    const address = data.address ? String(data.address) : null;
    const phone = data.phone ? String(data.phone) : null;
    const email = data.email ? String(data.email) : null;
    const irrigableAreaHa =
      data.irrigable_area_ha !== undefined &&
      data.irrigable_area_ha !== null &&
      data.irrigable_area_ha !== ''
        ? String(data.irrigable_area_ha)
        : null;
    const stateIds = (data.stateIds as string[]) || [];

    const [existing] = await tx
      .select()
      .from(organisation)
      .where(and(eq(organisation.code, code), isNull(organisation.deletedAt)))
      .limit(1);

    let targetEntityId: string;
    let beforeImage: Record<string, unknown> | null = null;

    if (existing) {
      // Fetch existing state associations for beforeImage
      const existingStates = await tx
        .select({ stateId: organisationState.stateId })
        .from(organisationState)
        .where(eq(organisationState.organisationId, existing.id));

      beforeImage = {
        id: existing.id,
        code: existing.code,
        name: existing.name,
        type: existing.type,
        parentId: existing.parentId,
        shortName: existing.shortName,
        address: existing.address,
        phone: existing.phone,
        email: existing.email,
        irrigableAreaHa: existing.irrigableAreaHa,
        stateIds: existingStates.map((s) => s.stateId),
        version: existing.version,
      };

      await tx
        .update(organisation)
        .set({
          name,
          type,
          parentId,
          shortName: shortName ?? existing.shortName,
          address: address ?? existing.address,
          phone: phone ?? existing.phone,
          email: email ?? existing.email,
          irrigableAreaHa: irrigableAreaHa ?? existing.irrigableAreaHa,
          updatedBy: authz.userId,
          updatedAt: new Date().toISOString(),
          version: existing.version + 1,
        })
        .where(eq(organisation.id, existing.id));

      targetEntityId = existing.id;
    } else {
      targetEntityId = generateDeterministicId('organisation', code);

      await tx.insert(organisation).values({
        id: targetEntityId,
        code,
        name,
        type,
        parentId: parentId || null,
        shortName: shortName || null,
        address: address || null,
        phone: phone || null,
        email: email || null,
        irrigableAreaHa: irrigableAreaHa || null,
        createdBy: authz.userId,
        updatedBy: authz.userId,
      });
    }

    // Upsert organisation_state associations if provided
    if (stateIds.length > 0) {
      await tx
        .delete(organisationState)
        .where(eq(organisationState.organisationId, targetEntityId));

      for (const stateId of stateIds) {
        await tx.insert(organisationState).values({
          organisationId: targetEntityId,
          stateId,
        });
      }
    }

    return { targetEntityId, beforeImage };
  }

  async undoRow(
    row: {
      id: string;
      rowNumber: number;
      targetEntityId: string;
      beforeImage: Record<string, unknown> | null;
      parsedData?: unknown;
    },
    authz: UserAuthz,
    tx: TransactionClient,
  ): Promise<UndoRowResult> {
    const [current] = await tx
      .select()
      .from(organisation)
      .where(and(eq(organisation.id, row.targetEntityId), isNull(organisation.deletedAt)))
      .limit(1);

    if (!current) {
      return {
        skipped: true,
        reason: 'Record no longer exists or was already deleted',
      };
    }

    if (row.beforeImage) {
      const prev = row.beforeImage as Record<string, unknown>;
      await tx
        .update(organisation)
        .set({
          name: prev.name as string,
          type: prev.type as 'rbda' | 'scheme' | 'sector',
          parentId: (prev.parentId as string) || null,
          shortName: (prev.shortName as string) || null,
          address: (prev.address as string) || null,
          phone: (prev.phone as string) || null,
          email: (prev.email as string) || null,
          irrigableAreaHa: (prev.irrigableAreaHa as string) || null,
          updatedBy: authz.userId,
          updatedAt: new Date().toISOString(),
          version: current.version + 1,
        })
        .where(eq(organisation.id, row.targetEntityId));

      // Restore states
      const prevStates = (prev.stateIds as string[]) || [];
      await tx
        .delete(organisationState)
        .where(eq(organisationState.organisationId, row.targetEntityId));

      for (const stId of prevStates) {
        await tx.insert(organisationState).values({
          organisationId: row.targetEntityId,
          stateId: stId,
        });
      }

      return { skipped: false };
    } else {
      // Check for child organisations
      const [childOrg] = await tx
        .select({ id: organisation.id })
        .from(organisation)
        .where(and(eq(organisation.parentId, row.targetEntityId), isNull(organisation.deletedAt)))
        .limit(1);

      if (childOrg) {
        return {
          skipped: true,
          reason: 'Organisation cannot be undone because child organisations reference it',
        };
      }

      // Check for child WUAs
      const [childWua] = await tx
        .select({ id: wua.id })
        .from(wua)
        .where(and(eq(wua.organisationId, row.targetEntityId), isNull(wua.deletedAt)))
        .limit(1);

      if (childWua) {
        return {
          skipped: true,
          reason: 'Organisation cannot be undone because existing WUAs reference it',
        };
      }

      await tx
        .update(organisation)
        .set({
          deletedAt: new Date().toISOString(),
          updatedBy: authz.userId,
        })
        .where(eq(organisation.id, row.targetEntityId));

      return { skipped: false };
    }
  }
}
