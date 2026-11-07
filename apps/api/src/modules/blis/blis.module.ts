import { Module, type OnModuleInit } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ImportHandlerRegistry } from '../core/public';
import { AuditModule } from '../../platform/audit/audit.module';

// Controllers
import { BasinController } from './controllers/basin.controller';
import { BasinMorphometryController } from './controllers/basin-morphometry.controller';
import { StationController } from './controllers/station.controller';
import { ReservoirController } from './controllers/reservoir.controller';
import { DamController } from './controllers/dam.controller';

// Repositories
import { BasinRepository } from './repositories/basin.repository';
import { BasinMorphometryRepository } from './repositories/basin-morphometry.repository';
import { StationRepository } from './repositories/station.repository';
import { ReservoirRepository } from './repositories/reservoir.repository';
import { DamRepository } from './repositories/dam.repository';

// Services
import { BlisAssetService } from './services/blis-asset.service';
import { BlisStationStubService } from './public';

// Import Handlers
import { BasinImportHandler } from './imports/basin.handler';
import { StationImportHandler } from './imports/station.handler';
import { DamImportHandler } from './imports/dam.handler';

@Module({
  imports: [CoreModule, AuditModule],
  controllers: [
    BasinController,
    BasinMorphometryController,
    StationController,
    ReservoirController,
    DamController,
  ],
  providers: [
    BasinRepository,
    BasinMorphometryRepository,
    StationRepository,
    ReservoirRepository,
    DamRepository,
    BlisAssetService,
    BlisStationStubService,
    BasinImportHandler,
    StationImportHandler,
    DamImportHandler,
  ],
  exports: [
    BasinRepository,
    BasinMorphometryRepository,
    StationRepository,
    ReservoirRepository,
    DamRepository,
    BlisAssetService,
    BlisStationStubService,
  ],
})
export class BlisModule implements OnModuleInit {
  constructor(
    private readonly importRegistry: ImportHandlerRegistry,
    private readonly basinImportHandler: BasinImportHandler,
    private readonly stationImportHandler: StationImportHandler,
    private readonly damImportHandler: DamImportHandler,
  ) {}

  onModuleInit() {
    this.importRegistry.register(this.basinImportHandler);
    this.importRegistry.register(this.stationImportHandler);
    this.importRegistry.register(this.damImportHandler);
  }
}
