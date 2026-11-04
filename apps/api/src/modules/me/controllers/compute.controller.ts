import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  permissions,
  TriggerMeComputeInputSchema,
  GetIndicatorMatrixQuerySchema,
  type TriggerMeComputeInput,
  type GetIndicatorMatrixQuery,
  type IndicatorMatrixResponse,
} from '@idmis/contracts';
import { Can, CurrentAuthz, type UserAuthz } from '../../../platform/auth';
import { MeComputeService } from '../services/me-compute.service';
import { IndicatorMatrixRepository } from '../repositories/indicator-matrix.repository';
import { isMeInScope, resolveMeScopeLocation } from '../utils/assert-me-scope';

@Controller('me')
export class ComputeController {
  constructor(
    private readonly computeService: MeComputeService,
    private readonly matrixRepo: IndicatorMatrixRepository,
  ) {}

  @Post('compute')
  @Can(permissions.ME_INDICATOR_MANAGE)
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerCompute(@Body() body: TriggerMeComputeInput) {
    const validated = TriggerMeComputeInputSchema.parse(body);
    await this.computeService.enqueueCompute(validated);
    return { message: 'Compute job enqueued' };
  }

  @Get('matrix')
  @Can(permissions.ME_INDICATOR_READ)
  async getMatrix(
    @Query() query: GetIndicatorMatrixQuery,
    @CurrentAuthz() authz: UserAuthz,
  ): Promise<IndicatorMatrixResponse> {
    const validated = GetIndicatorMatrixQuerySchema.parse(query);
    const scope = authz.scopeFor(permissions.ME_INDICATOR_READ);

    if (validated.scopeType && validated.scopeId) {
      const resolved = await resolveMeScopeLocation({
        scopeType: validated.scopeType,
        scopeStateId: validated.scopeType === 'state' ? validated.scopeId : null,
        scopeOrgId: validated.scopeType === 'scheme' ? validated.scopeId : null,
      });
      if (!isMeInScope(scope, resolved)) {
        throw new NotFoundException('Requested scope not found or out of scope');
      }
    }

    return this.matrixRepo.getMatrix(validated, scope);
  }
}
