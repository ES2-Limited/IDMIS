import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Res,
  UnauthorizedException,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  permissions,
  InitiateImportInputSchema,
  ListImportBatchesQuerySchema,
  type InitiateImportInput,
  type ListImportBatchesQuery,
  type ImportRowStatus,
} from '@idmis/contracts';
import { ImportService } from '../services/import.service';
import { ImportTemplateService } from '../services/import-template.service';
import { RedisService } from '../../../platform/redis/redis.service';
import { Can, CurrentAuthz, Public, type UserAuthz } from '../../../platform/auth';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('imports')
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly templateService: ImportTemplateService,
    private readonly redisService: RedisService,
  ) {}

  @Get('template/:dataset')
  @Can(permissions.CORE_IMPORT_RUN)
  async downloadTemplate(@Param('dataset') dataset: string, @Res() res: FastifyReply) {
    const buffer = await this.templateService.generateTemplateBuffer(dataset);
    res.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header(
      'content-disposition',
      `attachment; filename="template-${encodeURIComponent(dataset)}.xlsx"`,
    );
    return res.send(buffer);
  }

  @Post()
  @Can(permissions.CORE_IMPORT_RUN)
  async initiateImport(
    @Body(new ZodValidationPipe(InitiateImportInputSchema)) body: InitiateImportInput,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.importService.initiateImport(body, authz);
  }

  @Get()
  @Can(permissions.CORE_IMPORT_RUN)
  async listBatches(
    @Query(new ZodValidationPipe(ListImportBatchesQuerySchema)) query: ListImportBatchesQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.importService.listBatches(query, authz);
  }

  @Get(':batchId')
  @Can(permissions.CORE_IMPORT_RUN)
  async getBatch(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.importService.getBatch(batchId, authz);
  }

  @Get(':batchId/preview')
  @Can(permissions.CORE_IMPORT_RUN)
  async getPreview(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: ImportRowStatus,
    @CurrentAuthz() authz?: UserAuthz,
  ) {
    return this.importService.getPreview(
      batchId,
      {
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 50,
        status,
      },
      authz!,
    );
  }

  @Post(':batchId/commit')
  @Can(permissions.CORE_IMPORT_RUN)
  async commitBatch(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.importService.commitBatch(batchId, authz);
  }

  @Post(':batchId/undo')
  @Can(permissions.CORE_IMPORT_RUN)
  async undoBatch(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.importService.undoBatch(batchId, authz);
  }

  @Post(':batchId/token')
  @Can(permissions.CORE_IMPORT_RUN)
  async generateSseToken(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.importService.generateSseToken(batchId, authz);
  }

  @Get(':batchId/progress')
  @Public()
  async streamProgress(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Query('token') token: string,
    @Query('once') once: string,
    @Res() res: FastifyReply,
  ) {
    const isValid = await this.importService.validateSseToken(batchId, token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired SSE progress token');
    }

    res.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial ping/connection message
    res.raw.write(
      `data: ${JSON.stringify({ type: 'connected', batchId, timestamp: new Date().toISOString() })}\n\n`,
    );

    if (once === 'true') {
      res.raw.end();
      return;
    }

    // Subscribe to Redis channel for real-time progress events
    const channel = `import:progress:${batchId}`;
    const unsubscribe = this.redisService.subscribe(channel, (msg) => {
      res.raw.write(`data: ${msg}\n\n`);
    });

    res.raw.on('close', () => {
      unsubscribe();
    });
  }
}
