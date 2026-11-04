import { z } from 'zod';

/**
 * Normalise disaggregation jsonb:
 * - strip null, undefined, and empty string ("") values
 * - sort keys alphabetically
 * - returns empty object if no valid keys exist
 */
export function normalizeDisaggregation(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const record = input as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const result: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    const val = record[key];
    if (val === null || val === undefined || val === '') {
      continue;
    }
    result[key] = val;
  }

  return result;
}

export const DisaggregationSchema = z.preprocess(
  (val) => normalizeDisaggregation(val),
  z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
);

export type Disaggregation = z.infer<typeof DisaggregationSchema>;
