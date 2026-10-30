import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateTrainingInputSchema,
  ListTrainingAttendanceQuerySchema,
  ListTrainingsQuerySchema,
  RecordTrainingAttendanceInputSchema,
  permissions,
  type CreateTrainingInput,
  type ListTrainingAttendanceQuery,
  type ListTrainingsQuery,
  type RecordTrainingAttendanceInput,
  type UpdateTrainingInput,
  UpdateTrainingInputSchema,
} from '@idmis/contracts';
import { TrainingService } from '../services/training.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('slis/trainings')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Get()
  @Can(permissions.SLIS_TRAINING_MANAGE)
  async listTrainings(
    @Query(new ZodValidationPipe(ListTrainingsQuerySchema)) query: ListTrainingsQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.trainingService.listTrainings(query, authz);
  }

  @Post()
  @Can(permissions.SLIS_TRAINING_MANAGE)
  async createTraining(
    @Body(new ZodValidationPipe(CreateTrainingInputSchema)) input: CreateTrainingInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.trainingService.createTraining(input, authz, user.id);
  }

  @Get(':id')
  @Can(permissions.SLIS_TRAINING_MANAGE)
  async getTraining(@Param('id') id: string, @CurrentAuthz() authz: UserAuthz) {
    return this.trainingService.getTraining(id, authz);
  }

  @Patch(':id')
  @Can(permissions.SLIS_TRAINING_MANAGE)
  async updateTraining(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateTrainingInputSchema)) input: UpdateTrainingInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.trainingService.updateTraining(id, version, input, authz, user.id);
  }

  @Post(':id/attendance')
  @Can(permissions.SLIS_TRAINING_MANAGE)
  async recordAttendanceForTraining(
    @Param('id') trainingId: string,
    @Body() body: Record<string, unknown>,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    const result = RecordTrainingAttendanceInputSchema.safeParse({
      ...body,
      trainingId,
    });
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'payload',
        message: issue.message,
        code: issue.code,
      }));
      throw new BadRequestException({
        message: 'The payload contains invalid fields',
        errors,
      });
    }
    return this.trainingService.recordAttendance(result.data, authz, user.id);
  }

  @Post('attendance')
  @Can(permissions.SLIS_TRAINING_MANAGE)
  async recordAttendance(
    @Body(new ZodValidationPipe(RecordTrainingAttendanceInputSchema))
    input: RecordTrainingAttendanceInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.trainingService.recordAttendance(input, authz, user.id);
  }

  @Get(':id/attendance')
  @Can(permissions.SLIS_TRAINING_MANAGE)
  async listAttendance(
    @Param('id') trainingId: string,
    @Query(new ZodValidationPipe(ListTrainingAttendanceQuerySchema))
    query: ListTrainingAttendanceQuery,
    @CurrentAuthz() authz: UserAuthz,
  ) {
    return this.trainingService.listAttendance(trainingId, query, authz);
  }
}
