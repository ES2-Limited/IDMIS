import { Controller, Get, Header } from '@nestjs/common';
import { buildOpenApiDocument, type OpenApiDoc } from './openapi.builder';
import { Public } from '../auth';

@Public()
@Controller('docs')
export class OpenApiController {
  @Get('openapi.json')
  @Header('content-type', 'application/json; charset=utf-8')
  getOpenApiSpec(): OpenApiDoc {
    return buildOpenApiDocument();
  }
}
