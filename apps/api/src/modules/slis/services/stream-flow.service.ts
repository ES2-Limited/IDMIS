import { Injectable, NotFoundException } from '@nestjs/common';
import {
  permissions,
  type ListStreamFlowReadingsQuery,
  type RecordStreamFlowInput,
  type StreamFlowReadingResponse,
} from '@idmis/contracts';
import { StreamFlowRepository } from '../repositories/stream-flow.repository';
import { BlisStationStubService } from '../../blis/public';
import { assertInScope, type UserAuthz } from '../../../platform/auth';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import { enqueueOutboxEvent } from '../../../platform/outbox/outbox.service';

@Injectable()
export class StreamFlowService {
  constructor(
    private readonly streamFlowRepo: StreamFlowRepository,
    private readonly blisStationStub: BlisStationStubService,
  ) {}

  private mapToResponse(row: Record<string, unknown>): StreamFlowReadingResponse {
    return {
      id: String(row.id),
      schemeId: String(row.schemeId),
      stationId: String(row.stationId),
      readAt: typeof row.readAt === 'string' ? row.readAt : (row.readAt as Date).toISOString(),
      value: String(row.value),
      unit: String(row.unit),
      status: row.status as StreamFlowReadingResponse['status'],
      submittedBy: (row.submittedBy as string | null) ?? null,
      submittedAt: (row.submittedAt as string | null) ?? null,
      approvedBy: (row.approvedBy as string | null) ?? null,
      approvedAt: (row.approvedAt as string | null) ?? null,
      returnedBy: (row.returnedBy as string | null) ?? null,
      returnedAt: (row.returnedAt as string | null) ?? null,
      returnComment: (row.returnComment as string | null) ?? null,
      deviceId: (row.deviceId as string | null) ?? null,
      importBatchId: (row.importBatchId as string | null) ?? null,
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
      version: Number(row.version),
    };
  }

  async listStreamFlows(query: ListStreamFlowReadingsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_STREAM_FLOW_RECORD);
    const result = await this.streamFlowRepo.listStreamFlows(scope, query);
    return {
      items: result.items.map((r) => this.mapToResponse(r)),
      nextCursor: result.nextCursor,
    };
  }

  async getStreamFlow(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.SLIS_STREAM_FLOW_RECORD);
    const row = await this.streamFlowRepo.findById(id, scope);
    if (!row) {
      throw new NotFoundException(`Stream flow reading ${id} not found`);
    }
    return this.mapToResponse(row);
  }

  async recordStreamFlow(input: RecordStreamFlowInput, authz: UserAuthz, actorUserId: string) {
    await assertInScope(authz, permissions.SLIS_STREAM_FLOW_RECORD, {
      organisationId: input.schemeId,
    });

    const stationExists = await this.blisStationStub.stationExists(input.stationId);
    if (!stationExists) {
      throw new NotFoundException(`Station ${input.stationId} not found`);
    }

    const streamFlowId = input.id ?? crypto.randomUUID();

    return runInTransaction(
      async (tx) => {
        const created = await this.streamFlowRepo.create(
          {
            id: streamFlowId,
            schemeId: input.schemeId,
            stationId: input.stationId,
            readAt: input.readAt,
            value: input.value,
            unit: input.unit,
            createdBy: actorUserId,
          },
          tx,
        );

        await enqueueOutboxEvent(tx, {
          eventType: 'slis.stream_flow.recorded',
          aggregateType: 'stream_flow_reading',
          aggregateId: created.id,
          payload: {
            streamFlowId: created.id,
            schemeId: created.schemeId,
            stationId: created.stationId,
            value: created.value,
            unit: created.unit,
            readAt: created.readAt,
            createdBy: actorUserId,
          },
        });

        return this.mapToResponse(created);
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'create',
          entity: 'slis.stream_flow_reading',
          entityId: streamFlowId,
          after: input,
        },
      },
    );
  }
}
