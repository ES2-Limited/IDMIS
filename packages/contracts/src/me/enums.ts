import { z } from 'zod';

export const IndicatorLevelSchema = z.enum(['pdo', 'intermediate']);
export type IndicatorLevel = z.infer<typeof IndicatorLevelSchema>;

export const IndicatorMethodSchema = z.enum(['manual', 'computed', 'survey']);
export type IndicatorMethod = z.infer<typeof IndicatorMethodSchema>;

export const ValueSourceSchema = z.enum(['manual', 'computed', 'import']);
export type ValueSource = z.infer<typeof ValueSourceSchema>;

export const SurveyAnswerTypeSchema = z.enum(['text', 'number', 'single', 'multi', 'date', 'gps']);
export type SurveyAnswerType = z.infer<typeof SurveyAnswerTypeSchema>;

export const ValueStatusSchema = z.enum(['draft', 'submitted', 'approved', 'returned']);
export type ValueStatus = z.infer<typeof ValueStatusSchema>;

export const KNOWN_COMPUTE_KEYS = new Set([
  'slis.beneficiaries',
  'slis.beneficiaries_female_pct',
  'slis.area_serviced',
  'slis.area_improved',
  'slis.area_new',
  'slis.cropping_intensity',
  'slis.fee_recovery_rate',
  'slis.trained_dam_safety',
  'core.wua_operational',
  'me.survey.wua_participation',
  'me.tech_adopters',
  'me.tech_adopters_female',
  'slis.yield.tomato',
  'slis.yield.rice',
  'slis.yield.maize',
  'slis.yield.onion',
  'me.scorecards_published',
] as const);

export type KnownComputeKey = typeof KNOWN_COMPUTE_KEYS extends Set<infer T> ? T : never;
