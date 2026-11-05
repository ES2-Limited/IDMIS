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
import { DamInspectionController } from './controllers/dam-inspection.controller';

// Repositories
import { BasinRepository } from './repositories/basin.repository';
import { BasinMorphometryRepository } from './repositories/basin-morphometry.repository';
import { StationRepository } from './repositories/station.repository';
import { ReservoirRepository } from './repositories/reservoir.repository';
import { DamRepository } from './repositories/dam.repository';
import { ReadingRepository } from './repositories/reading.repository';
import { DamInspectionRepository } from './repositories/dam-inspection.repository';

// Services
import { BlisAssetService } from './services/blis-asset.service';
import { DamInspectionService } from './services/dam-inspection.service';
import { BlisComputeQueryService } from './services/blis-compute-query.service';
import { BlisPublicService, BlisStationStubService } from './public';

// Import Handlers
import { BasinImportHandler } from './imports/basin.handler';
import { StationImportHandler } from './imports/station.handler';
import { DamImportHandler } from './imports/dam.handler';
import { MeasurementImportHandler } from './imports/measurement.handler';

@Module({
  imports: [CoreModule, AuditModule],
  controllers: [
    BasinController,
    BasinMorphometryController,
    StationController,
    ReservoirController,
    DamController,
    DamInspectionController,
  ],
  providers: [
    BasinRepository,
    BasinMorphometryRepository,
    StationRepository,
    ReservoirRepository,
    DamRepository,
    ReadingRepository,
    DamInspectionRepository,
    BlisAssetService,
    DamInspectionService,
    BlisComputeQueryService,
    BlisPublicService,
    { provide: BlisStationStubService, useExisting: BlisPublicService },
    BasinImportHandler,
    StationImportHandler,
    DamImportHandler,
    MeasurementImportHandler,
  ],
  exports: [
    BasinRepository,
    BasinMorphometryRepository,
    StationRepository,
    ReservoirRepository,
    DamRepository,
    ReadingRepository,
    DamInspectionRepository,
    BlisAssetService,
    DamInspectionService,
    BlisComputeQueryService,
    BlisPublicService,
    BlisStationStubService,
  ],
})
export class BlisModule implements OnModuleInit {
  constructor(
    private readonly importRegistry: ImportHandlerRegistry,
    private readonly basinImportHandler: BasinImportHandler,
    private readonly stationImportHandler: StationImportHandler,
    private readonly damImportHandler: DamImportHandler,
    private readonly measurementImportHandler: MeasurementImportHandler,
  ) {}

  onModuleInit() {
    this.importRegistry.register(this.basinImportHandler);
    this.importRegistry.register(this.stationImportHandler);
    this.importRegistry.register(this.damImportHandler);
    this.importRegistry.register(this.measurementImportHandler);
  }
}
