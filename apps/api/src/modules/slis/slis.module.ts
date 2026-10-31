import { Module } from '@nestjs/common';
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

@Module({
  controllers: [
    FarmerController,
    HouseholdController,
    PlotController,
    FarmController,
    PlotAllocationController,
  ],
  providers: [
    EncryptionService,
    IdentityHashService,
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
  ],
  exports: [
    EncryptionService,
    IdentityHashService,
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
  ],
})
export class SlisModule {}
