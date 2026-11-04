import { Module, type OnModuleInit } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ImportHandlerRegistry } from '../core/public';
import { AuditModule } from '../../platform/audit/audit.module';

// Controllers
import { IndicatorController } from './controllers/indicator.controller';
import { IndicatorTargetController } from './controllers/indicator-target.controller';
import { IndicatorValueController } from './controllers/indicator-value.controller';

// Repositories
import { IndicatorRepository } from './repositories/indicator.repository';
import { IndicatorTargetRepository } from './repositories/indicator-target.repository';
import { IndicatorValueRepository } from './repositories/indicator-value.repository';

// Services
import { IndicatorService } from './services/indicator.service';
import { IndicatorTargetService } from './services/indicator-target.service';
import { IndicatorValueService } from './services/indicator-value.service';

// Import Handlers
import { IndicatorTargetImportHandler } from './imports/indicator-target.handler';
import { IndicatorValueImportHandler } from './imports/indicator-value.handler';

@Module({
  imports: [CoreModule, AuditModule],
  controllers: [IndicatorController, IndicatorTargetController, IndicatorValueController],
  providers: [
    IndicatorRepository,
    IndicatorTargetRepository,
    IndicatorValueRepository,
    IndicatorService,
    IndicatorTargetService,
    IndicatorValueService,
    IndicatorTargetImportHandler,
    IndicatorValueImportHandler,
  ],
  exports: [
    IndicatorRepository,
    IndicatorTargetRepository,
    IndicatorValueRepository,
    IndicatorService,
    IndicatorTargetService,
    IndicatorValueService,
    IndicatorTargetImportHandler,
    IndicatorValueImportHandler,
  ],
})
export class MeModule implements OnModuleInit {
  constructor(
    private readonly registry: ImportHandlerRegistry,
    private readonly indicatorTargetHandler: IndicatorTargetImportHandler,
    private readonly indicatorValueHandler: IndicatorValueImportHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.indicatorTargetHandler);
    this.registry.register(this.indicatorValueHandler);
  }
}
