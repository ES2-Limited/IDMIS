import { Module, type OnModuleInit } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ImportHandlerRegistry } from '../core/public';
import { AuditModule } from '../../platform/audit/audit.module';

// Controllers
import { IndicatorController } from './controllers/indicator.controller';
import { IndicatorTargetController } from './controllers/indicator-target.controller';
import { IndicatorValueController } from './controllers/indicator-value.controller';
import { SurveyController } from './controllers/survey.controller';
import { ScorecardController } from './controllers/scorecard.controller';
import { MatchingGrantController } from './controllers/matching-grant.controller';
import { TechAdoptionController } from './controllers/tech-adoption.controller';

// Repositories
import { IndicatorRepository } from './repositories/indicator.repository';
import { IndicatorTargetRepository } from './repositories/indicator-target.repository';
import { IndicatorValueRepository } from './repositories/indicator-value.repository';
import { SurveyRepository } from './repositories/survey.repository';
import { SurveyResponseRepository } from './repositories/survey-response.repository';
import { ScorecardRepository } from './repositories/scorecard.repository';
import { MatchingGrantRepository } from './repositories/matching-grant.repository';
import { TechAdoptionRepository } from './repositories/tech-adoption.repository';

// Services
import { IndicatorService } from './services/indicator.service';
import { IndicatorTargetService } from './services/indicator-target.service';
import { IndicatorValueService } from './services/indicator-value.service';
import { SurveyService } from './services/survey.service';
import { InstrumentsService } from './services/instruments.service';

// Import Handlers
import { IndicatorTargetImportHandler } from './imports/indicator-target.handler';
import { IndicatorValueImportHandler } from './imports/indicator-value.handler';
import { SurveyResponseImportHandler } from './imports/survey-response.handler';
import { ScorecardImportHandler } from './imports/scorecard.handler';
import { MatchingGrantImportHandler } from './imports/matching-grant.handler';

@Module({
  imports: [CoreModule, AuditModule],
  controllers: [
    IndicatorController,
    IndicatorTargetController,
    IndicatorValueController,
    SurveyController,
    ScorecardController,
    MatchingGrantController,
    TechAdoptionController,
  ],
  providers: [
    IndicatorRepository,
    IndicatorTargetRepository,
    IndicatorValueRepository,
    SurveyRepository,
    SurveyResponseRepository,
    ScorecardRepository,
    MatchingGrantRepository,
    TechAdoptionRepository,
    IndicatorService,
    IndicatorTargetService,
    IndicatorValueService,
    SurveyService,
    InstrumentsService,
    IndicatorTargetImportHandler,
    IndicatorValueImportHandler,
    SurveyResponseImportHandler,
    ScorecardImportHandler,
    MatchingGrantImportHandler,
  ],
  exports: [
    IndicatorRepository,
    IndicatorTargetRepository,
    IndicatorValueRepository,
    SurveyRepository,
    SurveyResponseRepository,
    ScorecardRepository,
    MatchingGrantRepository,
    TechAdoptionRepository,
    IndicatorService,
    IndicatorTargetService,
    IndicatorValueService,
    SurveyService,
    InstrumentsService,
    IndicatorTargetImportHandler,
    IndicatorValueImportHandler,
    SurveyResponseImportHandler,
    ScorecardImportHandler,
    MatchingGrantImportHandler,
  ],
})
export class MeModule implements OnModuleInit {
  constructor(
    private readonly registry: ImportHandlerRegistry,
    private readonly indicatorTargetHandler: IndicatorTargetImportHandler,
    private readonly indicatorValueHandler: IndicatorValueImportHandler,
    private readonly surveyResponseHandler: SurveyResponseImportHandler,
    private readonly scorecardHandler: ScorecardImportHandler,
    private readonly matchingGrantHandler: MatchingGrantImportHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.indicatorTargetHandler);
    this.registry.register(this.indicatorValueHandler);
    this.registry.register(this.surveyResponseHandler);
    this.registry.register(this.scorecardHandler);
    this.registry.register(this.matchingGrantHandler);
  }
}
