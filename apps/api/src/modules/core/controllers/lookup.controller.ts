import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { permissions, type ModuleKey } from '@idmis/contracts';
import { LookupService } from '../services/lookup.service';
import { Can } from '../../../platform/auth';

@Controller('admin/lookups')
export class LookupController {
  constructor(private readonly lookupService: LookupService) {}

  @Get('types')
  @Can(permissions.CORE_LOOKUP_READ)
  async listTypes(@Query('module') module?: ModuleKey) {
    return this.lookupService.listTypes(module);
  }

  @Post('types')
  @Can(permissions.CORE_LOOKUP_MANAGE)
  async createType(
    @Body() body: { key: string; name: string; module: ModuleKey; isSystem?: boolean },
  ) {
    return this.lookupService.createType(body);
  }

  @Get('values')
  @Can(permissions.CORE_LOOKUP_READ)
  async listValues(@Query('typeKey') typeKey: string, @Query('isActive') isActive?: boolean) {
    return this.lookupService.listValues(typeKey, isActive);
  }

  @Post('values')
  @Can(permissions.CORE_LOOKUP_MANAGE)
  async createValue(
    @Body()
    body: {
      lookupTypeId: string;
      code: string;
      label: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.lookupService.createValue(body);
  }

  @Patch('values/:id')
  @Can(permissions.CORE_LOOKUP_MANAGE)
  async updateValue(
    @Param('id') id: string,
    @Body() body: { label?: string; sortOrder?: number; isActive?: boolean },
  ) {
    return this.lookupService.updateValue(id, body);
  }
}
