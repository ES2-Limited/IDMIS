import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { AntivirusService } from './antivirus.service';

@Module({
  providers: [StorageService, AntivirusService],
  exports: [StorageService, AntivirusService],
})
export class StorageModule {}
