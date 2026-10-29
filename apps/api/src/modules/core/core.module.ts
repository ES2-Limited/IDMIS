import { Module } from '@nestjs/common';
import { StorageModule } from '../../platform/storage/storage.module';
import { EncryptionService } from '../../platform/security/encryption.service';
import { FileRepository } from './repositories/file.repository';
import { FileService } from './services/file.service';
import { FileController } from './controllers/file.controller';

import { UserRepository } from './repositories/user.repository';
import { UserService } from './services/user.service';
import { UserController } from './controllers/user.controller';

import { AssignmentRepository } from './repositories/assignment.repository';
import { AssignmentService } from './services/assignment.service';
import { AssignmentController } from './controllers/assignment.controller';

import { OrganisationRepository } from './repositories/organisation.repository';
import { OrganisationService } from './services/organisation.service';
import { OrganisationController } from './controllers/organisation.controller';

import { WuaRepository } from './repositories/wua.repository';
import { WuaService } from './services/wua.service';
import { WuaController } from './controllers/wua.controller';

import { GeographyRepository } from './repositories/geography.repository';
import { GeographyService } from './services/geography.service';
import { GeographyController } from './controllers/geography.controller';

import { LookupRepository } from './repositories/lookup.repository';
import { LookupService } from './services/lookup.service';
import { LookupController } from './controllers/lookup.controller';

import { SettingRepository } from './repositories/setting.repository';
import { SettingService } from './services/setting.service';
import { SettingController } from './controllers/setting.controller';

import { AuditRepository } from './repositories/audit.repository';
import { AuditService } from './services/audit.service';
import { AuditController } from './controllers/audit.controller';

import { ImportRepository } from './repositories/import.repository';
import { ImportTemplateService } from './services/import-template.service';
import { ImportService } from './services/import.service';
import { ImportController } from './controllers/import.controller';

@Module({
  imports: [StorageModule],
  controllers: [
    FileController,
    UserController,
    AssignmentController,
    OrganisationController,
    WuaController,
    GeographyController,
    LookupController,
    SettingController,
    AuditController,
    ImportController,
  ],
  providers: [
    EncryptionService,
    FileRepository,
    FileService,
    UserRepository,
    UserService,
    AssignmentRepository,
    AssignmentService,
    OrganisationRepository,
    OrganisationService,
    WuaRepository,
    WuaService,
    GeographyRepository,
    GeographyService,
    LookupRepository,
    LookupService,
    SettingRepository,
    SettingService,
    AuditRepository,
    AuditService,
    ImportRepository,
    ImportTemplateService,
    ImportService,
  ],
  exports: [
    EncryptionService,
    FileRepository,
    FileService,
    UserRepository,
    UserService,
    AssignmentRepository,
    AssignmentService,
    OrganisationRepository,
    OrganisationService,
    WuaRepository,
    WuaService,
    GeographyRepository,
    GeographyService,
    LookupRepository,
    LookupService,
    SettingRepository,
    SettingService,
    AuditRepository,
    AuditService,
    ImportRepository,
    ImportTemplateService,
    ImportService,
    StorageModule,
  ],
})
export class CoreModule {}
