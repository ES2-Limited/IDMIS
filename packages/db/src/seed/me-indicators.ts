import { sql, eq, and } from 'drizzle-orm';
import { db as defaultDb } from '../index';
import { resultsFramework, indicator } from '../schema/me';
import { SYSTEM_USER_ID } from '../constants';
import { KNOWN_COMPUTE_KEYS, KnownComputeKey } from '@idmis/contracts';
import { meIndicatorsData } from './me-indicators.data';

export interface IndicatorSeedDefinition {
  code: string;
  name: string;
  level: 'pdo' | 'intermediate';
  unit: string;
  frequency?: string;
  method: 'manual' | 'computed' | 'survey';
  computeKey?: string | null;
  endTarget?: string | number | null;
  endTargetNote?: string | null;
  disaggregations?: string[];
  baseline?: string | null;
  baselineYear?: number | null;
  dataSource?: string | null;
  responsible?: string | null;
}

export function validateIndicatorDefinitions(definitions: IndicatorSeedDefinition[]): void {
  const seenCodes = new Set<string>();

  for (const def of definitions) {
    if (!def.code || !def.code.trim()) {
      throw new Error(`Indicator code cannot be empty`);
    }
    const code = def.code.trim();
    if (seenCodes.has(code)) {
      throw new Error(`Duplicate indicator code: "${code}"`);
    }
    seenCodes.add(code);

    if (!def.unit || !def.unit.trim()) {
      throw new Error(`Indicator "${code}" must have a non-empty unit`);
    }

    if (def.method === 'computed') {
      if (!def.computeKey || !def.computeKey.trim()) {
        throw new Error(`Indicator "${code}" with method 'computed' must have a computeKey`);
      }
    } else if (def.method === 'manual') {
      if (def.computeKey && def.computeKey.trim().length > 0) {
        throw new Error(`Indicator "${code}" with method 'manual' must not have a computeKey`);
      }
    }

    if (def.computeKey && def.computeKey.trim().length > 0) {
      if (!KNOWN_COMPUTE_KEYS.has(def.computeKey as KnownComputeKey)) {
        throw new Error(
          `Indicator "${code}" has unknown computeKey "${def.computeKey}". Known keys: ${Array.from(
            KNOWN_COMPUTE_KEYS,
          ).join(', ')}`,
        );
      }
    }
  }
}

export async function loadMeIndicators(
  frameworkId?: string,
  definitions: IndicatorSeedDefinition[] = meIndicatorsData,
  txDb = defaultDb,
): Promise<{ loaded: number }> {
  validateIndicatorDefinitions(definitions);

  if (definitions.length === 0) {
    return { loaded: 0 };
  }

  let targetFrameworkId = frameworkId;
  if (!targetFrameworkId) {
    const defaultId = '018f3a5e-0005-7000-0000-000000000001';
    const [existing] = await txDb
      .select({ id: resultsFramework.id })
      .from(resultsFramework)
      .where(
        and(
          eq(resultsFramework.name, 'TRIMING Results Framework'),
          eq(resultsFramework.version, '2.0-provisional'),
        ),
      )
      .limit(1);

    if (existing) {
      targetFrameworkId = existing.id;
    } else {
      await txDb
        .insert(resultsFramework)
        .values({
          id: defaultId,
          name: 'TRIMING Results Framework',
          version: '2.0-provisional',
          isCurrent: true,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        })
        .onConflictDoNothing();
      targetFrameworkId = defaultId;
    }
  }

  let count = 0;
  for (const def of definitions) {
    await txDb
      .insert(indicator)
      .values({
        id: crypto.randomUUID(),
        frameworkId: targetFrameworkId,
        code: def.code.trim(),
        name: def.name,
        level: def.level,
        unit: def.unit,
        frequency: def.frequency ?? 'annual',
        method: def.method,
        computeKey: def.computeKey ?? null,
        endTarget: def.endTarget != null ? String(def.endTarget) : null,
        endTargetNote: def.endTargetNote ?? null,
        disaggregations: def.disaggregations ?? [],
        baseline: def.baseline != null ? String(def.baseline) : null,
        baselineYear: def.baselineYear ?? null,
        dataSource: def.dataSource ?? null,
        responsible: def.responsible ?? null,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      })
      .onConflictDoUpdate({
        target: [indicator.frameworkId, indicator.code],
        set: {
          name: def.name,
          level: def.level,
          unit: def.unit,
          frequency: def.frequency ?? 'annual',
          method: def.method,
          computeKey: def.computeKey ?? null,
          endTarget: def.endTarget != null ? String(def.endTarget) : null,
          endTargetNote: def.endTargetNote ?? null,
          disaggregations: def.disaggregations ?? [],
          baseline: def.baseline != null ? String(def.baseline) : null,
          baselineYear: def.baselineYear ?? null,
          dataSource: def.dataSource ?? null,
          responsible: def.responsible ?? null,
          updatedBy: SYSTEM_USER_ID,
          updatedAt: sql`now()`,
        },
      });
    count++;
  }

  return { loaded: count };
}
