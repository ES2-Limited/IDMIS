import {
  pgSchema,
  uuid,
  text,
  boolean,
  smallint,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  check,
  unique,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { standardColumns, slisReviewableColumns, geometryPoint } from './common';
import {
  appUser,
  state,
  organisation,
  wua,
  lookupValue,
  file,
  device,
  importBatch,
  scopeTypeEnum,
} from './core';

export const meSchema = pgSchema('me');

// 1. Enums
export const indicatorLevelEnum = meSchema.enum('indicator_level', ['pdo', 'intermediate']);
export const indicatorMethodEnum = meSchema.enum('indicator_method', [
  'manual',
  'computed',
  'survey',
]);
export const valueSourceEnum = meSchema.enum('value_source', ['manual', 'computed', 'import']);

// 2. Results Framework
export const resultsFramework = meSchema.table('results_framework', {
  ...standardColumns(() => appUser.id),
  name: text('name').notNull(),
  version: text('version').notNull(),
  startsOn: date('starts_on', { mode: 'string' }),
  endsOn: date('ends_on', { mode: 'string' }),
  isCurrent: boolean('is_current').notNull().default(false),
});

// 3. Indicator
export const indicator = meSchema.table(
  'indicator',
  {
    ...standardColumns(() => appUser.id),
    frameworkId: uuid('framework_id')
      .notNull()
      .references(() => resultsFramework.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    level: indicatorLevelEnum('level').notNull(),
    unit: text('unit').notNull(),
    frequency: text('frequency').notNull().default('annual'),
    method: indicatorMethodEnum('method').notNull(),
    computeKey: text('compute_key'),
    disaggregations: text('disaggregations')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    baseline: numeric('baseline', { precision: 16, scale: 4 }),
    baselineYear: smallint('baseline_year'),
    endTarget: numeric('end_target', { precision: 16, scale: 4 }),
    endTargetNote: text('end_target_note'),
    dataSource: text('data_source'),
    responsible: text('responsible'),
  },
  (table) => [
    unique('indicator_framework_code_unique').on(table.frameworkId, table.code),
    check(
      'indicator_method_compute_key_check',
      sql`("method" = 'computed' AND "compute_key" IS NOT NULL) OR ("method" = 'survey') OR ("method" = 'manual' AND "compute_key" IS NULL)`,
    ),
  ],
);

// 4. Indicator Target
export const indicatorTarget = meSchema.table(
  'indicator_target',
  {
    ...standardColumns(() => appUser.id),
    indicatorId: uuid('indicator_id')
      .notNull()
      .references(() => indicator.id),
    year: smallint('year').notNull(),
    scopeType: scopeTypeEnum('scope_type').notNull(),
    scopeStateId: uuid('scope_state_id').references(() => state.id),
    scopeOrgId: uuid('scope_org_id').references(() => organisation.id),
    value: numeric('value', { precision: 16, scale: 4 }).notNull(),
    importBatchId: uuid('import_batch_id').references(() => importBatch.id),
  },
  (table) => [
    unique('indicator_target_slot_unique')
      .on(table.indicatorId, table.year, table.scopeType, table.scopeStateId, table.scopeOrgId)
      .nullsNotDistinct(),
  ],
);

// 5. Indicator Value
export const indicatorValue = meSchema.table(
  'indicator_value',
  {
    ...standardColumns(() => appUser.id),
    status: text('status').notNull().default('draft'),
    submittedBy: uuid('submitted_by').references(() => appUser.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'string' }),
    approvedBy: uuid('approved_by').references(() => appUser.id),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'string' }),
    returnedBy: uuid('returned_by').references(() => appUser.id),
    returnedAt: timestamp('returned_at', { withTimezone: true, mode: 'string' }),
    returnComment: text('return_comment'),
    importBatchId: uuid('import_batch_id').references(() => importBatch.id),
    indicatorId: uuid('indicator_id')
      .notNull()
      .references(() => indicator.id),
    periodYear: smallint('period_year').notNull(),
    periodQuarter: smallint('period_quarter'),
    scopeType: scopeTypeEnum('scope_type').notNull(),
    scopeStateId: uuid('scope_state_id').references(() => state.id),
    scopeOrgId: uuid('scope_org_id').references(() => organisation.id),
    disaggregation: jsonb('disaggregation')
      .notNull()
      .default(sql`'{}'::jsonb`),
    value: numeric('value', { precision: 16, scale: 4 }).notNull(),
    source: valueSourceEnum('source').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true, mode: 'string' }),
    notes: text('notes'),
  },
  (table) => [
    check(
      'indicator_value_quarter_check',
      sql`("period_quarter" IS NULL OR ("period_quarter" >= 1 AND "period_quarter" <= 4))`,
    ),
    unique('indicator_value_slot_unique')
      .on(
        table.indicatorId,
        table.periodYear,
        table.periodQuarter,
        table.scopeType,
        table.scopeStateId,
        table.scopeOrgId,
        table.disaggregation,
      )
      .nullsNotDistinct(),
  ],
);

