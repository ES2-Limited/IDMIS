import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateAppUserInputSchema,
  ListAppUsersQuerySchema,
  UpdateAppUserInputSchema,
  permissions,
  type CreateAppUserInput,
  type ListAppUsersQuery,
  type UpdateAppUserInput,
} from '@idmis/contracts';
import { UserService } from '../services/user.service';
import { Can, CurrentUser } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('admin/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Can(permissions.CORE_USER_READ)
  async listUsers(@Query(new ZodValidationPipe(ListAppUsersQuerySchema)) query: ListAppUsersQuery) {
    return this.userService.listUsers(query);
  }

  @Post()
  @Can(permissions.CORE_USER_CREATE)
  async createUser(
    @Body(new ZodValidationPipe(CreateAppUserInputSchema)) input: CreateAppUserInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.userService.createUser(input, user.id);
  }

  @Get(':id')
  @Can(permissions.CORE_USER_READ)
  async getUser(@Param('id') id: string) {
    return this.userService.getUser(id);
  }

  @Patch(':id')
  @Can(permissions.CORE_USER_UPDATE)
  async updateUser(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAppUserInputSchema)) input: UpdateAppUserInput,
    @CurrentUser() user: RequestUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const version = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : 1;
    return this.userService.updateUser(id, version, input, user.id);
  }

  @Delete(':id')
  @Can(permissions.CORE_USER_DEACTIVATE)
  async deactivateUser(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.userService.deactivateUser(id, user.id);
  }
}
