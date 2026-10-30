import {
  Controller,
  Get,
  Header,
  Param,
  Res,
  NotFoundException,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { buildOpenApiDocument, type OpenApiDoc } from './openapi.builder';
import { Public } from '../auth';
import { getSwaggerUiHtml, serveSwaggerUiStaticAsset, isApiDocsEnabled } from './swagger-ui.helper';

@Public()
@Controller('docs')
export class OpenApiController implements OnApplicationBootstrap {
  private readonly logger = new Logger(OpenApiController.name);

  onApplicationBootstrap() {
    if (!isApiDocsEnabled()) {
      this.logger.log('API docs are disabled');
    } else {
      this.logger.log('API documentation enabled at /docs (spec: /docs/openapi.json)');
    }
  }

  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  getDocsUi(): string {
    if (!isApiDocsEnabled()) {
      throw new NotFoundException('API documentation disabled');
    }
    return getSwaggerUiHtml();
  }

  @Get('openapi.json')
  @Header('content-type', 'application/json; charset=utf-8')
  getOpenApiSpec(): OpenApiDoc {
    if (!isApiDocsEnabled()) {
      throw new NotFoundException('API documentation disabled');
    }
    return buildOpenApiDocument();
  }

  @Get('static/*')
  getStaticAsset(@Param('*') filename: string, @Res() res: FastifyReply) {
    if (!isApiDocsEnabled()) {
      throw new NotFoundException('API documentation disabled');
    }
    return serveSwaggerUiStaticAsset(filename, res);
  }
}