// 6. Indicator Value Evidence
export const indicatorValueEvidence = meSchema.table(
  'indicator_value_evidence',
  {
    indicatorValueId: uuid('indicator_value_id')
      .notNull()
      .references(() => indicatorValue.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => file.id),
  },
  (table) => [
    primaryKey({
      columns: [table.indicatorValueId, table.fileId],
    }),
  ],
);

// 7. Survey
export const survey = meSchema.table('survey', {
  ...standardColumns(() => appUser.id),
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  schemeId: uuid('scheme_id').references(() => organisation.id),
  opensOn: date('opens_on', { mode: 'string' }),
  closesOn: date('closes_on', { mode: 'string' }),
});

// 8. Survey Question
export const surveyQuestion = meSchema.table(
  'survey_question',
  {
    id: uuid('id').primaryKey(),
    surveyId: uuid('survey_id')
      .notNull()
      .references(() => survey.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    text: text('text').notNull(),
    answerType: text('answer_type').notNull(),
    options: jsonb('options'),
    sortOrder: integer('sort_order').notNull(),
    isRequired: boolean('is_required').notNull().default(false),
  },
  (table) => [
    check(
      'survey_question_answer_type_check',
      sql`"answer_type" IN ('text','number','single','multi','date','gps')`,
    ),
    unique('survey_question_survey_code_unique').on(table.surveyId, table.code),
  ],
);

// 9. Survey Response
export const surveyResponse = meSchema.table('survey_response', {
  ...standardColumns(() => appUser.id),
  ...slisReviewableColumns(
    () => appUser.id,
    () => device.id,
    () => importBatch.id,
  ),
  surveyId: uuid('survey_id')
    .notNull()
    .references(() => survey.id),
  schemeId: uuid('scheme_id').references(() => organisation.id),
  farmerId: uuid('farmer_id'), // Plain UUID, NO FK into SLIS
  householdId: uuid('household_id'), // Plain UUID, NO FK into SLIS
  collectedAt: timestamp('collected_at', { withTimezone: true, mode: 'string' }).notNull(),
  location: geometryPoint('location'),
});

// 10. Survey Answer
export const surveyAnswer = meSchema.table(
  'survey_answer',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    responseId: uuid('response_id')
      .notNull()
      .references(() => surveyResponse.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => surveyQuestion.id),
    value: jsonb('value').notNull(),
  },
  (table) => [
    unique('survey_answer_response_question_unique').on(table.responseId, table.questionId),
  ],
);

// 11. Scorecard
export const scorecard = meSchema.table('scorecard', {
  ...standardColumns(() => appUser.id),
  schemeId: uuid('scheme_id')
    .notNull()
    .references(() => organisation.id),
  periodYear: smallint('period_year').notNull(),
  publishedOn: date('published_on', { mode: 'string' }),
  fileId: uuid('file_id').references(() => file.id),
});

