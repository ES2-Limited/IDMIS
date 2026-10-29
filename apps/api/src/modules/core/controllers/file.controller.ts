import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import {
  CompleteUploadInputSchema,
  InitiateUploadInputSchema,
  permissions,
  type CompleteUploadInput,
  type InitiateUploadInput,
} from '@idmis/contracts';
import { FileService } from '../services/file.service';
import { Can, CurrentUser } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';
import { ZodValidationPipe } from '../../../platform/pipes/zod-validation.pipe';

@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('upload/initiate')
  @Can(permissions.CORE_FILE_UPLOAD)
  async initiateUpload(
    @Body(new ZodValidationPipe(InitiateUploadInputSchema)) input: InitiateUploadInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.fileService.initiateUpload(input, user.id);
  }

  @Post('upload/complete')
  @Can(permissions.CORE_FILE_UPLOAD)
  async completeUpload(
    @Body(new ZodValidationPipe(CompleteUploadInputSchema)) input: CompleteUploadInput,
    @CurrentUser() user: RequestUser,
  ) {
    return this.fileService.completeUpload(input, user.id);
  }

  @Get(':id/download')
  @Can(permissions.CORE_FILE_READ)
  async getDownloadUrl(@Param('id') id: string) {
    return this.fileService.getDownloadUrl(id);
  }

  @Get(':id')
  @Can(permissions.CORE_FILE_READ)
  async getFile(@Param('id') id: string) {
    return this.fileService.getFile(id);
  }

  @Delete(':id')
  @Can(permissions.CORE_FILE_UPLOAD)
  async deleteFile(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.fileService.deleteFile(id, user.id);
  }
}
