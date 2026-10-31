import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  db,
  exportJob,
  file,
  auditLog,
  farmer,
  farmerIdentity,
  plot,
  waterRequest,
  cropProduction,
  training,
  feeBilling,
  feeCollection,
  mvFarmersByScope,
  mvAreaByService,
  mvCropping,
  mvFeeRecovery,
  wua,
  and,
  eq,
  gt,
  gte,
  lte,
  isNull,
  type SQL,
} from '@idmis/db';
import { resolveUserAuthz, applyScope } from '@idmis/db/authz';
import { EncryptionService } from '@idmis/db/security';
import {
  permissions,
  sanitizeFormulaSafety,
  type Permission,
  type RecordStatus,
  type SlisGender,
  type ServiceType,
  type RequestLevel,
  type WaterDecision,
} from '@idmis/contracts';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getWorkerS3Config } from '../config/storage';

export interface SlisExportJobOptions {
  exportId: string;
  userId: string;
  dataset: string;
  filters?: Record<string, unknown>;
  s3Client?: S3Client;
  bucket?: string;
  dbClient?: typeof db;
}

export function getDatasetViewPermission(dataset: string): Permission {
  switch (dataset) {
    case 'farmers':
      return permissions.SLIS_FARMER_READ;
    case 'plots':
      return permissions.SLIS_PLOT_READ;
    case 'water_requests':
      return permissions.SLIS_WATER_REQUEST_READ;
    case 'crops':
    case 'crop_productions':
      return permissions.SLIS_CROP_MANAGE;
    case 'trainings':
      return permissions.SLIS_TRAINING_MANAGE;
    case 'fees':
    case 'fee_billings':
    case 'fee_collections':
      return permissions.SLIS_FEE_READ;
    case 'farmers_by_scope':
    case 'wua_summaries':
    case 'area_by_service':
    case 'cropping':
    case 'fee_recovery':
      return permissions.SLIS_REPORT_VIEW;
    default:
      return permissions.SLIS_REPORT_VIEW;
  }
}

