import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  db,
  appUser,
  assignment,
  rolePermission,
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
  isNull,
  type SQL,
} from '@idmis/db';
import { sanitizeFormulaSafety, type RequestScope } from '@idmis/contracts';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { applyScope } from '../utils/apply-scope';

export interface SlisExportJobOptions {
  exportId: string;
  userId: string;
  dataset: string;
  filters?: Record<string, unknown>;
  s3Client?: S3Client;
  bucket?: string;
  dbClient?: typeof db;
}

export function decryptIdentityNumber(hexCiphertext: string, encryptionKey?: string): string {
  const rawKey =
    encryptionKey || process.env.ENCRYPTION_KEY || 'development-test-encryption-key-32-chars';
  const key = crypto.createHash('sha256').update(rawKey).digest();
  const data = Buffer.from(hexCiphertext, 'hex');
  if (data.length < 29) throw new Error('Invalid ciphertext length');
  const iv = data.subarray(1, 13);
  const tag = data.subarray(13, 29);
  const ciphertext = data.subarray(29);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

export async function processSlisExportJob(options: SlisExportJobOptions) {
  const { exportId, userId, dataset, filters: _filters = {} } = options;
  const dbClient = options.dbClient ?? db;
  const bucket = options.bucket ?? process.env.S3_BUCKET ?? 'idmis-files';

  const s3Client =
    options.s3Client ??
    new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
      },
      forcePathStyle: true,
    });

  // 1. Mark job processing
  await dbClient
    .update(exportJob)
    .set({ status: 'processing', updatedAt: new Date().toISOString() })
    .where(eq(exportJob.id, exportId));

  // 2. Re-resolve user and check if active
  const [user] = await dbClient.select().from(appUser).where(eq(appUser.id, userId)).limit(1);

  if (!user || !user.isActive) {
    const errorMsg = 'Requesting user is deactivated or does not exist';
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

  // 3. Re-resolve user's CURRENT assignments & scope at run-time
  const assignments = await dbClient
    .select({
      roleId: assignment.roleId,
      module: assignment.module,
      scopeType: assignment.scopeType,
      scopeStateId: assignment.scopeStateId,
      scopeOrgId: assignment.scopeOrgId,
      permission: rolePermission.permission,
    })
    .from(assignment)
    .innerJoin(rolePermission, eq(assignment.roleId, rolePermission.roleId))
    .where(and(eq(assignment.userId, userId), isNull(assignment.deletedAt)));

  if (assignments.length === 0) {
    const errorMsg = 'User has no active assignments or scope has been revoked';
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

  const isNational = assignments.some((a) => a.scopeType === 'national');
  const stateIds = Array.from(
    new Set(assignments.map((a) => a.scopeStateId).filter((id): id is string => Boolean(id))),
  );
  const schemeIds = Array.from(
    new Set(
      assignments
        .filter((a) => ['scheme', 'rbda', 'sector'].includes(a.scopeType))
        .map((a) => a.scopeOrgId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const scope: RequestScope = {
    isNational,
    stateIds,
    rbdaIds: [],
    schemeIds,
    sectorIds: [],
  };

  const canViewIdentity = assignments.some((a) => a.permission === 'slis.identity.view');

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

        const batch = await dbClient
          .select({
            id: farmer.id,
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
            if (canViewIdentity && f.docNumberEnc) {
              try {
                idDoc = decryptIdentityNumber(f.docNumberEnc);
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

        const currentHeap = process.memoryUsage().heapUsed;
        if (currentHeap > peakHeapUsed) peakHeapUsed = currentHeap;
      }
    } else if (dataset === 'plots') {
      worksheet
        .addRow(['ID', 'Plot Code', 'Scheme ID', 'Sector ID', 'Area Ha', 'Service Type', 'Status'])
        .commit();
      let lastSeenId: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const conds: SQL[] = [isNull(plot.deletedAt)];
        const scopeCond = applyScope(scope, { scheme: plot.schemeId, state: plot.stateId });
        if (scopeCond) conds.push(scopeCond);
        if (lastSeenId) conds.push(gt(plot.id, lastSeenId));

        const batch = await dbClient
          .select({
            id: plot.id,
            plotCode: plot.plotCode,
            schemeId: plot.schemeId,
            sectorId: plot.sectorId,
            areaHa: plot.areaHa,
            serviceType: plot.serviceType,
            status: plot.status,
          })
          .from(plot)
          .where(and(...conds))
          .orderBy(plot.id)
          .limit(2000);

        if (batch.length === 0) break;

        for (const p of batch) {
          totalRowCount++;
          worksheet
            .addRow([
              p.id,
              sanitizeFormulaSafety(p.plotCode),
              p.schemeId,
              p.sectorId,
              p.areaHa ?? '',
              p.serviceType ?? '',
              p.status,
            ])
            .commit();
        }

        lastSeenId = batch[batch.length - 1].id;
        if (batch.length < 2000) hasMore = false;
      }
    } else if (dataset === 'water_requests') {
      worksheet
        .addRow([
          'ID',
          'Scheme ID',
          'Level',
          'Requested Volume M3',
          'Period From',
          'Period To',
          'Decision',
        ])
        .commit();
      const conds: SQL[] = [isNull(waterRequest.deletedAt)];
      const scopeCond = applyScope(scope, { scheme: waterRequest.schemeId });
      if (scopeCond) conds.push(scopeCond);

      const rows = await dbClient
        .select()
        .from(waterRequest)
        .where(and(...conds))
        .orderBy(waterRequest.id)
        .limit(5000);

      for (const w of rows) {
        totalRowCount++;
        worksheet
          .addRow([
            w.id,
            w.schemeId,
            w.level,
            w.requestedVolumeM3 ?? '',
            w.periodFromOn ?? '',
            w.periodToOn ?? '',
            w.decision,
          ])
          .commit();
      }
    } else if (dataset === 'crops') {
      worksheet
        .addRow([
          'ID',
          'Scheme ID',
          'Plot ID',
          'Season ID',
          'Crop Type ID',
          'Area Ha',
          'Yield T',
          'Status',
        ])
        .commit();
      const conds: SQL[] = [isNull(cropProduction.deletedAt)];
      const scopeCond = applyScope(scope, { scheme: cropProduction.schemeId });
      if (scopeCond) conds.push(scopeCond);

      const rows = await dbClient
        .select()
        .from(cropProduction)
        .where(and(...conds))
        .orderBy(cropProduction.id)
        .limit(5000);

      for (const c of rows) {
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
    } else if (dataset === 'trainings') {
      worksheet.addRow(['ID', 'Scheme ID', 'Topic', 'Trainer Name', 'Held On', 'Venue']).commit();
      const conds: SQL[] = [isNull(training.deletedAt)];
      const scopeCond = applyScope(scope, { scheme: training.schemeId });
      if (scopeCond) conds.push(scopeCond);

      const rows = await dbClient
        .select()
        .from(training)
        .where(and(...conds))
        .orderBy(training.id)
        .limit(5000);

      for (const t of rows) {
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
    } else if (dataset === 'fees') {
      worksheet
        .addRow(['Type', 'ID', 'Scheme ID', 'Season ID', 'Amount NGN', 'Date', 'Receipt No'])
        .commit();
      const bConds: SQL[] = [isNull(feeBilling.deletedAt)];
      const bScopeCond = applyScope(scope, { scheme: feeBilling.schemeId });
      if (bScopeCond) bConds.push(bScopeCond);

      const billings = await dbClient
        .select()
        .from(feeBilling)
        .where(and(...bConds))
        .limit(5000);
      for (const b of billings) {
        totalRowCount++;
        worksheet
          .addRow(['billing', b.id, b.schemeId, b.seasonId, b.amountNgn, b.dueDate, ''])
          .commit();
      }

      const cConds: SQL[] = [isNull(feeCollection.deletedAt)];
      const cScopeCond = applyScope(scope, { scheme: feeCollection.schemeId });
      if (cScopeCond) cConds.push(cScopeCond);

      const collections = await dbClient
        .select()
        .from(feeCollection)
        .where(and(...cConds))
        .limit(5000);
      for (const c of collections) {
        totalRowCount++;
        worksheet
          .addRow([
            'collection',
            c.id,
            c.schemeId,
            c.seasonId,
            c.amountNgn,
            c.paidOn,
            sanitizeFormulaSafety(c.receiptNo ?? ''),
          ])
          .commit();
      }
    } else if (dataset === 'farmers_by_scope') {
      worksheet.addRow(['Scheme ID', 'Sector ID', 'State ID', 'Gender', 'Farmer Count']).commit();
      const conds: SQL[] = [];
      const scopeCond = applyScope(scope, {
        scheme: mvFarmersByScope.schemeId,
        state: mvFarmersByScope.stateId,
      });
      if (scopeCond) conds.push(scopeCond);

      const rows = await dbClient
        .select()
        .from(mvFarmersByScope)
        .where(conds.length ? and(...conds) : undefined);
      for (const r of rows) {
        totalRowCount++;
        worksheet
          .addRow([r.schemeId, r.sectorId ?? '', r.stateId ?? '', r.gender, r.farmerCount])
          .commit();
      }
    } else if (dataset === 'area_by_service') {
      worksheet
        .addRow(['Scheme ID', 'State ID', 'Service Type', 'Total Area Ha', 'Plot Count'])
        .commit();
      const conds: SQL[] = [];
      const scopeCond = applyScope(scope, {
        scheme: mvAreaByService.schemeId,
        state: mvAreaByService.stateId,
      });
      if (scopeCond) conds.push(scopeCond);

      const rows = await dbClient
        .select()
        .from(mvAreaByService)
        .where(conds.length ? and(...conds) : undefined);
      for (const r of rows) {
        totalRowCount++;
        worksheet
          .addRow([r.schemeId, r.stateId ?? '', r.serviceType ?? '', r.totalHa, r.plotCount])
          .commit();
      }
    } else if (dataset === 'cropping') {
      worksheet
        .addRow([
          'Scheme ID',
          'State ID',
          'Season ID',
          'Crop Type ID',
          'Total Area Ha',
          'Total Yield T',
          'Avg Yield T/Ha',
        ])
        .commit();
      const conds: SQL[] = [];
      const scopeCond = applyScope(scope, {
        scheme: mvCropping.schemeId,
        state: mvCropping.stateId,
      });
      if (scopeCond) conds.push(scopeCond);

      const rows = await dbClient
        .select()
        .from(mvCropping)
        .where(conds.length ? and(...conds) : undefined);
      for (const r of rows) {
        totalRowCount++;
        worksheet
          .addRow([
            r.schemeId,
            r.stateId ?? '',
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
          'State ID',
          'Season ID',
          'WUA ID',
          'Billed NGN',
          'Collected NGN',
          'Recovery Rate %',
        ])
        .commit();
      const conds: SQL[] = [];
      const scopeCond = applyScope(scope, {
        scheme: mvFeeRecovery.schemeId,
        state: mvFeeRecovery.stateId,
      });
      if (scopeCond) conds.push(scopeCond);

      const rows = await dbClient
        .select()
        .from(mvFeeRecovery)
        .where(conds.length ? and(...conds) : undefined);
      for (const r of rows) {
        totalRowCount++;
        worksheet
          .addRow([
            r.schemeId,
            r.stateId ?? '',
            r.seasonId,
            r.wuaId ?? '',
            r.billedNgn,
            r.collectedNgn,
            r.recoveryRatePct ?? '',
          ])
          .commit();
      }
    } else if (dataset === 'wua_summaries') {
      worksheet
        .addRow([
          'WUA ID',
          'Name',
          'Reg No',
          'Level',
          'Scheme ID',
          'Operational',
          'Maintenance Fund',
        ])
        .commit();
      const conds: SQL[] = [isNull(wua.deletedAt)];
      const scopeCond = applyScope(scope, { scheme: wua.organisationId, state: wua.stateId });
      if (scopeCond) conds.push(scopeCond);

      const rows = await dbClient
        .select()
        .from(wua)
        .where(and(...conds));
      for (const r of rows) {
        totalRowCount++;
        worksheet
          .addRow([
            r.id,
            sanitizeFormulaSafety(r.name),
            sanitizeFormulaSafety(r.regNo ?? ''),
            r.level,
            r.organisationId,
            r.isOperational,
            r.hasMaintenanceFund,
          ])
          .commit();
      }
    }

    worksheet.commit();
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
        unmaskedIdentity: canViewIdentity,
        filters: _filters,
      },
    },
    occurredAt: new Date().toISOString(),
  });

  console.log(
    `[ExportJob] Export ${exportId} completed with ${totalRowCount} rows. Peak heap: ${(peakHeapUsed / 1024 / 1024).toFixed(2)} MB`,
  );

  return {
    status: 'completed',
    rowCount: totalRowCount,
    fileId,
    peakHeapMb: peakHeapUsed / 1024 / 1024,
  };
}
