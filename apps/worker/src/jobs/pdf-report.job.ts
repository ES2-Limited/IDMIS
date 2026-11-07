import crypto from 'node:crypto';
import {
  db,
  reportJob,
  file,
  auditLog,
  organisation,
  organisationState,
  state,
  mvFarmersByScope,
  mvAreaByService,
  mvCropping,
  mvFeeRecovery,
  mvIndicatorMatrix,
  mvDamStatus,
  dam,
  waterRequest,
  and,
  eq,
  isNull,
  sql,
  type SQL,
} from '@idmis/db';
import { resolveUserAuthz } from '@idmis/db/authz';
import { permissions, type ReportType, validateReportParams } from '@idmis/contracts';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getWorkerS3Config } from '../config/storage';
import { renderHtmlToPdf } from '../reports/pdf-renderer';
import {
  renderSchemeReportHtml,
  type SchemeReportData,
} from '../reports/templates/scheme-report.template';
import {
  renderIndicatorMatrixReportHtml,
  type IndicatorMatrixReportData,
  type IndicatorRowData,
} from '../reports/templates/indicator-matrix.template';
import {
  renderDamSafetySummaryReportHtml,
  type DamSafetySummaryReportData,
  type DamSafetyRow,
} from '../reports/templates/dam-safety-summary.template';

export interface PdfReportJobOptions {
  reportId: string;
  userId: string;
  type: ReportType;
  params?: Record<string, unknown>;
  s3Client?: S3Client;
  bucket?: string;
  dbClient?: typeof db;
}