// 12. Matching Grant
export const matchingGrant = meSchema.table('matching_grant', {
  ...standardColumns(() => appUser.id),
  schemeId: uuid('scheme_id')
    .notNull()
    .references(() => organisation.id),
  wuaId: uuid('wua_id').references(() => wua.id),
  purpose: text('purpose'),
  amountNgn: numeric('amount_ngn', { precision: 14, scale: 2 }),
  approvedOn: date('approved_on', { mode: 'string' }),
  disbursedOn: date('disbursed_on', { mode: 'string' }),
  importBatchId: uuid('import_batch_id').references(() => importBatch.id),
});

// 13. Technology Adoption
export const techAdoption = meSchema.table(
  'tech_adoption',
  {
    ...standardColumns(() => appUser.id),
    ...slisReviewableColumns(
      () => appUser.id,
      () => device.id,
      () => importBatch.id,
    ),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => organisation.id),
    farmerId: uuid('farmer_id'), // Plain UUID, NO FK into SLIS
    technologyId: uuid('technology_id')
      .notNull()
      .references(() => lookupValue.id),
    gender: text('gender'),
    adoptedOn: date('adopted_on', { mode: 'string' }),
  },
  () => [
    check('tech_adoption_gender_check', sql`("gender" IS NULL OR "gender" IN ('female','male'))`),
  ],
);

// 14. Compute Result
export const computeResult = meSchema.table(
  'compute_result',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    indicatorId: uuid('indicator_id')
      .notNull()
      .references(() => indicator.id),
    periodYear: smallint('period_year').notNull(),
    periodQuarter: smallint('period_quarter').notNull(),
    scopeType: scopeTypeEnum('scope_type').notNull(),
    scopeStateId: uuid('scope_state_id').references(() => state.id),
    scopeOrgId: uuid('scope_org_id').references(() => organisation.id),
    disaggregation: jsonb('disaggregation')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text('status').notNull(), // 'computed' | 'not_available' | 'error'
    message: text('message'),
    computedAt: timestamp('computed_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check('compute_result_quarter_check', sql`("period_quarter" >= 1 AND "period_quarter" <= 4)`),
    unique('compute_result_slot_unique')
      .on(
        table.indicatorId,
        table.periodYear,
        table.periodQuarter,
        table.scopeType,
        table.scopeStateId,
        table.scopeOrgId,
        table.disaggregation,
      )
      .nullsNotDistinct(),
  ],
);

// 15. Materialised View: me.mv_indicator_matrix
export const mvIndicatorMatrix = meSchema.table(
  'mv_indicator_matrix',
  {
    indicatorId: uuid('indicator_id').notNull(),
    indicatorCode: text('indicator_code').notNull(),
    indicatorName: text('indicator_name').notNull(),
    periodYear: smallint('period_year').notNull(),
    periodQuarter: smallint('period_quarter').notNull(),
    scopeType: scopeTypeEnum('scope_type').notNull(),
    scopeStateId: uuid('scope_state_id'),
    stateKey: uuid('state_key').notNull(),
    scopeOrgId: uuid('scope_org_id'),
    orgKey: uuid('org_key').notNull(),
    disaggregation: jsonb('disaggregation').notNull(),
    disaggregationKey: text('disaggregation_key').notNull(),
    target: numeric('target', { precision: 16, scale: 4 }),
    endTarget: numeric('end_target', { precision: 16, scale: 4 }),
    value: numeric('value', { precision: 16, scale: 4 }),
    status: text('status').notNull(),
    message: text('message'),
    pctOfEndTarget: numeric('pct_of_end_target', { precision: 8, scale: 2 }),
    computedAt: timestamp('computed_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    uniqueIndex('mv_indicator_matrix_unique').on(
      table.indicatorId,
      table.periodYear,
      table.periodQuarter,
      table.scopeType,
      table.stateKey,
      table.orgKey,
      table.disaggregationKey,
    ),
  ],
);
