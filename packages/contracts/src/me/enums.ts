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
  'slis.beneficiaries_gender',
  'slis.area_by_service',
  'slis.cropping_intensity',
  'slis.yield',
  'slis.fee_recovery',
  'slis.wuas_operational',
  'slis.trainings_tag',
  'me.tech_adoption',
  'me.scorecard',
  'me.matching_grant',
] as const);

export type KnownComputeKey = typeof KNOWN_COMPUTE_KEYS extends Set<infer T> ? T : never;
