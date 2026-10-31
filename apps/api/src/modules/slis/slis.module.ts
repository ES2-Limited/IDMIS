import { Module, type OnModuleInit, forwardRef } from '@nestjs/common';
import { EncryptionService } from '../../platform/security/encryption.service';
import { IdentityHashService } from '../../platform/security/identity-hash.service';
import { FarmerRepository } from './repositories/farmer.repository';
import { FarmerService } from './services/farmer.service';
import { FarmerController } from './controllers/farmer.controller';
import { HouseholdRepository } from './repositories/household.repository';
import { HouseholdService } from './services/household.service';
import { HouseholdController } from './controllers/household.controller';
import { PlotRepository } from './repositories/plot.repository';
import { PlotService } from './services/plot.service';
import { PlotController } from './controllers/plot.controller';
import { FarmRepository } from './repositories/farm.repository';
import { FarmService } from './services/farm.service';
import { FarmController } from './controllers/farm.controller';
import { PlotAllocationRepository } from './repositories/plot-allocation.repository';
import { PlotAllocationService } from './services/plot-allocation.service';
import { PlotAllocationController } from './controllers/plot-allocation.controller';
import { WaterRequestRepository } from './repositories/water-request.repository';
import { WaterRequestService } from './services/water-request.service';
import { WaterRequestController } from './controllers/water-request.controller';
import { CropProductionRepository } from './repositories/crop-production.repository';
import { CropProductionService } from './services/crop-production.service';
import { CropProductionController } from './controllers/crop-production.controller';
import { TrainingRepository } from './repositories/training.repository';
import { TrainingService } from './services/training.service';
import { TrainingController } from './controllers/training.controller';
import { StreamFlowRepository } from './repositories/stream-flow.repository';
import { StreamFlowService } from './services/stream-flow.service';
import { StreamFlowController } from './controllers/stream-flow.controller';
import { ReviewRepository } from './repositories/review.repository';
import { ReviewService } from './services/review.service';
import { ReviewController } from './controllers/review.controller';
import { SyncRepository } from './repositories/sync.repository';
import { SyncService } from './services/sync.service';
import { SyncController } from './controllers/sync.controller';
import { FeeRepository } from './repositories/fee.repository';
import { FeeService } from './services/fee.service';
import { ReportRepository } from './repositories/report.repository';
import { ReportService } from './services/report.service';
import { ReportController } from './controllers/report.controller';
import { ExportRepository } from './repositories/export.repository';
import { ExportService } from './services/export.service';
import { ExportController } from './controllers/export.controller';
import { StorageModule } from '../../platform/storage/storage.module';
import { BlisStationStubService } from '../blis/public';
import { CoreModule } from '../core/core.module';
import { ImportHandlerRegistry } from '../core/public';
import { FarmerImportHandler } from './imports/farmer.handler';
import { PlotImportHandler } from './imports/plot.handler';
import { FeeBillingImportHandler } from './imports/fee-billing.handler';
import { FeeCollectionImportHandler } from './imports/fee-collection.handler';
import { WaterRequestImportHandler } from './imports/water-request.handler';
import { TrainingImportHandler } from './imports/training.handler';
import { CropProductionImportHandler } from './imports/crop-production.handler';

@Module({
  imports: [forwardRef(() => CoreModule), StorageModule],
  controllers: [
    FarmerController,
    HouseholdController,
    PlotController,
    FarmController,
    PlotAllocationController,
    WaterRequestController,
    CropProductionController,
    TrainingController,
    StreamFlowController,
    ReviewController,
    SyncController,
    ReportController,
    ExportController,
  ],
  providers: [
    EncryptionService,
    IdentityHashService,
    BlisStationStubService,
    FarmerRepository,
    FarmerService,
    HouseholdRepository,
    HouseholdService,
    PlotRepository,
    PlotService,
    FarmRepository,
    FarmService,
    PlotAllocationRepository,
    PlotAllocationService,
    WaterRequestRepository,
    WaterRequestService,
    CropProductionRepository,
    CropProductionService,
    TrainingRepository,
    TrainingService,
    StreamFlowRepository,
    StreamFlowService,
    ReviewRepository,
    ReviewService,
    SyncRepository,
    SyncService,
    FeeRepository,
    FeeService,
    ReportRepository,
    ReportService,
    ExportRepository,
    ExportService,
    FarmerImportHandler,
    PlotImportHandler,
    FeeBillingImportHandler,
    FeeCollectionImportHandler,
    WaterRequestImportHandler,
    TrainingImportHandler,
    CropProductionImportHandler,
  ],
  exports: [
    EncryptionService,
    IdentityHashService,
    BlisStationStubService,
    FarmerRepository,
    FarmerService,
    HouseholdRepository,
    HouseholdService,
    PlotRepository,
    PlotService,
    FarmRepository,
    FarmService,
    PlotAllocationRepository,
    PlotAllocationService,
    WaterRequestRepository,
    WaterRequestService,
    CropProductionRepository,
    CropProductionService,
    TrainingRepository,
    TrainingService,
    StreamFlowRepository,
    StreamFlowService,
    ReviewRepository,
    ReviewService,
    SyncRepository,
    SyncService,
    FeeRepository,
    FeeService,
    ReportRepository,
    ReportService,
    ExportRepository,
    ExportService,
    FarmerImportHandler,
    PlotImportHandler,
    FeeBillingImportHandler,
    FeeCollectionImportHandler,
    WaterRequestImportHandler,
    TrainingImportHandler,
    CropProductionImportHandler,
  ],
})
export class SlisModule implements OnModuleInit {
  constructor(
    private readonly registry: ImportHandlerRegistry,
    private readonly farmerHandler: FarmerImportHandler,
    private readonly plotHandler: PlotImportHandler,
    private readonly feeBillingHandler: FeeBillingImportHandler,
    private readonly feeCollectionHandler: FeeCollectionImportHandler,
    private readonly waterRequestHandler: WaterRequestImportHandler,
    private readonly trainingHandler: TrainingImportHandler,
    private readonly cropProductionHandler: CropProductionImportHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.farmerHandler);
    this.registry.register(this.plotHandler);
    this.registry.register(this.feeBillingHandler);
    this.registry.register(this.feeCollectionHandler);
    this.registry.register(this.waterRequestHandler);
    this.registry.register(this.trainingHandler);
    this.registry.register(this.cropProductionHandler);
  }
}
