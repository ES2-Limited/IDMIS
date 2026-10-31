import { Injectable } from '@nestjs/common';
import {
  permissions,
  SLIS_IMPORT_TEMPLATES,
  type ImportColumnDefinition,
  type RequestScope,
} from '@idmis/contracts';
import {
  farmer,
  farmerIdentity,
  organisation,
  organisationState,
  ward,
  lookupValue,
  eq,
  and,
  isNull,
} from '@idmis/db';
import type {
  ImportDatasetHandler,
  ImportBatchEntity,
  ParseRowResult,
  CommitRowResult,
  UndoRowResult,
} from '../../core/imports/import-handler.interface';
import { FarmerService } from '../services/farmer.service';
import { EncryptionService } from '../../../platform/security/encryption.service';
import { IdentityHashService } from '../../../platform/security/identity-hash.service';
import type { TransactionClient } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class FarmerImportHandler implements ImportDatasetHandler {
  readonly dataset = 'slis.farmer';
  readonly version = 1;
  readonly permission = permissions.SLIS_FARMER_CREATE;
  readonly columns: ImportColumnDefinition[] = SLIS_IMPORT_TEMPLATES['slis.farmer'];

  private readonly seenNumberHashes = new Map<string, Set<string>>();

  constructor(
    private readonly farmerService: FarmerService,
    private readonly encryptionService: EncryptionService,
    private readonly identityHashService: IdentityHashService,
  ) {}

  getExampleRow(): Record<string, unknown> {
    return {
      farmerCode: 'KRIS-SEC1-001',
      firstName: 'Ibrahim',
      lastName: 'Musa',
      otherNames: 'Aliyu',
      gender: 'male',
      birthYear: 1985,
      phone: '+2348031234567',
      village: 'Kadawa',
      wardCode: 'KDW-01',
      sectorCode: 'SEC-A',
      documentTypeKey: 'nin',
      identityNumber: '12345678901',
      bankName: 'First Bank',
    };
  }

  async parseRow(
    rawRow: Record<string, unknown>,
    _ctx: { batch: ImportBatchEntity; authz?: UserAuthz },
  ): Promise<ParseRowResult> {
    const rawData: Record<string, unknown> = { ...rawRow };
    const parsedData: Record<string, unknown> = { ...rawRow };
    const errors: Array<{ column: string; message: string; code?: string }> = [];

    if (_ctx.batch?.schemeId && !parsedData.schemeId) {
      parsedData.schemeId = _ctx.batch.schemeId;
    }
    if (_ctx.batch?.stateId && !parsedData.stateId) {
      parsedData.stateId = _ctx.batch.stateId;
    }

    // Privacy-preserving identity number processing:
    // Replace raw plaintext identity number BEFORE storing rawData or parsedData!
    if (rawData.identityNumber) {
      const idNumStr = String(rawData.identityNumber).trim();
      delete rawData.identityNumber;
      delete parsedData.identityNumber;

      if (idNumStr) {
        const numberEnc = this.encryptionService.encrypt(idNumStr).toString('hex');
        const numberHash = this.identityHashService.hash(idNumStr);
        const numberLast4 = this.identityHashService.last4(idNumStr);

        rawData.identityMasked = `***${numberLast4}`;
        parsedData.identityEncrypted = {
          numberEnc,
          numberHash,
          numberLast4,
          documentTypeKey: rawRow.documentTypeKey ? String(rawRow.documentTypeKey).trim() : 'nin',
          bankName: rawRow.bankName ? String(rawRow.bankName).trim() : null,
        };

        // File-level duplicate check for identity number
        const batchId = _ctx?.batch?.id || 'default';
        let batchSet = this.seenNumberHashes.get(batchId);
        if (!batchSet) {
          batchSet = new Set<string>();
          this.seenNumberHashes.set(batchId, batchSet);
        }

        if (batchSet.has(numberHash)) {
          errors.push({
            column: 'identityNumber',
            message: 'Duplicate identity document number found in the same file',
            code: 'DUPLICATE_IDENTITY_NUMBER',
          });
        } else {
          batchSet.add(numberHash);
        }
      }
    }

    const farmerCode = String(rawData.farmerCode || '').trim();
    if (!farmerCode) {
      errors.push({ column: 'farmerCode', message: 'Farmer code is required' });
    } else {
      parsedData.farmerCode = farmerCode;
    }

    const firstName = String(rawData.firstName || '').trim();
    if (!firstName) {
      errors.push({ column: 'firstName', message: 'First name is required' });
    } else {
      parsedData.firstName = firstName;
    }

    const lastName = String(rawData.lastName || '').trim();
    if (!lastName) {
      errors.push({ column: 'lastName', message: 'Last name is required' });
    } else {
      parsedData.lastName = lastName;
    }

    const gender = String(rawData.gender || '')
      .trim()
      .toLowerCase();
    if (!['female', 'male'].includes(gender)) {
      errors.push({
        column: 'gender',
        message: "Gender must be either 'female' or 'male'",
      });
    } else {
      parsedData.gender = gender;
    }

    if (rawData.birthYear) {
      const year = Number(rawData.birthYear);
      if (isNaN(year) || year < 1900 || year > new Date().getFullYear()) {
        errors.push({ column: 'birthYear', message: 'Invalid birth year' });
      } else {
        parsedData.birthYear = year;
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
    const data = row.parsedData;

    // Check DB duplicate for identity number
    const idEnc = data.identityEncrypted as
      { numberHash: string; documentTypeKey: string } | undefined;
    if (idEnc?.numberHash) {
      const [existingId] = await tx
        .select({ id: farmerIdentity.id })
        .from(farmerIdentity)
        .where(
          and(eq(farmerIdentity.numberHash, idEnc.numberHash), isNull(farmerIdentity.deletedAt)),
        )
        .limit(1);

      if (existingId) {
        errors.push({
          column: 'identityNumber',
          message: 'Identity document number already registered in database',
          code: 'DUPLICATE_IDENTITY_NUMBER',
        });
      }
    }

    // Resolve scheme
    const schemeCode = data.schemeCode ? String(data.schemeCode).trim().toUpperCase() : null;
    let schemeId = schemeCode ? undefined : (data.schemeId as string | undefined);

    if (schemeCode) {
      const [foundScheme] = await tx
        .select({ id: organisation.id, stateId: organisationState.stateId })
        .from(organisation)
        .leftJoin(organisationState, eq(organisation.id, organisationState.organisationId))
        .where(and(eq(organisation.code, schemeCode), isNull(organisation.deletedAt)))
        .limit(1);

      if (!foundScheme) {
        errors.push({
          column: 'schemeCode',
          message: `Referenced Scheme Code '${schemeCode}' does not exist`,
        });
      } else {
        schemeId = foundScheme.id;
        data.schemeId = foundScheme.id;
        data.stateId = foundScheme.stateId;
      }
    } else if (schemeId && !data.stateId) {
      const [link] = await tx
        .select({ stateId: organisationState.stateId })
        .from(organisationState)
        .where(eq(organisationState.organisationId, schemeId))
        .limit(1);
      data.stateId = link?.stateId ?? null;
    }

    // Two-gate Scope Check (Gate 1: Validation)
    if (schemeId && !scope.isNational) {
      const rowStateId = data.stateId as string | null;
      const stateMatch = rowStateId && scope.stateIds?.includes(rowStateId);
      const schemeMatch = scope.schemeIds?.includes(schemeId);
      if (!stateMatch && !schemeMatch) {
        errors.push({
          column: 'schemeCode',
          message: 'Target location is outside your assigned scope',
          code: 'out_of_scope',
        });
      }
    }

    // Resolve sector if given
    if (data.sectorCode && schemeId) {
      const sectorCode = String(data.sectorCode).trim().toUpperCase();
      const [foundSector] = await tx
        .select({ id: organisation.id })
        .from(organisation)
        .where(
          and(
            eq(organisation.parentId, schemeId),
            eq(organisation.code, sectorCode),
            isNull(organisation.deletedAt),
          ),
        )
        .limit(1);

      if (foundSector) {
        data.sectorId = foundSector.id;
      }
    }

    // Resolve ward if given
    if (data.wardCode) {
      const wardCode = String(data.wardCode).trim().toUpperCase();
      const [foundWard] = await tx
        .select({ id: ward.id })
        .from(ward)
        .where(eq(ward.code, wardCode))
        .limit(1);

      if (foundWard) {
        data.wardId = foundWard.id;
      }
    }

    return errors;
  }

  naturalKey(parsedData: Record<string, unknown>): string {
    const schemeCode = String(parsedData.schemeCode || parsedData.schemeId || '').toUpperCase();
    const farmerCode = String(parsedData.farmerCode || '').trim();
    return `${schemeCode}#${farmerCode}`;
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
    const schemeId = (data.schemeId as string) || (data.organisationId as string);

    // Document type resolution for identity
    let documentTypeId: string | undefined;
    const idEnc = data.identityEncrypted as
      | {
          numberEnc: string;
          numberHash: string;
          numberLast4: string;
          documentTypeKey: string;
          bankName: string | null;
        }
      | undefined;

    if (idEnc) {
      const [docType] = await tx
        .select({ id: lookupValue.id })
        .from(lookupValue)
        .where(eq(lookupValue.code, idEnc.documentTypeKey))
        .limit(1);
      documentTypeId = docType?.id;
    }

    const identitiesInput =
      idEnc && documentTypeId
        ? [
            {
              documentTypeId,
              number: this.encryptionService.decrypt(Buffer.from(idEnc.numberEnc, 'hex')),
              bankName: idEnc.bankName ?? undefined,
            },
          ]
        : [];

    const createdFarmer = await this.farmerService.createFarmer(
      {
        schemeId,
        sectorId: (data.sectorId as string) || undefined,
        farmerCode: String(data.farmerCode),
        firstName: String(data.firstName),
        lastName: String(data.lastName),
        otherNames: data.otherNames ? String(data.otherNames) : undefined,
        gender: data.gender as 'female' | 'male',
        birthYear: data.birthYear ? Number(data.birthYear) : undefined,
        phone: data.phone ? String(data.phone) : undefined,
        village: data.village ? String(data.village) : undefined,
        wardId: (data.wardId as string) || undefined,
        identities: identitiesInput.length > 0 ? identitiesInput : undefined,
        status: 'submitted',
        importBatchId: row.batchId,
        submittedBy: authz.userId,
        submittedAt: new Date().toISOString(),
      } as Parameters<typeof this.farmerService.createFarmer>[0],
      authz,
      authz.userId,
    );

    return { targetEntityId: createdFarmer.id, beforeImage: null };
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
      .from(farmer)
      .where(and(eq(farmer.id, row.targetEntityId), isNull(farmer.deletedAt)))
      .limit(1);

    if (!current) {
      return { skipped: true, reason: 'Record no longer exists or was already deleted' };
    }

    if (current.status === 'approved') {
      return { skipped: true, reason: 'Record has already been approved' };
    }

    if (current.version !== 1) {
      return {
        skipped: true,
        reason: 'Record version mismatch: record was modified after import (undo_skipped_modified)',
      };
    }

    // Soft delete farmer identities
    await tx
      .update(farmerIdentity)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(farmerIdentity.farmerId, row.targetEntityId));

    // Soft delete farmer
    await tx
      .update(farmer)
      .set({
        deletedAt: new Date().toISOString(),
        updatedBy: authz.userId,
      })
      .where(eq(farmer.id, row.targetEntityId));

    return { skipped: false };
  }
}
