import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import {
  CreateAssignmentInputSchema,
  permissions,
  type CreateAssignmentInput,
} from '@idmis/contracts';
import { AssignmentService } from '../services/assignment.service';
import { Can, CurrentAuthz, CurrentUser, type UserAuthz } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('admin/assignments')
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  @Get('users/:userId')
  @Can(permissions.CORE_ASSIGNMENT_READ)
  async listUserAssignments(@Param('userId') userId: string) {
    return this.assignmentService.listUserAssignments(userId);
  }

  @Post()
  @Can(permissions.CORE_ASSIGNMENT_MANAGE)
  async createAssignment(
    @Body(new ZodValidationPipe(CreateAssignmentInputSchema)) input: CreateAssignmentInput,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assignmentService.createAssignment(input, authz, user.id);
  }

  @Delete(':id')
  @Can(permissions.CORE_ASSIGNMENT_MANAGE)
  async deleteAssignment(
    @Param('id') id: string,
    @CurrentAuthz() authz: UserAuthz,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assignmentService.deleteAssignment(id, authz, user.id);
  }
}
