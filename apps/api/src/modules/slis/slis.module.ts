import { Module } from '@nestjs/common';
import { EncryptionService } from '../../platform/security/encryption.service';
import { IdentityHashService } from '../../platform/security/identity-hash.service';
import { FarmerRepository } from './repositories/farmer.repository';
import { FarmerService } from './services/farmer.service';
import { FarmerController } from './controllers/farmer.controller';
import { HouseholdRepository } from './repositories/household.repository';
import { HouseholdService } from './services/household.service';
import { HouseholdController } from './controllers/household.controller';

@Module({
  controllers: [FarmerController, HouseholdController],
  providers: [
    EncryptionService,
    IdentityHashService,
    FarmerRepository,
    FarmerService,
    HouseholdRepository,
    HouseholdService,
  ],
  exports: [
    EncryptionService,
    IdentityHashService,
    FarmerRepository,
    FarmerService,
    HouseholdRepository,
    HouseholdService,
  ],
})
export class SlisModule {}
