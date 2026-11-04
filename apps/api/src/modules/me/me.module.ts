import { Module, type OnModuleInit } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ImportHandlerRegistry } from '../core/public';
import { AuditModule } from '../../platform/audit/audit.module';

// Controllers
import { IndicatorController } from './controllers/indicator.controller';
import { IndicatorTargetController } from './controllers/indicator-target.controller';
import { IndicatorValueController } from './controllers/indicator-value.controller';
import { SurveyController } from './controllers/survey.controller';

// Repositories
import { IndicatorRepository } from './repositories/indicator.repository';
import { IndicatorTargetRepository } from './repositories/indicator-target.repository';
import { IndicatorValueRepository } from './repositories/indicator-value.repository';
import { SurveyRepository } from './repositories/survey.repository';
import { SurveyResponseRepository } from './repositories/survey-response.repository';

// Services
import { IndicatorService } from './services/indicator.service';
import { IndicatorTargetService } from './services/indicator-target.service';
import { IndicatorValueService } from './services/indicator-value.service';
import { SurveyService } from './services/survey.service';

// Import Handlers
import { IndicatorTargetImportHandler } from './imports/indicator-target.handler';
import { IndicatorValueImportHandler } from './imports/indicator-value.handler';
import { SurveyResponseImportHandler } from './imports/survey-response.handler';

@Module({
  imports: [CoreModule, AuditModule],
  controllers: [
    IndicatorController,
    IndicatorTargetController,
    IndicatorValueController,
    SurveyController,
  ],
  providers: [
    IndicatorRepository,
    IndicatorTargetRepository,
    IndicatorValueRepository,
    SurveyRepository,
    SurveyResponseRepository,
    IndicatorService,
    IndicatorTargetService,
    IndicatorValueService,
    SurveyService,
    IndicatorTargetImportHandler,
    IndicatorValueImportHandler,
    SurveyResponseImportHandler,
  ],
  exports: [
    IndicatorRepository,
    IndicatorTargetRepository,
    IndicatorValueRepository,
    SurveyRepository,
    SurveyResponseRepository,
    IndicatorService,
    IndicatorTargetService,
    IndicatorValueService,
    SurveyService,
    IndicatorTargetImportHandler,
    IndicatorValueImportHandler,
    SurveyResponseImportHandler,
  ],
})
export class MeModule implements OnModuleInit {
  constructor(
    private readonly registry: ImportHandlerRegistry,
    private readonly indicatorTargetHandler: IndicatorTargetImportHandler,
    private readonly indicatorValueHandler: IndicatorValueImportHandler,
    private readonly surveyResponseHandler: SurveyResponseImportHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.indicatorTargetHandler);
    this.registry.register(this.indicatorValueHandler);
    this.registry.register(this.surveyResponseHandler);
  }
}
