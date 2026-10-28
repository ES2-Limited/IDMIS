import { Module } from '@nestjs/common';
import { OutboxAdminController } from './outbox-admin.controller';

@Module({
  controllers: [OutboxAdminController],
})
export class OutboxModule {}
