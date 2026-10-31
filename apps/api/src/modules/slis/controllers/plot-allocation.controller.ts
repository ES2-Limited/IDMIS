import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreatePlotAllocationInputSchema,
  ListPlotAllocationsQuerySchema,
  UpdatePlotAllocationInputSchema,
  permissions,
  type CreatePlotAllocationInput,
  type ListPlotAllocationsQuery,
  type UpdatePlotAllocationInput,
} from '@idmis/contracts';
import { PlotAllocationService } from '../services/plot-allocation.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/allocations')
export class PlotAllocationController {
  constructor(private readonly allocationService: PlotAllocationService) {}

  @Get()
  @Can(permissions.SLIS_PLOT_READ)
  async listAllocations(
    @Query(new ZodValidationPipe(ListPlotAllocationsQuerySchema))
    query: ListPlotAllocationsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.allocationService.listAllocations(query, authz);
  }

  @Post()
  @Can(permissions.SLIS_ALLOCATION_MANAGE)
  async createAllocation(
    @Body(new ZodValidationPipe(CreatePlotAllocationInputSchema))
    input: CreatePlotAllocationInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.allocationService.createAllocation(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.SLIS_PLOT_READ)
  async getAllocation(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.allocationService.getAllocation(id, authz);
  }

  @Patch(':id')
  @Can(permissions.SLIS_ALLOCATION_MANAGE)
  async updateAllocation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePlotAllocationInputSchema))
    input: UpdatePlotAllocationInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.allocationService.updateAllocation(id, version, input, authz, user.id);
  }

  @Post(':id/deallocate')
  @Can(permissions.SLIS_ALLOCATION_MANAGE)
  async deallocate(
    @Param('id') id: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.allocationService.deallocate(id, version, authz, user.id);
  }
}
