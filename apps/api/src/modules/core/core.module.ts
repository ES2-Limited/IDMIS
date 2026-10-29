import { Module } from '@nestjs/common';
import { StorageModule } from '../../platform/storage/storage.module';
import { FileRepository } from './repositories/file.repository';
import { FileService } from './services/file.service';
import { FileController } from './controllers/file.controller';

@Module({
  imports: [StorageModule],
  controllers: [FileController],
  providers: [FileRepository, FileService],
  exports: [FileRepository, FileService, StorageModule],
})
export class CoreModule {}
