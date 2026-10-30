import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { RedisService } from '../../../platform/redis/redis.service';
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
    private readonly redisService: RedisService,
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

    const now = new Date();
    const isRevoked = Boolean(dev.revokedAt);
    const isGrantExpired = dev.offlineGrantUntil
      ? new Date(dev.offlineGrantUntil).getTime() < now.getTime()
      : false;

    // Load existing ops to enforce idempotency
    const opIds = input.ops.map((op) => op.opId);
    const existingOps = await this.syncRepo.findExistingSyncOps(opIds);
    const existingMap = new Map(existingOps.map((e) => [e.opId, e]));

    const results: SyncPushResponse['results'] = [];

    for (const op of input.ops) {
      // 1. Idempotency Check
      const existing = existingMap.get(op.opId);
      if (existing) {
        results.push({
          opId: existing.opId,
          entity: existing.entity,
          recordId: existing.recordId,
          outcome: existing.outcome as SyncOutcome,
          newVersion: existing.newVersion ?? undefined,
          errors: (existing.errors as SyncOpError[]) ?? undefined,
        });
        continue;
      }

      // 2. Quarantine Check
      if (isRevoked || isGrantExpired) {
        const reason = isRevoked ? 'device_revoked' : 'grant_expired';
        await this.syncRepo.recordSyncOp({
          opId: op.opId,
          deviceId: input.deviceId,
          entity: op.entity,
          recordId: op.recordId,
          outcome: 'quarantined',
        });

        const quarantined = await this.syncRepo.recordQuarantine({
          deviceId: input.deviceId,
          opId: op.opId,
          entity: op.entity,
          action: op.action,
          recordId: op.recordId,
          baseVersion: op.baseVersion,
          payload: op.data,
          reason,
        });

        results.push({
          opId: op.opId,
          entity: op.entity,
          recordId: op.recordId,
          outcome: 'quarantined',
          quarantineId: quarantined.id,
          quarantineReason: reason,
        });
        continue;
      }

      // 3. Domain Service Execution with Exact Same Permissions & Scope
      try {
        const domainResult = await this.executeDomainOperation(
          op.entity,
          op.action,
          op.recordId,
          op.baseVersion,
          op.data,
          authz,
          actorUserId,
        );

        // Record in change_log for synchronization pull
        await this.syncRepo.writeChangeLog({
          entity: op.entity,
          recordId: op.recordId,
          op: 'upsert',
          schemeId: domainResult.schemeId ?? (op.data.schemeId as string | undefined),
          stateId: domainResult.stateId ?? (op.data.stateId as string | undefined),
          data: this.stripSensitiveData(domainResult),
        });

        await this.syncRepo.recordSyncOp({
          opId: op.opId,
          deviceId: input.deviceId,
          entity: op.entity,
          recordId: op.recordId,
          outcome: 'applied',
          newVersion: domainResult.version,
        });

        results.push({
          opId: op.opId,
          entity: op.entity,
          recordId: op.recordId,
          outcome: 'applied',
          newVersion: domainResult.version,
        });
      } catch (err: unknown) {
        if (err instanceof ConflictProblemException) {
          await this.syncRepo.recordSyncOp({
            opId: op.opId,
            deviceId: input.deviceId,
            entity: op.entity,
            recordId: op.recordId,
            outcome: 'conflict',
          });

          const currentPayload =
            err.current && typeof err.current === 'object'
              ? (err.current as Record<string, unknown>)
              : {};
          const schemeId =
            typeof currentPayload.schemeId === 'string'
              ? currentPayload.schemeId
              : (op.data.schemeId as string | undefined);

          const conflict = await this.syncRepo.recordConflict({
            opId: op.opId,
            entity: op.entity,
            recordId: op.recordId,
            baseVersion: op.baseVersion,
            serverVersion: err.currentVersion ?? 2,
            devicePayload: op.data,
            serverPayload: currentPayload,
            schemeId,
          });

          results.push({
            opId: op.opId,
            entity: op.entity,
            recordId: op.recordId,
            outcome: 'conflict',
            conflictId: conflict.id,
          });
        } else {
          const error = err as Error & { getStatus?: () => number };
          const status = typeof error.getStatus === 'function' ? error.getStatus() : 400;
          const errorObj = [{ status, detail: error.message || 'Operation failed' }];

          await this.syncRepo.recordSyncOp({
            opId: op.opId,
            deviceId: input.deviceId,
            entity: op.entity,
            recordId: op.recordId,
            outcome: 'rejected',
            errors: errorObj,
          });

          results.push({
            opId: op.opId,
            entity: op.entity,
            recordId: op.recordId,
            outcome: 'rejected',
            errors: errorObj,
          });
        }
      }
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

  private stripSensitiveData(obj: Record<string, unknown>): Record<string, unknown> {
    const stripped = { ...obj };
    // Remove ciphertexts, hash keys, and unmasked fields if any
    delete stripped.numberEnc;
    delete stripped.numberHash;
    delete stripped.bankAccountEnc;
    return stripped;
  }

  async pull(query: SyncPullQuery, authz: UserAuthz, deviceId?: string): Promise<SyncPullResponse> {
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

    // Re-baseline detection: check if device scope grew or shrank
    let rebaseline = false;
    if (deviceId) {
      const scopeKey = `device:scope:${deviceId}`;
      const cachedScopeStr = await this.redisService.get(scopeKey);
      const currentScopePayload = JSON.stringify({
        schemes: [...activeSchemeIds].sort(),
        states: [...activeStateIds].sort(),
      });

      if (cachedScopeStr && cachedScopeStr !== currentScopePayload) {
        rebaseline = true;
      } else if (!query.cursor) {
        rebaseline = true;
      }

      await this.redisService.set(scopeKey, currentScopePayload);
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

    if (input.resolution === 'keep_server') {
      return this.syncRepo.resolveConflict(id, actorUserId, 'resolved');
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

      return this.syncRepo.resolveConflict(id, actorUserId, 'resolved');
    }

    throw new BadRequestException(`Unknown resolution strategy '${input.resolution}'`);
  }

  async listQuarantine(query: ListSyncQuarantineQuery, authz: UserAuthz) {
    authz.scopeFor(permissions.SLIS_SYNC_CONFLICT_RESOLVE);
    return this.syncRepo.listQuarantines(query);
  }

  async resolveQuarantine(
    id: string,
    input: ResolveQuarantineInput,
    authz: UserAuthz,
    reviewerId: string,
  ) {
    authz.scopeFor(permissions.SLIS_SYNC_CONFLICT_RESOLVE);
    const item = await this.syncRepo.findQuarantineById(id);
    if (!item) {
      throw new NotFoundException(`Quarantined operation ${id} not found`);
    }

    if (input.resolution === 'applied') {
      // Re-run domain operation with permission, scope, and validation checks
      const domainResult = await this.executeDomainOperation(
        item.entity,
        item.action,
        item.recordId,
        item.baseVersion,
        item.payload as Record<string, unknown>,
        authz,
        reviewerId,
      );

      await this.syncRepo.writeChangeLog({
        entity: item.entity,
        recordId: item.recordId,
        op: 'upsert',
        schemeId: domainResult.schemeId,
        stateId: domainResult.stateId,
        data: this.stripSensitiveData(domainResult),
      });

      return this.syncRepo.resolveQuarantine(id, reviewerId, 'applied');
    }

    return this.syncRepo.resolveQuarantine(id, reviewerId, 'discarded');
  }
}
