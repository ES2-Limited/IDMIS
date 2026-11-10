import { Module, type OnModuleInit, Inject, forwardRef } from '@nestjs/common';
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
import { MapController, BlisMapController } from './controllers/map.controller';

// Repositories
import { BasinRepository } from './repositories/basin.repository';
import { BasinMorphometryRepository } from './repositories/basin-morphometry.repository';
import { StationRepository } from './repositories/station.repository';
import { ReservoirRepository } from './repositories/reservoir.repository';
import { DamRepository } from './repositories/dam.repository';
import { ReadingRepository } from './repositories/reading.repository';
import { DamInspectionRepository } from './repositories/dam-inspection.repository';
import { MapRepository } from './repositories/map.repository';

// Services
import { BlisAssetService } from './services/blis-asset.service';
import { DamInspectionService } from './services/dam-inspection.service';
import { BlisComputeQueryService } from './services/blis-compute-query.service';
import { BlisPublicService } from './public';
import { MapService } from './services/map.service';
import { SlisTileQueryService } from '../slis/public';

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
    MapController,
    BlisMapController,
  ],
  providers: [
    BasinRepository,
    BasinMorphometryRepository,
    StationRepository,
    ReservoirRepository,
    DamRepository,
    ReadingRepository,
    DamInspectionRepository,
    MapRepository,
    BlisAssetService,
    DamInspectionService,
    BlisComputeQueryService,
    BlisPublicService,
    MapService,
    SlisTileQueryService,
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
    MapRepository,
    BlisAssetService,
    DamInspectionService,
    BlisComputeQueryService,
    BlisPublicService,
    MapService,
    SlisTileQueryService,
  ],
})
export class BlisModule implements OnModuleInit {
  constructor(
    @Inject(forwardRef(() => ImportHandlerRegistry))
    private readonly importRegistry: ImportHandlerRegistry,
    private readonly basinImportHandler: BasinImportHandler,
    private readonly stationImportHandler: StationImportHandler,
    private readonly damImportHandler: DamImportHandler,
    private readonly measurementImportHandler: MeasurementImportHandler,
  ) {}

  onModuleInit() {
    if (this.basinImportHandler) this.importRegistry.register(this.basinImportHandler);
    if (this.stationImportHandler) this.importRegistry.register(this.stationImportHandler);
    if (this.damImportHandler) this.importRegistry.register(this.damImportHandler);
    if (this.measurementImportHandler) this.importRegistry.register(this.measurementImportHandler);
  }
}
