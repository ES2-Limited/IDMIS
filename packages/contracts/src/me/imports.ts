import { z } from 'zod';
import type { ImportColumnDefinition } from '../core/import';
import { ScopeTypeSchema } from '../core/enums';

export const ME_IMPORT_DATASETS = [
  'me.indicator_target',
  'me.indicator_value',
  'me.survey_response',
  'me.scorecard',
  'me.matching_grant',
] as const;
export const MeImportDatasetSchema = z.enum(ME_IMPORT_DATASETS);
export type MeImportDataset = z.infer<typeof MeImportDatasetSchema>;

/**
 * Row schema for me.indicator_target import
 */
export const IndicatorTargetImportRowSchema = z.object({
  indicatorCode: z.string().min(1).max(50),
  year: z.coerce.number().int().min(2000).max(2100),
  scopeType: ScopeTypeSchema,
  stateCode: z.string().optional(),
  schemeCode: z.string().optional(),
  value: z.string().regex(/^-?\d+(\.\d+)?$/, 'Value must be a valid decimal string'),
});
export type IndicatorTargetImportRow = z.infer<typeof IndicatorTargetImportRowSchema>;

/**
 * Row schema for me.indicator_value import
 */
export const IndicatorValueImportRowSchema = z.object({
  indicatorCode: z.string().min(1).max(50),
  periodYear: z.coerce.number().int().min(2000).max(2100),
  periodQuarter: z.coerce.number().int().min(1).max(4).optional(),
  scopeType: ScopeTypeSchema,
  stateCode: z.string().optional(),
  schemeCode: z.string().optional(),
  disaggregation: z.record(z.string(), z.unknown()).default({}),
  value: z.string().regex(/^-?\d+(\.\d+)?$/, 'Value must be a valid decimal string'),
  notes: z.string().optional(),
});
export type IndicatorValueImportRow = z.infer<typeof IndicatorValueImportRowSchema>;

/**
 * Row schema for me.survey_response import
 */
export const SurveyResponseImportRowSchema = z.object({
  surveyName: z.string().optional(),
  surveyId: z.string().optional(),
  schemeCode: z.string().optional(),
  respondentId: z.string().optional(),
  respondentPhone: z.string().optional(),
  period: z.string().optional(),
  collectedAt: z.string().optional(),
  answers: z.string().min(1), // JSON string containing { [questionCode]: answerValue }
});
export type SurveyResponseImportRow = z.infer<typeof SurveyResponseImportRowSchema>;

/**
 * Row schema for me.scorecard import
 */
export const ScorecardImportRowSchema = z.object({
  schemeCode: z.string().min(1).max(50),
  periodYear: z.coerce.number().int().min(2000).max(2100),
  publishedOn: z.string().optional(),
});
export type ScorecardImportRow = z.infer<typeof ScorecardImportRowSchema>;

/**
 * Row schema for me.matching_grant import
 */
export const MatchingGrantImportRowSchema = z.object({
  schemeCode: z.string().min(1).max(50),
  wuaRegNo: z.string().optional(),
  purpose: z.string().optional(),
  amountNgn: z
    .string()
    .regex(/^-?\d+(\.\d{1,2})?$/, 'Amount must be a valid currency decimal string'),
  approvedOn: z.string().optional(),
  disbursedOn: z.string().optional(),
});
export type MatchingGrantImportRow = z.infer<typeof MatchingGrantImportRowSchema>;

