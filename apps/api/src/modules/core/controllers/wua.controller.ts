import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateWuaInputSchema,
  CreateWuaOfficerInputSchema,
  ListWuasQuerySchema,
  UpdateWuaInputSchema,
  permissions,
  type CreateWuaInput,
  type CreateWuaOfficerInput,
  type ListWuasQuery,
  type UpdateWuaInput,
} from '@idmis/contracts';
import { WuaService } from '../services/wua.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('wuas')
export class WuaController {
  constructor(private readonly wuaService: WuaService) {}

  @Get()
  @Can(permissions.CORE_WUA_READ)
  async listWuas(
    @Query(new ZodValidationPipe(ListWuasQuerySchema)) query: ListWuasQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.wuaService.listWuas(query, authz);
  }

  @Post()
  @Can(permissions.CORE_WUA_MANAGE)
  async createWua(
    @Body(new ZodValidationPipe(CreateWuaInputSchema)) input: CreateWuaInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wuaService.createWua(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.CORE_WUA_READ)
  async getWua(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.wuaService.getWua(id, authz);
  }

  @Patch(':id')
  @Can(permissions.CORE_WUA_MANAGE)
  async updateWua(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateWuaInputSchema)) input: UpdateWuaInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.wuaService.updateWua(id, version, input, authz, user.id);
  }

  @Post(':id/officers')
  @Can(permissions.CORE_WUA_MANAGE)
  async addOfficer(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateWuaOfficerInputSchema)) input: CreateWuaOfficerInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wuaService.addOfficer(id, { ...input, wuaId: id }, authz, user.id);
  }

  @Delete(':id/officers/:officerId')
  @Can(permissions.CORE_WUA_MANAGE)
  async removeOfficer(
    @Param('id') id: string,
    @Param('officerId') officerId: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wuaService.removeOfficer(id, officerId, authz, user.id);
  }
}