export async function processSlisExportJob(options: SlisExportJobOptions) {
  const { exportId, userId, dataset, filters = {} } = options;
  const dbClient = options.dbClient ?? db;

  const s3Config = getWorkerS3Config();
  const bucket = options.bucket ?? s3Config.bucket;
  const s3Client = options.s3Client ?? s3Config.s3Client;

  // 1. Mark job processing
  await dbClient
    .update(exportJob)
    .set({ status: 'processing', updatedAt: new Date().toISOString() })
    .where(eq(exportJob.id, exportId));

  // 2. Re-resolve user authz fresh at run time
  const authz = await resolveUserAuthz(dbClient, userId);

  if (!authz.isActive || !authz.can(permissions.SLIS_EXPORT_GENERATE)) {
    const errorMsg = !authz.isActive
      ? 'Requesting user is deactivated or does not exist'
      : 'User lacks permission to generate exports';
    await dbClient
      .update(exportJob)
      .set({
        status: 'failed',
        errorMessage: errorMsg,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(exportJob.id, exportId));
    return { status: 'failed', reason: errorMsg };
  }

  // 3. Resolve dataset view permission and user's scope
  const viewPermission = getDatasetViewPermission(dataset);
  if (!authz.can(viewPermission)) {
    const errorMsg = `User lacks permission to view dataset: ${dataset}`;
    await dbClient
      .update(exportJob)
      .set({
        status: 'failed',
        errorMessage: errorMsg,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(exportJob.id, exportId));
    return { status: 'failed', reason: errorMsg };
  }

  const scope = authz.scopeFor(viewPermission);

  // Identity view scope for per-row unmasking
  const identityScope = authz.scopeFor(permissions.SLIS_IDENTITY_VIEW);
  const canUnmaskRow = (schemeId?: string | null, stateId?: string | null): boolean => {
    if (!authz.can(permissions.SLIS_IDENTITY_VIEW)) return false;
    if (identityScope.isNational) return true;
    if (schemeId && identityScope.schemeIds.includes(schemeId)) return true;
    if (stateId && identityScope.stateIds.includes(stateId)) return true;
    return false;
  };

  const encryptionService = new EncryptionService();

  // 4. Set up streaming XLSX writer
  const tmpFilePath = path.join(os.tmpdir(), `export_${exportId}.xlsx`);
  const writeStream = fs.createWriteStream(tmpFilePath);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: writeStream,
    useStyles: false,
    useSharedStrings: false,
  });
  const worksheet = workbook.addWorksheet('Data');

  let totalRowCount = 0;
  let peakHeapUsed = 0;

  try {
    if (dataset === 'farmers') {
      worksheet
        .addRow([
          'ID',
          'Farmer Code',
          'First Name',
          'Last Name',
          'Other Names',
          'Gender',
          'Birth Year',
          'Phone',
          'Village',
          'Identity Document',
          'Status',
        ])
        .commit();

      let lastSeenId: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const conds: SQL[] = [isNull(farmer.deletedAt)];
        const scopeCond = applyScope(scope, { scheme: farmer.schemeId, state: farmer.stateId });
        if (scopeCond) conds.push(scopeCond);
        if (lastSeenId) conds.push(gt(farmer.id, lastSeenId));

        if (filters.schemeId) conds.push(eq(farmer.schemeId, filters.schemeId as string));
        if (filters.sectorId) conds.push(eq(farmer.sectorId, filters.sectorId as string));
        if (filters.stateId) conds.push(eq(farmer.stateId, filters.stateId as string));
        if (filters.wardId) conds.push(eq(farmer.wardId, filters.wardId as string));
        if (filters.status) conds.push(eq(farmer.status, filters.status as RecordStatus));
        if (filters.gender) conds.push(eq(farmer.gender, filters.gender as SlisGender));
        if (filters.householdId) conds.push(eq(farmer.householdId, filters.householdId as string));
        if (filters.farmerGroupId)
          conds.push(eq(farmer.farmerGroupId, filters.farmerGroupId as string));
        if (filters.maritalStatusId)
          conds.push(eq(farmer.maritalStatusId, filters.maritalStatusId as string));

        const batch = await dbClient
          .select({
            id: farmer.id,
            schemeId: farmer.schemeId,
            stateId: farmer.stateId,
            farmerCode: farmer.farmerCode,
            firstName: farmer.firstName,
            lastName: farmer.lastName,
            otherNames: farmer.otherNames,
            gender: farmer.gender,
            birthYear: farmer.birthYear,
            phone: farmer.phone,
            village: farmer.village,
            status: farmer.status,
            docNumberEnc: farmerIdentity.numberEnc,
            docNumberLast4: farmerIdentity.numberLast4,
          })
          .from(farmer)
          .leftJoin(farmerIdentity, eq(farmer.id, farmerIdentity.farmerId))
          .where(and(...conds))
          .orderBy(farmer.id)
          .limit(2000);

        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        for (const f of batch) {
          totalRowCount++;
          let idDoc = '';
          if (f.docNumberLast4) {
            const unmask = canUnmaskRow(f.schemeId, f.stateId);
            if (unmask && f.docNumberEnc) {
              try {
                idDoc = encryptionService.decrypt(Buffer.from(f.docNumberEnc, 'hex'));
              } catch {
                idDoc = `***${f.docNumberLast4}`;
              }
            } else {
              idDoc = `***${f.docNumberLast4}`;
            }
          }

          worksheet
            .addRow([
              f.id,
              sanitizeFormulaSafety(f.farmerCode ?? ''),
              sanitizeFormulaSafety(f.firstName ?? ''),
              sanitizeFormulaSafety(f.lastName ?? ''),
              sanitizeFormulaSafety(f.otherNames ?? ''),
              f.gender,
              f.birthYear ?? '',
              sanitizeFormulaSafety(f.phone ?? ''),
              sanitizeFormulaSafety(f.village ?? ''),
              sanitizeFormulaSafety(idDoc),
              f.status,
            ])
            .commit();
        }

        lastSeenId = batch[batch.length - 1].id;
        if (batch.length < 2000) {
          hasMore = false;
        }

        const mem = process.memoryUsage().heapUsed;
        if (mem > peakHeapUsed) peakHeapUsed = mem;
      }
    } else if (dataset === 'plots') {
      worksheet
        .addRow([
          'ID',
          'Plot Code',
          'Scheme ID',
          'Sector ID',
          'Service Type',
          'Area (Ha)',
          'Status',
        ])
        .commit();

      let lastSeenId: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const conds: SQL[] = [isNull(plot.deletedAt)];
        const scopeCond = applyScope(scope, { scheme: plot.schemeId, state: plot.stateId });
        if (scopeCond) conds.push(scopeCond);
        if (lastSeenId) conds.push(gt(plot.id, lastSeenId));

        if (filters.schemeId) conds.push(eq(plot.schemeId, filters.schemeId as string));
        if (filters.farmId) conds.push(eq(plot.farmId, filters.farmId as string));
        if (filters.sectorId) conds.push(eq(plot.sectorId, filters.sectorId as string));
        if (filters.stateId) conds.push(eq(plot.stateId, filters.stateId as string));
        if (filters.wardId) conds.push(eq(plot.wardId, filters.wardId as string));
        if (filters.status) conds.push(eq(plot.status, filters.status as RecordStatus));
        if (filters.serviceType)
          conds.push(eq(plot.serviceType, filters.serviceType as ServiceType));

        const batch = await dbClient
          .select({
            id: plot.id,
            plotCode: plot.plotCode,
            schemeId: plot.schemeId,
            sectorId: plot.sectorId,
            serviceType: plot.serviceType,
            areaHa: plot.areaHa,
            status: plot.status,
          })
          .from(plot)
          .where(and(...conds))
          .orderBy(plot.id)
          .limit(2000);

        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        for (const p of batch) {
          totalRowCount++;
          worksheet
            .addRow([
              p.id,
              sanitizeFormulaSafety(p.plotCode),
              p.schemeId,
              p.sectorId,
              p.serviceType ?? '',
              p.areaHa ?? '',
              p.status,
            ])
            .commit();
        }

        lastSeenId = batch[batch.length - 1].id;
        if (batch.length < 2000) hasMore = false;

        const mem = process.memoryUsage().heapUsed;
        if (mem > peakHeapUsed) peakHeapUsed = mem;
      }
    } else if (dataset === 'water_requests') {
      worksheet
        .addRow([
          'ID',
          'Scheme ID',
          'Level',
          'WUA ID',
          'Farmer ID',
          'Season ID',
          'Volume (m3)',
          'Period From',
          'Period To',
          'Decision',
          'Status',
        ])
        .commit();

      let lastSeenId: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const conds: SQL[] = [isNull(waterRequest.deletedAt)];
        const scopeCond = applyScope(scope, { scheme: waterRequest.schemeId });
        if (scopeCond) conds.push(scopeCond);
        if (lastSeenId) conds.push(gt(waterRequest.id, lastSeenId));

        if (filters.schemeId) conds.push(eq(waterRequest.schemeId, filters.schemeId as string));
        if (filters.level) conds.push(eq(waterRequest.level, filters.level as RequestLevel));
        if (filters.wuaId) conds.push(eq(waterRequest.wuaId, filters.wuaId as string));
        if (filters.farmerId) conds.push(eq(waterRequest.farmerId, filters.farmerId as string));
        if (filters.seasonId) conds.push(eq(waterRequest.seasonId, filters.seasonId as string));
        if (filters.decision)
          conds.push(eq(waterRequest.decision, filters.decision as WaterDecision));
        if (filters.status) conds.push(eq(waterRequest.status, filters.status as RecordStatus));

        const batch = await dbClient
          .select({
            id: waterRequest.id,
            schemeId: waterRequest.schemeId,
            level: waterRequest.level,
            wuaId: waterRequest.wuaId,
            farmerId: waterRequest.farmerId,
            seasonId: waterRequest.seasonId,
            volumeM3: waterRequest.requestedVolumeM3,
            periodFromOn: waterRequest.periodFromOn,
            periodToOn: waterRequest.periodToOn,
            decision: waterRequest.decision,
            status: waterRequest.status,
          })
          .from(waterRequest)
          .where(and(...conds))
          .orderBy(waterRequest.id)
          .limit(2000);

        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        for (const w of batch) {
          totalRowCount++;
          worksheet
            .addRow([
              w.id,
              w.schemeId,
              w.level,
              w.wuaId ?? '',
              w.farmerId ?? '',
              w.seasonId ?? '',
              w.volumeM3 ?? '',
              w.periodFromOn ?? '',
              w.periodToOn ?? '',
              w.decision,
              w.status,
            ])
            .commit();
        }

        lastSeenId = batch[batch.length - 1].id;
        if (batch.length < 2000) hasMore = false;

        const mem = process.memoryUsage().heapUsed;
        if (mem > peakHeapUsed) peakHeapUsed = mem;
      }
    } else if (dataset === 'crops' || dataset === 'crop_productions') {
      worksheet
        .addRow([
          'ID',
          'Scheme ID',
          'Plot ID',
          'Season ID',
          'Crop Type ID',
          'Area (Ha)',
          'Yield (t)',
          'Status',
        ])
        .commit();

      let lastSeenId: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const conds: SQL[] = [isNull(cropProduction.deletedAt)];
        const scopeCond = applyScope(scope, { scheme: cropProduction.schemeId });
        if (scopeCond) conds.push(scopeCond);
        if (lastSeenId) conds.push(gt(cropProduction.id, lastSeenId));

        if (filters.schemeId) conds.push(eq(cropProduction.schemeId, filters.schemeId as string));
        if (filters.plotId) conds.push(eq(cropProduction.plotId, filters.plotId as string));
        if (filters.seasonId) conds.push(eq(cropProduction.seasonId, filters.seasonId as string));
        if (filters.cropTypeId)
          conds.push(eq(cropProduction.cropTypeId, filters.cropTypeId as string));
        if (filters.status) conds.push(eq(cropProduction.status, filters.status as RecordStatus));

        const batch = await dbClient
          .select({
            id: cropProduction.id,
            schemeId: cropProduction.schemeId,
            plotId: cropProduction.plotId,
            seasonId: cropProduction.seasonId,
            cropTypeId: cropProduction.cropTypeId,
            areaHa: cropProduction.areaHa,
            yieldT: cropProduction.yieldT,
            status: cropProduction.status,
          })
          .from(cropProduction)
          .where(and(...conds))
          .orderBy(cropProduction.id)
          .limit(2000);

        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        for (const c of batch) {
          totalRowCount++;
          worksheet
            .addRow([
              c.id,
              c.schemeId,
              c.plotId,
              c.seasonId,
              c.cropTypeId,
              c.areaHa,
              c.yieldT ?? '',
              c.status,
            ])
            .commit();
        }

        lastSeenId = batch[batch.length - 1].id;
        if (batch.length < 2000) hasMore = false;

        const mem = process.memoryUsage().heapUsed;
        if (mem > peakHeapUsed) peakHeapUsed = mem;
      }
    } else if (dataset === 'trainings') {
      worksheet.addRow(['ID', 'Scheme ID', 'Topic', 'Trainer Name', 'Held On', 'Venue']).commit();

      let lastSeenId: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const conds: SQL[] = [isNull(training.deletedAt)];
        const scopeCond = applyScope(scope, { scheme: training.schemeId });
        if (scopeCond) conds.push(scopeCond);
        if (lastSeenId) conds.push(gt(training.id, lastSeenId));

        if (filters.schemeId) conds.push(eq(training.schemeId, filters.schemeId as string));
        if (filters.topic) conds.push(eq(training.topic, filters.topic as string));
        if (filters.fromHeldOn) conds.push(gte(training.heldOn, filters.fromHeldOn as string));
        if (filters.toHeldOn) conds.push(lte(training.heldOn, filters.toHeldOn as string));

        const batch = await dbClient
          .select({
            id: training.id,
            schemeId: training.schemeId,
            topic: training.topic,
            trainerName: training.trainerName,
            heldOn: training.heldOn,
            venue: training.venue,
          })
          .from(training)
          .where(and(...conds))
          .orderBy(training.id)
          .limit(2000);

        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        for (const t of batch) {
          totalRowCount++;
          worksheet
            .addRow([
              t.id,
              t.schemeId,
              sanitizeFormulaSafety(t.topic),
              sanitizeFormulaSafety(t.trainerName ?? ''),
              t.heldOn,
              sanitizeFormulaSafety(t.venue ?? ''),
            ])
            .commit();
        }

        lastSeenId = batch[batch.length - 1].id;
        if (batch.length < 2000) hasMore = false;

        const mem = process.memoryUsage().heapUsed;
        if (mem > peakHeapUsed) peakHeapUsed = mem;
      }
    } else if (dataset === 'fees' || dataset === 'fee_billings') {
      worksheet
        .addRow(['Type', 'ID', 'Scheme ID', 'Season ID', 'Amount NGN', 'Ref / Receipt', 'Status'])
        .commit();

      const bConds: SQL[] = [isNull(feeBilling.deletedAt)];
      const bScopeCond = applyScope(scope, { scheme: feeBilling.schemeId });
      if (bScopeCond) bConds.push(bScopeCond);

      if (filters.schemeId) bConds.push(eq(feeBilling.schemeId, filters.schemeId as string));
      if (filters.seasonId) bConds.push(eq(feeBilling.seasonId, filters.seasonId as string));
      if (filters.wuaId) bConds.push(eq(feeBilling.wuaId, filters.wuaId as string));
      if (filters.farmerId) bConds.push(eq(feeBilling.farmerId, filters.farmerId as string));

      const billings = await dbClient
        .select({
          id: feeBilling.id,
          schemeId: feeBilling.schemeId,
          seasonId: feeBilling.seasonId,
          amountNgn: feeBilling.amountNgn,
          status: feeBilling.status,
        })
        .from(feeBilling)
        .where(and(...bConds))
        .orderBy(feeBilling.id);

      for (const b of billings) {
        totalRowCount++;
        worksheet
          .addRow(['Billing', b.id, b.schemeId, b.seasonId, b.amountNgn, '', b.status])
          .commit();
      }

      const cConds: SQL[] = [isNull(feeCollection.deletedAt)];
      const cScopeCond = applyScope(scope, { scheme: feeCollection.schemeId });
      if (cScopeCond) cConds.push(cScopeCond);

      if (filters.schemeId) cConds.push(eq(feeCollection.schemeId, filters.schemeId as string));
      if (filters.seasonId) cConds.push(eq(feeCollection.seasonId, filters.seasonId as string));
      if (filters.wuaId) cConds.push(eq(feeCollection.wuaId, filters.wuaId as string));
      if (filters.farmerId) cConds.push(eq(feeCollection.farmerId, filters.farmerId as string));
      if (filters.status) cConds.push(eq(feeCollection.status, filters.status as RecordStatus));
      if (filters.receiptNo) cConds.push(eq(feeCollection.receiptNo, filters.receiptNo as string));

      const collections = await dbClient
        .select({
          id: feeCollection.id,
          schemeId: feeCollection.schemeId,
          seasonId: feeCollection.seasonId,
          amountNgn: feeCollection.amountNgn,
          receiptNo: feeCollection.receiptNo,
          status: feeCollection.status,
        })
        .from(feeCollection)
        .where(and(...cConds))
        .orderBy(feeCollection.id);

      for (const c of collections) {
        totalRowCount++;
        worksheet
          .addRow([
            'Collection',
            c.id,
            c.schemeId,
            c.seasonId,
            c.amountNgn,
            sanitizeFormulaSafety(c.receiptNo ?? ''),
            c.status,
          ])
          .commit();
      }
    } else if (dataset === 'fee_collections') {
      worksheet
        .addRow(['ID', 'Scheme ID', 'Season ID', 'Amount NGN', 'Receipt No', 'Status'])
        .commit();

      const cConds: SQL[] = [isNull(feeCollection.deletedAt)];
      const cScopeCond = applyScope(scope, { scheme: feeCollection.schemeId });
      if (cScopeCond) cConds.push(cScopeCond);

      if (filters.schemeId) cConds.push(eq(feeCollection.schemeId, filters.schemeId as string));
      if (filters.seasonId) cConds.push(eq(feeCollection.seasonId, filters.seasonId as string));
      if (filters.wuaId) cConds.push(eq(feeCollection.wuaId, filters.wuaId as string));
      if (filters.farmerId) cConds.push(eq(feeCollection.farmerId, filters.farmerId as string));
      if (filters.status) cConds.push(eq(feeCollection.status, filters.status as RecordStatus));
      if (filters.receiptNo) cConds.push(eq(feeCollection.receiptNo, filters.receiptNo as string));

      const collections = await dbClient
        .select({
          id: feeCollection.id,
          schemeId: feeCollection.schemeId,
          seasonId: feeCollection.seasonId,
          amountNgn: feeCollection.amountNgn,
          receiptNo: feeCollection.receiptNo,
          status: feeCollection.status,
        })
        .from(feeCollection)
        .where(and(...cConds))
        .orderBy(feeCollection.id);

      for (const c of collections) {
        totalRowCount++;
        worksheet
          .addRow([
            c.id,
            c.schemeId,
            c.seasonId,
            c.amountNgn,
            sanitizeFormulaSafety(c.receiptNo ?? ''),
            c.status,
          ])
          .commit();
      }
    } else if (dataset === 'farmers_by_scope') {
      worksheet.addRow(['Scheme ID', 'Sector Key', 'State ID', 'Gender', 'Farmer Count']).commit();

      const conds: SQL[] = [];
      const scopeCond = applyScope(scope, {
        scheme: mvFarmersByScope.schemeId,
        state: mvFarmersByScope.stateId,
      });
      if (scopeCond) conds.push(scopeCond);

      if (filters.schemeId) conds.push(eq(mvFarmersByScope.schemeId, filters.schemeId as string));
      if (filters.sectorId) conds.push(eq(mvFarmersByScope.sectorId, filters.sectorId as string));
      if (filters.stateId) conds.push(eq(mvFarmersByScope.stateId, filters.stateId as string));
      if (filters.gender) conds.push(eq(mvFarmersByScope.gender, filters.gender as SlisGender));

      const rows = await dbClient
        .select()
        .from(mvFarmersByScope)
        .where(conds.length > 0 ? and(...conds) : undefined);

      for (const r of rows) {
        totalRowCount++;
        worksheet.addRow([r.schemeId, r.sectorKey, r.stateId, r.gender, r.farmerCount]).commit();
      }
    } else if (dataset === 'area_by_service') {
      worksheet
        .addRow(['Scheme ID', 'State ID', 'Service Type', 'Total Area (Ha)', 'Plot Count'])
        .commit();

      const conds: SQL[] = [];
      const scopeCond = applyScope(scope, {
        scheme: mvAreaByService.schemeId,
        state: mvAreaByService.stateId,
      });
      if (scopeCond) conds.push(scopeCond);

      if (filters.schemeId) conds.push(eq(mvAreaByService.schemeId, filters.schemeId as string));
      if (filters.stateId) conds.push(eq(mvAreaByService.stateId, filters.stateId as string));
      if (filters.serviceType)
        conds.push(eq(mvAreaByService.serviceType, filters.serviceType as ServiceType));

      const rows = await dbClient
        .select()
        .from(mvAreaByService)
        .where(conds.length > 0 ? and(...conds) : undefined);

      for (const r of rows) {
        totalRowCount++;
        worksheet.addRow([r.schemeId, r.stateId, r.serviceType, r.totalHa, r.plotCount]).commit();
      }
    } else if (dataset === 'cropping') {
      worksheet
        .addRow([
          'Scheme ID',
          'Season ID',
          'Crop Type ID',
          'Total Area (Ha)',
          'Total Yield (t)',
          'Avg Yield (t/ha)',
        ])
        .commit();

      const conds: SQL[] = [];
      const scopeCond = applyScope(scope, { scheme: mvCropping.schemeId });
      if (scopeCond) conds.push(scopeCond);

      if (filters.schemeId) conds.push(eq(mvCropping.schemeId, filters.schemeId as string));
      if (filters.seasonId) conds.push(eq(mvCropping.seasonId, filters.seasonId as string));
      if (filters.cropTypeId) conds.push(eq(mvCropping.cropTypeId, filters.cropTypeId as string));

      const rows = await dbClient
        .select()
        .from(mvCropping)
        .where(conds.length > 0 ? and(...conds) : undefined);

      for (const r of rows) {
        totalRowCount++;
        worksheet
          .addRow([
            r.schemeId,
            r.seasonId,
            r.cropTypeId,
            r.totalAreaHa,
            r.totalYieldT ?? '',
            r.avgYieldTHa ?? '',
          ])
          .commit();
      }
    } else if (dataset === 'fee_recovery') {
      worksheet
        .addRow([
          'Scheme ID',
          'WUA Key',
          'Season ID',
          'Billed NGN',
          'Collected NGN',
          'Recovery Rate (%)',
        ])
        .commit();

      const conds: SQL[] = [];
      const scopeCond = applyScope(scope, { scheme: mvFeeRecovery.schemeId });
      if (scopeCond) conds.push(scopeCond);

      if (filters.schemeId) conds.push(eq(mvFeeRecovery.schemeId, filters.schemeId as string));
      if (filters.seasonId) conds.push(eq(mvFeeRecovery.seasonId, filters.seasonId as string));
      if (filters.wuaId) conds.push(eq(mvFeeRecovery.wuaId, filters.wuaId as string));

      const rows = await dbClient
        .select()
        .from(mvFeeRecovery)
        .where(conds.length > 0 ? and(...conds) : undefined);

      for (const r of rows) {
        totalRowCount++;
        worksheet
          .addRow([
            r.schemeId,
            r.wuaKey,
            r.seasonId,
            r.billedNgn,
            r.collectedNgn,
            r.recoveryRatePct ?? '',
          ])
          .commit();
      }
    } else if (dataset === 'wua_summaries') {
      worksheet
        .addRow([
          'ID',
          'Name',
          'Reg No',
          'Level',
          'Scheme ID',
          'State ID',
          'Operational',
          'Maintenance Fund',
        ])
        .commit();

      const conds: SQL[] = [isNull(wua.deletedAt)];
      const scopeCond = applyScope(scope, { scheme: wua.organisationId, state: wua.stateId });
      if (scopeCond) conds.push(scopeCond);

      if (filters.schemeId) conds.push(eq(wua.organisationId, filters.schemeId as string));
      if (filters.stateId) conds.push(eq(wua.stateId, filters.stateId as string));

      const rows = await dbClient
        .select({
          id: wua.id,
          name: wua.name,
          registrationNumber: wua.regNo,
          level: wua.level,
          schemeId: wua.organisationId,
          stateId: wua.stateId,
          isOperational: wua.isOperational,
          hasMaintenanceFund: wua.hasMaintenanceFund,
        })
        .from(wua)
        .where(and(...conds))
        .orderBy(wua.id);

      for (const w of rows) {
        totalRowCount++;
        worksheet
          .addRow([
            w.id,
            sanitizeFormulaSafety(w.name),
            sanitizeFormulaSafety(w.registrationNumber ?? ''),
            w.level,
            w.schemeId ?? '',
            w.stateId ?? '',
            w.isOperational ? 'Yes' : 'No',
            w.hasMaintenanceFund ? 'Yes' : 'No',
          ])
          .commit();
      }
    }

    await workbook.commit();
  } catch (err) {
    await dbClient
      .update(exportJob)
      .set({
        status: 'failed',
        errorMessage: (err as Error).message,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(exportJob.id, exportId));
    await fs.promises.unlink(tmpFilePath).catch(() => {});
    return { status: 'failed', reason: (err as Error).message };
  }

  // 5. Compute stats and upload to S3
  const fileBuffer = await fs.promises.readFile(tmpFilePath);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const sizeBytes = fileBuffer.length;
  const storageKey = `exports/${exportId}.xlsx`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: fileBuffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );

  await fs.promises.unlink(tmpFilePath).catch(() => {});

  // 6. Record file in core.file with scanStatus = 'pending' (deleted after 24h by cleanup job)
  const fileId = crypto.randomUUID();
  await dbClient.insert(file).values({
    id: fileId,
    storageKey,
    originalName: `${dataset}_export.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes,
    sha256,
    scanStatus: 'pending',
    ownerEntity: 'slis.export',
    ownerId: exportId,
    createdBy: userId,
    updatedBy: userId,
  });

  // 7. Update export job
  await dbClient
    .update(exportJob)
    .set({
      status: 'completed',
      fileId,
      rowCount: totalRowCount,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(exportJob.id, exportId));

  // 8. Audit log: action 'export', entity 'slis.report', with dataset + row count
  await dbClient.insert(auditLog).values({
    id: crypto.randomUUID(),
    actorType: 'user',
    actorUserId: userId,
    action: 'export',
    entityType: 'slis.report',
    entityId: exportId,
    changes: {
      after: {
        dataset,
        rowCount: totalRowCount,
        filters,
      },
    },
    occurredAt: new Date().toISOString(),
  });

  return {
    status: 'completed',
    rowCount: totalRowCount,
    fileId,
    peakHeapMb: peakHeapUsed / 1024 / 1024,
  };
}