export const ME_IMPORT_TEMPLATES: Record<MeImportDataset, ImportColumnDefinition[]> = {
  'me.indicator_target': [
    {
      name: 'indicatorCode',
      header: 'Indicator Code',
      required: true,
      type: 'string',
      description: 'Code of the indicator (e.g. 1a, 2b)',
      example: '1a',
    },
    {
      name: 'year',
      header: 'Target Year',
      required: true,
      type: 'number',
      description: 'Calendar target year',
      example: 2026,
    },
    {
      name: 'scopeType',
      header: 'Scope Type',
      required: true,
      type: 'string',
      description: 'Scope level (national, state, scheme)',
      example: 'scheme',
    },
    {
      name: 'stateCode',
      header: 'State Code',
      required: false,
      type: 'string',
      description: 'State 2-letter code if scope is state',
      example: 'KN',
    },
    {
      name: 'schemeCode',
      header: 'Scheme Code',
      required: false,
      type: 'string',
      description: 'Scheme code if scope is scheme',
      example: 'KRIS',
    },
    {
      name: 'value',
      header: 'Target Value',
      required: true,
      type: 'string',
      description: 'Target numeric value as decimal string',
      example: '5000.00',
    },
  ],
  'me.indicator_value': [
    {
      name: 'indicatorCode',
      header: 'Indicator Code',
      required: true,
      type: 'string',
      description: 'Code of manual indicator (computed indicators rejected)',
      example: '1a',
    },
    {
      name: 'periodYear',
      header: 'Period Year',
      required: true,
      type: 'number',
      description: 'Calendar reporting year',
      example: 2026,
    },
    {
      name: 'periodQuarter',
      header: 'Quarter',
      required: false,
      type: 'number',
      description: 'Quarter (1-4). Leave blank for annual values',
      example: 1,
    },
    {
      name: 'scopeType',
      header: 'Scope Type',
      required: true,
      type: 'string',
      description: 'Scope level (national, state, scheme)',
      example: 'scheme',
    },
    {
      name: 'stateCode',
      header: 'State Code',
      required: false,
      type: 'string',
      description: 'State 2-letter code if scope is state',
      example: 'KN',
    },
    {
      name: 'schemeCode',
      header: 'Scheme Code',
      required: false,
      type: 'string',
      description: 'Scheme code if scope is scheme',
      example: 'KRIS',
    },
    {
      name: 'disaggregation',
      header: 'Disaggregation (JSON)',
      required: false,
      type: 'string',
      description: 'JSON object string for disaggregation (e.g. {"gender":"female"})',
      example: '{"gender":"female"}',
    },
    {
      name: 'value',
      header: 'Reported Value',
      required: true,
      type: 'string',
      description: 'Reported numeric value as decimal string',
      example: '4500.00',
    },
    {
      name: 'notes',
      header: 'Notes',
      required: false,
      type: 'string',
      description: 'Optional commentary or notes',
      example: 'Verified by field survey',
    },
  ],
  'me.survey_response': [
    {
      name: 'surveyName',
      header: 'Survey Name',
      required: false,
      type: 'string',
      description: 'Name of the survey (resolved to latest version)',
      example: 'Annual Beneficiary Survey',
    },
    {
      name: 'surveyId',
      header: 'Survey ID',
      required: false,
      type: 'string',
      description: 'Exact UUID of the survey',
      example: '00000000-0000-0000-0000-000000000000',
    },
    {
      name: 'schemeCode',
      header: 'Scheme Code',
      required: false,
      type: 'string',
      description: 'Scheme code if applicable',
      example: 'KRIS',
    },
    {
      name: 'respondentId',
      header: 'Respondent ID',
      required: false,
      type: 'string',
      description: 'Identifier of the respondent',
      example: 'RESP-001',
    },
    {
      name: 'respondentPhone',
      header: 'Respondent Phone',
      required: false,
      type: 'string',
      description: 'Phone number of the respondent',
      example: '+2348012345678',
    },
    {
      name: 'period',
      header: 'Period',
      required: false,
      type: 'string',
      description: 'Period code (e.g. 2026-Q1)',
      example: '2026-Q1',
    },
    {
      name: 'collectedAt',
      header: 'Collected At',
      required: false,
      type: 'string',
      description: 'ISO datetime of data collection',
      example: '2026-03-15T10:00:00Z',
    },
    {
      name: 'answers',
      header: 'Answers JSON',
      required: true,
      type: 'string',
      description: 'JSON object mapping question codes to answers',
      example: '{"q1":"Yes","q2":42}',
    },
  ],
  'me.scorecard': [
    {
      name: 'schemeCode',
      header: 'Scheme Code',
      required: true,
      type: 'string',
      description: 'Code of the scheme',
      example: 'KRIS',
    },
    {
      name: 'periodYear',
      header: 'Period Year',
      required: true,
      type: 'number',
      description: 'Calendar year for the scorecard',
      example: 2026,
    },
    {
      name: 'publishedOn',
      header: 'Published On',
      required: false,
      type: 'string',
      description: 'Date scorecard was published (YYYY-MM-DD)',
      example: '2026-06-30',
    },
  ],
  'me.matching_grant': [
    {
      name: 'schemeCode',
      header: 'Scheme Code',
      required: true,
      type: 'string',
      description: 'Code of the scheme',
      example: 'KRIS',
    },
    {
      name: 'wuaRegNo',
      header: 'WUA Registration No',
      required: false,
      type: 'string',
      description: 'Registration number of recipient WUA',
      example: 'WUA-KRIS-001',
    },
    {
      name: 'purpose',
      header: 'Grant Purpose',
      required: false,
      type: 'string',
      description: 'Purpose or description of the grant',
      example: 'Canal maintenance equipment grant',
    },
    {
      name: 'amountNgn',
      header: 'Amount NGN',
      required: true,
      type: 'string',
      description: 'Approved grant amount in NGN (decimal string)',
      example: '1500000.00',
    },
    {
      name: 'approvedOn',
      header: 'Approved On',
      required: false,
      type: 'string',
      description: 'Approval date (YYYY-MM-DD)',
      example: '2026-04-10',
    },
    {
      name: 'disbursedOn',
      header: 'Disbursed On',
      required: false,
      type: 'string',
      description: 'Disbursement date (YYYY-MM-DD)',
      example: '2026-05-01',
    },
  ],
};