export async function processPdfReportJob(options: PdfReportJobOptions) {
  const { reportId, userId, type, params = {} } = options;
  const dbClient = options.dbClient ?? db;
  const s3Config = getWorkerS3Config();
  const bucket = options.bucket ?? s3Config.bucket;
  const s3Client = options.s3Client ?? s3Config.s3Client;

  // 1. Mark job processing
  await dbClient
    .update(reportJob)
    .set({
      status: 'processing',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(reportJob.id, reportId));

  try {
    // 2. Re-resolve user authorization fresh at run time
    const authz = await resolveUserAuthz(dbClient, userId);
    if (!authz.isActive || !authz.can(permissions.REPORT_GENERATE)) {
      const errorMsg = !authz.isActive
        ? 'Requesting user is deactivated or does not exist'
        : 'User lacks permission to generate reports';
      await dbClient
        .update(reportJob)
        .set({
          status: 'failed',
          errorMessage: errorMsg,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(reportJob.id, reportId));
      return { status: 'failed', reason: errorMsg };
    }

    const scope = authz.scopeFor(permissions.REPORT_GENERATE);
    const validatedParams = validateReportParams(type, params);

    let html = '';

    // 3. Render HTML based on report type with scoped data
    if (type === 'scheme_report') {
      const schemeParams = validatedParams as {
        schemeId: string;
        year?: number;
        seasonId?: string;
      };
      const schemeId = schemeParams.schemeId;

      // Fetch scheme & state details
      const orgRows = await dbClient
        .select({
          id: organisation.id,
          name: organisation.name,
          code: organisation.code,
          stateId: organisationState.stateId,
          stateName: state.name,
        })
        .from(organisation)
        .leftJoin(organisationState, eq(organisation.id, organisationState.organisationId))
        .leftJoin(state, eq(organisationState.stateId, state.id))
        .where(and(eq(organisation.id, schemeId), isNull(organisation.deletedAt)))
        .limit(1);

      if (!orgRows.length) {
        throw new Error(`Scheme ${schemeId} not found`);
      }

      const org = orgRows[0];

      // Enforce scope check
      if (!scope.isNational) {
        const allowedByScheme = scope.schemeIds.includes(schemeId);
        const allowedByState = org.stateId ? scope.stateIds.includes(org.stateId) : false;
        if (!allowedByScheme && !allowedByState) {
          throw new Error(`Out of scope: user lacks access to scheme ${schemeId}`);
        }
      }

      // Farmers count
      const farmerRows = await dbClient
        .select({
          gender: mvFarmersByScope.gender,
          farmerCount: mvFarmersByScope.farmerCount,
        })
        .from(mvFarmersByScope)
        .where(eq(mvFarmersByScope.schemeId, schemeId));

      let totalFarmers = 0;
      let maleFarmers = 0;
      let femaleFarmers = 0;
      for (const r of farmerRows) {
        const c = Number(r.farmerCount) || 0;
        totalFarmers += c;
        if (r.gender?.toLowerCase() === 'female' || r.gender?.toLowerCase() === 'f') {
          femaleFarmers += c;
        } else {
          maleFarmers += c;
        }
      }

      // Area by service
      const areaRows = await dbClient
        .select({
          serviceType: mvAreaByService.serviceType,
          areaHa: mvAreaByService.totalHa,
          plotsCount: mvAreaByService.plotCount,
        })
        .from(mvAreaByService)
        .where(eq(mvAreaByService.schemeId, schemeId));

      const areaByService = areaRows.map((a) => ({
        serviceType: a.serviceType || 'Unknown',
        areaHa: parseFloat(String(a.areaHa)) || 0,
        plotsCount: Number(a.plotsCount) || 0,
      }));

      // Fee recovery
      const feeRows = await dbClient
        .select({
          billed: mvFeeRecovery.billedNgn,
          collected: mvFeeRecovery.collectedNgn,
        })
        .from(mvFeeRecovery)
        .where(eq(mvFeeRecovery.schemeId, schemeId));

      let totalBilled = 0;
      let totalCollected = 0;
      for (const f of feeRows) {
        totalBilled += parseFloat(String(f.billed)) || 0;
        totalCollected += parseFloat(String(f.collected)) || 0;
      }
      const recoveryRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

      // Cropping
      const cropRows = await dbClient
        .select({
          areaHa: mvCropping.totalAreaHa,
          yieldMt: mvCropping.totalYieldT,
        })
        .from(mvCropping)
        .where(eq(mvCropping.schemeId, schemeId));

      let totalCultivatedHa = 0;
      let totalYieldMt = 0;
      for (const c of cropRows) {
        totalCultivatedHa += parseFloat(String(c.areaHa)) || 0;
        totalYieldMt += parseFloat(String(c.yieldMt)) || 0;
      }

      // Water requests
      const waterReqCounts = await dbClient
        .select({
          status: waterRequest.status,
          count: sql<number>`count(*)::int`,
        })
        .from(waterRequest)
        .where(and(eq(waterRequest.schemeId, schemeId), isNull(waterRequest.deletedAt)))
        .groupBy(waterRequest.status);

      let totalWater = 0;
      let approvedWater = 0;
      let pendingWater = 0;
      let rejectedWater = 0;
      for (const wr of waterReqCounts) {
        const c = Number(wr.count) || 0;
        totalWater += c;
        if (wr.status === 'approved') approvedWater += c;
        else if (wr.status === 'rejected') rejectedWater += c;
        else pendingWater += c;
      }

      const reportData: SchemeReportData = {
        schemeName: org.name,
        schemeCode: org.code,
        stateName: org.stateName || 'N/A',
        generatedAt: new Date().toISOString(),
        year: schemeParams.year,
        farmers: {
          total: totalFarmers,
          male: maleFarmers,
          female: femaleFarmers,
        },
        areaByService,
        cropping: {
          totalCultivatedHa,
          totalYieldMt,
        },
        feeRecovery: {
          totalBilledNgn: totalBilled,
          totalCollectedNgn: totalCollected,
          recoveryRatePct: recoveryRate,
        },
        waterRequests: {
          total: totalWater,
          approved: approvedWater,
          pending: pendingWater,
          rejected: rejectedWater,
        },
      };

      html = renderSchemeReportHtml(reportData);
    } else if (type === 'indicator_matrix') {
      const matrixParams = validatedParams as {
        scopeType: 'scheme' | 'state' | 'national' | 'programme';
        scopeId?: string;
        year?: number;
        quarter?: number;
      };

      // Scope validation
      if (!scope.isNational) {
        if (matrixParams.scopeType === 'state' && matrixParams.scopeId) {
          if (!scope.stateIds.includes(matrixParams.scopeId)) {
            throw new Error(`Out of scope: user lacks access to state ${matrixParams.scopeId}`);
          }
        } else if (matrixParams.scopeType === 'scheme' && matrixParams.scopeId) {
          if (!scope.schemeIds.includes(matrixParams.scopeId)) {
            throw new Error(`Out of scope: user lacks access to scheme ${matrixParams.scopeId}`);
          }
        }
      }

      const conds: SQL[] = [];
      if (matrixParams.year) {
        conds.push(eq(mvIndicatorMatrix.periodYear, matrixParams.year));
      }
      if (matrixParams.quarter) {
        conds.push(eq(mvIndicatorMatrix.periodQuarter, matrixParams.quarter));
      }
      if (matrixParams.scopeType === 'state' && matrixParams.scopeId) {
        conds.push(eq(mvIndicatorMatrix.scopeStateId, matrixParams.scopeId));
      } else if (matrixParams.scopeType === 'scheme' && matrixParams.scopeId) {
        conds.push(eq(mvIndicatorMatrix.scopeOrgId, matrixParams.scopeId));
      }

      const matrixRows = await dbClient
        .select({
          code: mvIndicatorMatrix.indicatorCode,
          name: mvIndicatorMatrix.indicatorName,
          periodYear: mvIndicatorMatrix.periodYear,
          periodQuarter: mvIndicatorMatrix.periodQuarter,
          target: mvIndicatorMatrix.target,
          value: mvIndicatorMatrix.value,
          endTarget: mvIndicatorMatrix.endTarget,
          pctOfEndTarget: mvIndicatorMatrix.pctOfEndTarget,
          status: mvIndicatorMatrix.status,
        })
        .from(mvIndicatorMatrix)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(mvIndicatorMatrix.indicatorCode);

      let onTrack = 0;
      let offTrack = 0;
      const indicators: IndicatorRowData[] = matrixRows.map((r) => {
        const s = r.status.toLowerCase();
        if (s.includes('on_track') || s.includes('on-track') || s.includes('achieved')) {
          onTrack++;
        } else if (s.includes('off_track') || s.includes('off-track') || s.includes('lagging')) {
          offTrack++;
        }
        return {
          code: r.code,
          name: r.name,
          periodYear: r.periodYear,
          periodQuarter: r.periodQuarter,
          target: r.target != null ? parseFloat(String(r.target)) : null,
          value: r.value != null ? parseFloat(String(r.value)) : null,
          endTarget: r.endTarget != null ? parseFloat(String(r.endTarget)) : null,
          pctOfEndTarget: r.pctOfEndTarget != null ? parseFloat(String(r.pctOfEndTarget)) : null,
          status: r.status,
        };
      });

      const reportData: IndicatorMatrixReportData = {
        scopeTitle: matrixParams.scopeId || matrixParams.scopeType.toUpperCase(),
        scopeType: matrixParams.scopeType,
        generatedAt: new Date().toISOString(),
        year: matrixParams.year,
        quarter: matrixParams.quarter,
        totalIndicators: indicators.length,
        onTrackCount: onTrack,
        offTrackCount: offTrack,
        indicators,
      };

      html = renderIndicatorMatrixReportHtml(reportData);
    } else if (type === 'dam_safety_summary') {
      const damParams = validatedParams as {
        stateId?: string;
        basinId?: string;
        schemeId?: string;
      };

      // Scope validation
      if (!scope.isNational && damParams.stateId) {
        if (!scope.stateIds.includes(damParams.stateId)) {
          throw new Error(`Out of scope: user lacks access to state ${damParams.stateId}`);
        }
      }

      const damRows = await dbClient
        .select({
          id: dam.id,
          code: dam.code,
          name: dam.name,
          meetsStandard: mvDamStatus.meetsStandard,
          hazardClass: mvDamStatus.hazardClass,
          inspectedOn: mvDamStatus.inspectedOn,
          nextDueOn: mvDamStatus.nextDueOn,
        })
        .from(dam)
        .leftJoin(mvDamStatus, eq(dam.id, mvDamStatus.damId))
        .where(isNull(dam.deletedAt))
        .orderBy(dam.name);

      let meetingCount = 0;
      let notMeetingCount = 0;
      let overdueCount = 0;

      const now = new Date();
      const dams: DamSafetyRow[] = damRows.map((d) => {
        const isOverdue = d.nextDueOn ? new Date(d.nextDueOn) < now : false;
        if (isOverdue) overdueCount++;
        if (d.meetsStandard) meetingCount++;
        else notMeetingCount++;

        return {
          damCode: d.code || 'N/A',
          damName: d.name,
          hazardClass: d.hazardClass || undefined,
          lastInspectedOn: d.inspectedOn || undefined,
          meetsStandard: Boolean(d.meetsStandard),
          nextDueOn: d.nextDueOn || undefined,
          isOverdue,
        };
      });

      const reportData: DamSafetySummaryReportData = {
        scopeTitle: damParams.stateId || 'National Overview',
        generatedAt: new Date().toISOString(),
        totalDams: dams.length,
        meetingStandardCount: meetingCount,
        notMeetingStandardCount: notMeetingCount,
        overdueCount: overdueCount,
        dams,
      };

      html = renderDamSafetySummaryReportHtml(reportData);
    } else {
      throw new Error(`Unsupported report type: ${type}`);
    }

    // 4. Render HTML to PDF via sandboxed headless Chromium (< 30s timeout)
    const pdfBuffer = await renderHtmlToPdf(html, { timeoutMs: 30000 });

    // 5. Upload PDF buffer to S3 / MinIO storage
    const storageKey = `reports/${reportId}.pdf`;
    const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    const sizeBytes = pdfBuffer.length;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      }),
    );

    // 6. Record file in core.file
    const fileId = crypto.randomUUID();
    await dbClient.insert(file).values({
      id: fileId,
      storageKey,
      originalName: `${reportId}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes,
      sha256,
      scanStatus: 'pending',
      ownerEntity: 'core.report',
      ownerId: reportId,
      createdBy: userId,
      updatedBy: userId,
    });

    // 7. Update report job to completed
    await dbClient
      .update(reportJob)
      .set({
        status: 'completed',
        fileId,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(reportJob.id, reportId));

    // 8. Record audit log
    await dbClient.insert(auditLog).values({
      id: crypto.randomUUID(),
      actorType: 'user',
      actorUserId: userId,
      action: 'report',
      entityType: 'core.report',
      entityId: reportId,
      changes: {
        after: {
          type,
          params,
          fileId,
          sizeBytes,
        },
      },
      occurredAt: new Date().toISOString(),
    });

    return {
      status: 'completed',
      reportId,
      fileId,
      sizeBytes,
    };
  } catch (err) {
    const errorMsg = (err as Error).message || 'Report generation failed';
    await dbClient
      .update(reportJob)
      .set({
        status: 'failed',
        errorMessage: errorMsg,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(reportJob.id, reportId));
    return { status: 'failed', reason: errorMsg };
  }
}
