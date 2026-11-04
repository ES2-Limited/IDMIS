import { z } from 'zod';
import type { ImportColumnDefinition } from '../core/import';
import { ScopeTypeSchema } from '../core/enums';

export const ME_IMPORT_DATASETS = ['me.indicator_target', 'me.indicator_value'] as const;
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
};
