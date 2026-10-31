import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import {
  permissions,
  type ListSyncConflictsQuery,
  type ListSyncQuarantineQuery,
  type ResolveConflictInput,
  type ResolveQuarantineInput,
  type SyncOpError,
  type SyncOutcome,
  type SyncPullQuery,
  type SyncPullResponse,
  type SyncPushInput,
  type SyncPushResponse,
} from '@idmis/contracts';
import { SyncRepository } from '../repositories/sync.repository';
import { FarmerService } from './farmer.service';
import { PlotService } from './plot.service';
import { PlotAllocationService } from './plot-allocation.service';
import { WaterRequestService } from './water-request.service';
import { CropProductionService } from './crop-production.service';
import { StreamFlowService } from './stream-flow.service';
import { TrainingService } from './training.service';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { ConflictProblemException } from '../../../platform/filters';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class SyncService {
  constructor(
    private readonly syncRepo: SyncRepository,
    private readonly farmerService: FarmerService,
    private readonly plotService: PlotService,
    private readonly plotAllocationService: PlotAllocationService,
    private readonly waterRequestService: WaterRequestService,
    private readonly cropProductionService: CropProductionService,
    private readonly streamFlowService: StreamFlowService,
    private readonly trainingService: TrainingService,
  ) {}

  async registerDevice(
    userId: string,
    data: {
      id?: string;
      installationId: string;
      label?: string;
      platform?: string;
      offlineGrantUntil?: string;
    },
  ) {
    return this.syncRepo.registerDevice(userId, data);
  }

  async push(
    input: SyncPushInput,
    authz: UserAuthz,
    actorUserId: string,
  ): Promise<SyncPushResponse> {
    const dev = await this.syncRepo.findDevice(input.deviceId);
    if (!dev) {
      throw new NotFoundException(`Device ${input.deviceId} not registered`);
    }

    if (dev.userId !== actorUserId) {
      throw new ForbiddenException('Device does not belong to the authenticated user');
    }

    const now = new Date();
    const isRevoked = Boolean(dev.revokedAt);
    const isGrantExpired = dev.offlineGrantUntil
      ? new Date(dev.offlineGrantUntil).getTime() < now.getTime()
      : false;

    const results: SyncPushResponse['results'] = [];

    for (const op of input.ops) {
      // Execute each op inside an atomic transaction:
      // Claim sync_op ON CONFLICT DO NOTHING in the same transaction as the domain write.
      const opResult = await runInTransaction(async (txDb) => {
        const [claimed] = await this.syncRepo.claimSyncOp(
          op.opId,
          input.deviceId,
          op.entity,
          op.recordId,
          txDb,
        );

        if (!claimed) {
          // Op already claimed or processed by a concurrent push
          const existing = await this.syncRepo.findSyncOpById(op.opId, txDb);
          if (!existing) {
            throw new ConflictException(`Sync operation ${op.opId} is being processed`);
          }
          return {
            opId: existing.opId,
            entity: existing.entity,
            recordId: existing.recordId,
            outcome: existing.outcome as SyncOutcome,
            newVersion: existing.newVersion ?? undefined,
            errors: (existing.errors as SyncOpError[]) ?? undefined,
          };
        }

        // Quarantine Check
        if (isRevoked || isGrantExpired) {
          const reason: 'device_revoked' | 'grant_expired' = isRevoked
            ? 'device_revoked'
            : 'grant_expired';
          await this.syncRepo.updateSyncOpOutcome(op.opId, { outcome: 'quarantined' }, txDb);

          const quarantined = await this.syncRepo.recordQuarantine(
            {
              deviceId: input.deviceId,
              opId: op.opId,
              entity: op.entity,
              action: op.action,
              recordId: op.recordId,
              baseVersion: op.baseVersion,
              payload: op.data,
              reason,
              schemeId: typeof op.data?.schemeId === 'string' ? op.data.schemeId : undefined,
              stateId: typeof op.data?.stateId === 'string' ? op.data.stateId : undefined,
            },
            txDb,
          );

          return {
            opId: op.opId,
            entity: op.entity,
            recordId: op.recordId,
            outcome: 'quarantined' as SyncOutcome,
            quarantineId: quarantined.id,
            quarantineReason: reason,
          };
        }

        // Domain Service Execution with Exact Same Permissions & Scope
        let domainResult: { version?: number } | undefined;
        try {
          domainResult = await this.executeDomainOperation(
            op.entity,
            op.action,
            op.recordId,
            op.baseVersion,
            op.data,
            authz,
            actorUserId,
          );
        } catch (err: unknown) {
          if (err instanceof ConflictProblemException) {
            let serverVer = err.currentVersion;
            if (!serverVer) {
              const currentRecord = await this.syncRepo.fetchCurrentEntityRow(
                op.entity,
                op.recordId,
                txDb,
              );
              serverVer =
                currentRecord && typeof currentRecord.version === 'number'
                  ? currentRecord.version
                  : 1;
            }

            await this.syncRepo.updateSyncOpOutcome(op.opId, { outcome: 'conflict' }, txDb);

            const currentPayload =
              err.current && typeof err.current === 'object'
                ? (err.current as Record<string, unknown>)
                : {};
            const schemeId =
              typeof currentPayload.schemeId === 'string'
                ? currentPayload.schemeId
                : (op.data.schemeId as string | undefined);

            const conflict = await this.syncRepo.recordConflict(
              {
                opId: op.opId,
                entity: op.entity,
                recordId: op.recordId,
                baseVersion: op.baseVersion,
                serverVersion: serverVer,
                devicePayload: op.data,
                serverPayload: currentPayload,
                schemeId,
              },
              txDb,
            );

            return {
              opId: op.opId,
              entity: op.entity,
              recordId: op.recordId,
              outcome: 'conflict' as SyncOutcome,
              conflictId: conflict.id,
            };
          } else {
            const error = err as Error & { getStatus?: () => number };
            const status = typeof error.getStatus === 'function' ? error.getStatus() : 400;
            const errorObj = [{ status, detail: error.message || 'Operation failed' }];

            await this.syncRepo.updateSyncOpOutcome(
              op.opId,
              {
                outcome: 'rejected',
                errors: errorObj,
              },
              txDb,
            );

            return {
              opId: op.opId,
              entity: op.entity,
              recordId: op.recordId,
              outcome: 'rejected' as SyncOutcome,
              errors: errorObj,
            };
          }
        }

        // Domain write succeeded. Now update sync_op to 'applied' in the SAME transaction.
        // A failure after the domain write rolls back BOTH the domain write and the sync_op claim.
        await this.syncRepo.updateSyncOpOutcome(
          op.opId,
          {
            outcome: 'applied',
            newVersion: domainResult?.version,
          },
          txDb,
        );

        return {
          opId: op.opId,
          entity: op.entity,
          recordId: op.recordId,
          outcome: 'applied' as SyncOutcome,
          newVersion: domainResult?.version,
        };
      });

      results.push(opResult);
    }

    return {
      results,
      serverTime: new Date().toISOString(),
    };
  }

  private async executeDomainOperation(
    entity: string,
    action: string,
    recordId: string,
    baseVersion: number,
    data: Record<string, unknown>,
    authz: UserAuthz,
    actorUserId: string,
  ): Promise<
    Record<string, unknown> & {
      version?: number;
      schemeId?: string | null;
      stateId?: string | null;
    }
  > {
    if (entity === 'farmer') {
      if (action === 'create') {
        const res = await this.farmerService.createFarmer(
          { ...data, id: recordId } as unknown as Parameters<
            typeof this.farmerService.createFarmer
          >[0],
          authz,
          actorUserId,
        );
        return res as unknown as Record<string, unknown> & {
          version?: number;
          schemeId?: string | null;
          stateId?: string | null;
        };
      }
      if (action === 'update') {
        const res = await this.farmerService.updateFarmer(
          recordId,
          baseVersion,
          data as unknown as Parameters<typeof this.farmerService.updateFarmer>[2],
          authz,
          actorUserId,
        );
        return res as unknown as Record<string, unknown> & {
          version?: number;
          schemeId?: string | null;
          stateId?: string | null;
        };
      }
    }

    if (entity === 'plot') {
      if (action === 'create') {
        const res = await this.plotService.createPlot(
          { ...data, id: recordId } as unknown as Parameters<typeof this.plotService.createPlot>[0],
          authz,
          actorUserId,
        );
        return res as unknown as Record<string, unknown> & {
          version?: number;
          schemeId?: string | null;
          stateId?: string | null;
        };
      }
      if (action === 'update') {
        const res = await this.plotService.updatePlot(
          recordId,
          baseVersion,
          data as unknown as Parameters<typeof this.plotService.updatePlot>[2],
          authz,
          actorUserId,
        );
        return res as unknown as Record<string, unknown> & {
          version?: number;
          schemeId?: string | null;
          stateId?: string | null;
        };
      }
    }

    if (entity === 'plot_allocation') {
      if (action === 'create') {
        const plotId = (data.plotId as string) || recordId;
        const res = await this.plotAllocationService.createAllocation(
          { ...data, plotId } as unknown as Parameters<
            typeof this.plotAllocationService.createAllocation
          >[0],
          authz,
          actorUserId,
        );
        return res as unknown as Record<string, unknown> & {
          version?: number;
          schemeId?: string | null;
          stateId?: string | null;
        };
      }
    }

    if (entity === 'water_request') {
      if (action === 'create') {
        const res = await this.waterRequestService.createWaterRequest(
          { ...data, id: recordId } as unknown as Parameters<
            typeof this.waterRequestService.createWaterRequest
          >[0],
          authz,
          actorUserId,
        );
        return res as unknown as Record<string, unknown> & {
          version?: number;
          schemeId?: string | null;
          stateId?: string | null;
        };
      }
    }

    if (entity === 'crop_production') {
      if (action === 'create') {
        const res = await this.cropProductionService.createCropProduction(
          { ...data, id: recordId } as unknown as Parameters<
            typeof this.cropProductionService.createCropProduction
          >[0],
          authz,
          actorUserId,
        );
        return res as unknown as Record<string, unknown> & {
          version?: number;
          schemeId?: string | null;
          stateId?: string | null;
        };
      }
      if (action === 'update') {
        const res = await this.cropProductionService.updateCropProduction(
          recordId,
          baseVersion,
          data as unknown as Parameters<typeof this.cropProductionService.updateCropProduction>[2],
          authz,
          actorUserId,
        );
        return res as unknown as Record<string, unknown> & {
          version?: number;
          schemeId?: string | null;
          stateId?: string | null;
        };
      }
    }

    if (entity === 'stream_flow_reading') {
      if (action === 'create') {
        const res = await this.streamFlowService.recordStreamFlow(
          { ...data, id: recordId } as unknown as Parameters<
            typeof this.streamFlowService.recordStreamFlow
          >[0],
          authz,
          actorUserId,
        );
        return res as unknown as Record<string, unknown> & {
          version?: number;
          schemeId?: string | null;
          stateId?: string | null;
        };
      }
    }

    if (entity === 'training') {
      if (action === 'create') {
        const res = await this.trainingService.createTraining(
          { ...data, id: recordId } as unknown as Parameters<
            typeof this.trainingService.createTraining
          >[0],
          authz,
          actorUserId,
        );
        return res as unknown as Record<string, unknown> & {
          version?: number;
          schemeId?: string | null;
          stateId?: string | null;
        };
      }
    }

    if (entity === 'training_attendance') {
      if (action === 'create') {
        const trainingId = (data.trainingId as string) || recordId;
        const res = await this.trainingService.recordAttendance(
          { ...data, trainingId } as unknown as Parameters<
            typeof this.trainingService.recordAttendance
          >[0],
          authz,
          actorUserId,
        );
        return res as unknown as Record<string, unknown> & {
          version?: number;
          schemeId?: string | null;
          stateId?: string | null;
        };
      }
    }

    throw new BadRequestException(`Unsupported sync entity '${entity}' with action '${action}'`);
  }

  async pull(
    query: SyncPullQuery,
    authz: UserAuthz,
    actorUserId: string,
    deviceId?: string,
  ): Promise<SyncPullResponse> {
    let dev: Awaited<ReturnType<typeof this.syncRepo.findDevice>> | null = null;
    if (deviceId) {
      dev = await this.syncRepo.findDevice(deviceId);
      if (!dev) {
        throw new NotFoundException(`Device ${deviceId} not registered`);
      }
      if (dev.userId !== actorUserId) {
        throw new ForbiddenException('Device does not belong to the authenticated user');
      }
    }

    const scope = authz.scopeFor(permissions.SLIS_SYNC_PULL);

    // Parse cursor if provided: "${xid}:${seq}"
    let parsedCursor: { xid: string; seq: number } | undefined;
    if (query.cursor) {
      const parts = query.cursor.split(':');
      if (parts.length === 2 && parts[0] && parts[1]) {
        parsedCursor = {
          xid: parts[0],
          seq: parseInt(parts[1], 10),
        };
      }
    }

    const { items, nextCursor, hasMore } = await this.syncRepo.pullChanges(
      scope,
      parsedCursor,
      query.limit,
    );

    // Active scopes for the user
    const activeSchemeIds = scope.schemeIds ?? [];
    const activeStateIds = scope.stateIds ?? [];

    // Re-baseline detection: persist scope fingerprint in core.device (DB-backed, survives Redis flushes)
    let rebaseline = false;
    const currentScopeFingerprint = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          schemes: [...activeSchemeIds].sort(),
          states: [...activeStateIds].sort(),
        }),
      )
      .digest('hex');

    if (dev) {
      if (dev.scopeFingerprint !== currentScopeFingerprint) {
        rebaseline = true;
        await this.syncRepo.updateDeviceScopeFingerprint(dev.id, currentScopeFingerprint);
      } else if (!query.cursor) {
        rebaseline = true;
      }
    } else if (!query.cursor) {
      rebaseline = true;
    }

    return {
      items,
      nextCursor,
      hasMore,
      rebaseline,
      activeSchemeIds,
      activeStateIds,
    };
  }

  async listConflicts(query: ListSyncConflictsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_SYNC_CONFLICT_RESOLVE);
    return this.syncRepo.listConflicts(scope, query);
  }

  async resolveConflict(
    id: string,
    input: ResolveConflictInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.SLIS_SYNC_CONFLICT_RESOLVE);
    const conflict = await this.syncRepo.findConflictById(id, scope);
    if (!conflict) {
      throw new NotFoundException(`Sync conflict ${id} not found`);
    }

    return runInTransaction(async (txDb) => {
      if (input.resolution === 'keep_server') {
        return this.syncRepo.resolveConflict(id, actorUserId, 'resolved', txDb);
      }

      if (input.resolution === 'accept_device' || input.resolution === 'merge') {
        const payload =
          input.resolution === 'accept_device' ? conflict.devicePayload : input.mergedData;
        if (!payload) {
          throw new BadRequestException('Merged data is required for resolution mode "merge"');
        }

        // Apply resolution to entity
        await this.executeDomainOperation(
          conflict.entity,
          'update',
          conflict.recordId,
          conflict.serverVersion,
          payload as Record<string, unknown>,
          authz,
          actorUserId,
        );

        return this.syncRepo.resolveConflict(id, actorUserId, 'resolved', txDb);
      }

      throw new BadRequestException(`Unknown resolution strategy '${input.resolution}'`);
    });
  }

  async listQuarantine(query: ListSyncQuarantineQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_SYNC_CONFLICT_RESOLVE);
    return this.syncRepo.listQuarantines(scope, query);
  }

  async resolveQuarantine(
    id: string,
    input: ResolveQuarantineInput,
    authz: UserAuthz,
    reviewerId: string,
  ) {
    const scope = authz.scopeFor(permissions.SLIS_SYNC_CONFLICT_RESOLVE);
    const item = await this.syncRepo.findQuarantineById(id, scope);
    if (!item) {
      throw new NotFoundException(`Quarantined operation ${id} not found`);
    }

    return runInTransaction(async (txDb) => {
      if (input.resolution === 'applied') {
        // Re-run domain operation with permission, scope, and validation checks
        await this.executeDomainOperation(
          item.entity,
          item.action,
          item.recordId,
          item.baseVersion,
          item.payload as Record<string, unknown>,
          authz,
          reviewerId,
        );

        return this.syncRepo.resolveQuarantine(id, reviewerId, 'applied', undefined, txDb);
      }

      return this.syncRepo.resolveQuarantine(id, reviewerId, 'discarded', undefined, txDb);
    });
  }
}
