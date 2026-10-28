import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { db, outboxEvent, isNotNull, desc, count, eq, and } from '@idmis/db';
import { permissions } from '@idmis/contracts';
import type { ListDeadEventsResponse, RequeueEventResponse } from '@idmis/contracts';
import { Can } from '../auth';

@Controller('admin/outbox')
export class OutboxAdminController {
  @Get('dead')
  @Can(permissions.CORE_OUTBOX_MANAGE)
  async listDeadEvents(): Promise<ListDeadEventsResponse> {
    const items = await db
      .select()
      .from(outboxEvent)
      .where(isNotNull(outboxEvent.deadAt))
      .orderBy(desc(outboxEvent.deadAt))
      .limit(50);

    const [totalRes] = await db
      .select({ count: count() })
      .from(outboxEvent)
      .where(isNotNull(outboxEvent.deadAt));

    return {
      items: items.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        eventVersion: e.eventVersion,
        aggregateType: e.aggregateType,
        aggregateId: e.aggregateId,
        payload: e.payload,
        occurredAt: new Date(e.occurredAt),
        availableAt: new Date(e.availableAt),
        attempts: e.attempts,
        lastError: e.lastError,
        deadAt: new Date(e.deadAt!),
      })),
      total: totalRes?.count ?? items.length,
    };
  }

  @Post(':id/requeue')
  @HttpCode(HttpStatus.OK)
  @Can(permissions.CORE_OUTBOX_MANAGE)
  async requeueDeadEvent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<RequeueEventResponse> {
    const nowIso = new Date().toISOString();
    const updated = await db
      .update(outboxEvent)
      .set({
        attempts: 0,
        lastError: null,
        deadAt: null,
        availableAt: nowIso,
      })
      .where(and(eq(outboxEvent.id, id), isNotNull(outboxEvent.deadAt)))
      .returning();

    if (updated.length === 0) {
      throw new NotFoundException(`Dead outbox event with id '${id}' not found`);
    }

    return {
      id,
      requeued: true,
      availableAt: new Date(nowIso),
    };
  }
}
