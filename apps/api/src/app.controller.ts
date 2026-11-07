import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { HealthCheckResponse } from '@idmis/contracts';
import { Public } from './platform/auth';
import { HealthService } from './platform/health/health.service';

@Controller()
export class AppController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('health')
  async getHealth(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthCheckResponse> {
    const result = await this.healthService.checkAll();
    if (result.status !== 'ok') {
      reply.status(503);
    }
    return result;
  }
}
