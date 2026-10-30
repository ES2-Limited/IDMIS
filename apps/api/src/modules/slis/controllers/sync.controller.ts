import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import {
  ListSyncConflictsQuerySchema,
  ListSyncQuarantineQuerySchema,
  RegisterDeviceInputSchema,
  ResolveConflictInputSchema,
  ResolveQuarantineInputSchema,
  SyncPullQuerySchema,
  SyncPushInputSchema,
  permissions,
  type ListSyncConflictsQuery,
  type ListSyncQuarantineQuery,
  type RegisterDeviceInput,
  type ResolveConflictInput,
  type ResolveQuarantineInput,
  type SyncPullQuery,
  type SyncPushInput,
} from '@idmis/contracts';
import { SyncService } from '../services/sync.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('device/register')
  @Can(permissions.SLIS_SYNC_PUSH)
  async registerDevice(
    @Body(new ZodValidationPipe(RegisterDeviceInputSchema)) body: RegisterDeviceInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.syncService.registerDevice(user.id, body);
  }

  @Post('push')
  @Can(permissions.SLIS_SYNC_PUSH)
  async push(
    @Body(new ZodValidationPipe(SyncPushInputSchema)) body: SyncPushInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.syncService.push(body, authz, user.id);
  }

  @Get('pull')
  @Can(permissions.SLIS_SYNC_PULL)
  async pull(
    @Query(new ZodValidationPipe(SyncPullQuerySchema)) query: SyncPullQuery,
    @CurrentAuthz() authz: UserAuthz,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.syncService.pull(query, authz, deviceId);
  }

  @Get('conflicts')
  @Can(permissions.SLIS_SYNC_CONFLICT_RESOLVE)
  async listConflicts(
    @Query(new ZodValidationPipe(ListSyncConflictsQuerySchema)) query: ListSyncConflictsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.syncService.listConflicts(query, authz);
  }

  @Post('conflicts/:id/resolve')
  @Can(permissions.SLIS_SYNC_CONFLICT_RESOLVE)
  async resolveConflict(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ResolveConflictInputSchema)) body: ResolveConflictInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.syncService.resolveConflict(id, body, authz, user.id);
  }

  @Get('quarantine')
  @Can(permissions.SLIS_SYNC_CONFLICT_RESOLVE)
  async listQuarantine(
    @Query(new ZodValidationPipe(ListSyncQuarantineQuerySchema)) query: ListSyncQuarantineQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.syncService.listQuarantine(query, authz);
  }

  @Post('quarantine/:id/resolve')
  @Can(permissions.SLIS_SYNC_CONFLICT_RESOLVE)
  async resolveQuarantine(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ResolveQuarantineInputSchema)) body: ResolveQuarantineInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.syncService.resolveQuarantine(id, body, authz, user.id);
  }
}
