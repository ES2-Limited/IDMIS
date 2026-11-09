import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from '../index';
import { state, lga, ward } from '../schema';
import { SYSTEM_USER_ID } from '../constants';
import { generateDeterministicId } from './deterministic-id';

export interface StateReferenceItem {
  code: string; // e.g. "NG001"
  state_code: string; // e.g. "AB"
  name: string;
}

export interface LgaReferenceItem {
  code: string; // e.g. "NG001001"
  name: string;
  state_pcode: string;
  state_code: string;
}

export interface WardReferenceItem {
  code: string; // e.g. "NG001001001"
  name: string;
  lga_code: string;
  state_code: string;
}

export interface SeedReferenceResult {
  state: { inserted: number; updated: number; unchanged: number };
  lga: { inserted: number; updated: number; unchanged: number };
  ward: { inserted: number; updated: number; unchanged: number };
}

function loadReferenceData(): {
  states: StateReferenceItem[];
  lgas: LgaReferenceItem[];
  wards: WardReferenceItem[];
} {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const candidateDirs = [
    path.resolve(__dirname, 'reference'),
    path.resolve(__dirname, '../seed/reference'),
    path.resolve(__dirname, '../../src/seed/reference'),
    path.resolve(process.cwd(), 'packages/db/src/seed/reference'),
    path.resolve(process.cwd(), 'src/seed/reference'),
  ];

  const refDir = candidateDirs.find((dir) => fs.existsSync(path.join(dir, 'states.json')));
  if (!refDir) {
    throw new Error(
      `Reference data files missing. Checked candidates: ${candidateDirs.join(', ')}`,
    );
  }

  const statesPath = path.join(refDir, 'states.json');
  const lgasPath = path.join(refDir, 'lgas.json');
  const wardsPath = path.join(refDir, 'wards.json');

  const states: StateReferenceItem[] = JSON.parse(fs.readFileSync(statesPath, 'utf8'));
  const lgas: LgaReferenceItem[] = JSON.parse(fs.readFileSync(lgasPath, 'utf8'));
  const wards: WardReferenceItem[] = JSON.parse(fs.readFileSync(wardsPath, 'utf8'));

  return { states, lgas, wards };
}

export function validateParentLinks(
  states: StateReferenceItem[],
  lgas: LgaReferenceItem[],
  wards: WardReferenceItem[],
): void {
  const validStateCodes = new Set<string>();
  for (const s of states) {
    validStateCodes.add(s.code.toUpperCase());
    validStateCodes.add(s.state_code.toUpperCase());
  }

  for (const l of lgas) {
    if (
      !validStateCodes.has(l.state_code.toUpperCase()) &&
      !validStateCodes.has(l.state_pcode.toUpperCase())
    ) {
      throw new Error(
        `Reference integrity check failed: LGA '${l.code}' (${l.name}) references non-existent parent state '${l.state_code}'`,
      );
    }
  }

  const validLgaCodes = new Set<string>(lgas.map((l) => l.code.toUpperCase()));
  for (const w of wards) {
    if (!validLgaCodes.has(w.lga_code.toUpperCase())) {
      throw new Error(
        `Reference integrity check failed: Ward '${w.code}' (${w.name}) references non-existent parent LGA '${w.lga_code}'`,
      );
    }
  }
}

export async function seedReferenceData(options?: {
  confirm?: boolean;
  databaseClient?: typeof db;
  customData?: {
    states: StateReferenceItem[];
    lgas: LgaReferenceItem[];
    wards: WardReferenceItem[];
  };
}): Promise<SeedReferenceResult> {
  const isConfirmed = options?.confirm ?? process.env.REFERENCE_SEED_CONFIRM === 'yes';
  if (!isConfirmed) {
    throw new Error(
      'Reference data seed refused: REFERENCE_SEED_CONFIRM=yes environment variable is required.',
    );
  }

  const targetDb = options?.databaseClient ?? db;
  const { states, lgas, wards } = options?.customData ?? loadReferenceData();

  // Validate parent links upfront before executing any database write
  validateParentLinks(states, lgas, wards);

  const stats: SeedReferenceResult = {
    state: { inserted: 0, updated: 0, unchanged: 0 },
    lga: { inserted: 0, updated: 0, unchanged: 0 },
    ward: { inserted: 0, updated: 0, unchanged: 0 },
  };

  await targetDb.transaction(async (tx) => {
    // ---------------------------------------------------------------------------
    // 1. States: Existing states keep their current IDs, mapped by code
    // ---------------------------------------------------------------------------
    const existingStates = await tx.select().from(state);
    const stateIdMap = new Map<string, string>(); // upper code/state_code -> state.id
    const existingStateByCode = new Map<string, typeof state.$inferSelect>();

    for (const s of existingStates) {
      stateIdMap.set(s.code.toUpperCase(), s.id);
      existingStateByCode.set(s.code.toUpperCase(), s);
    }

    for (const item of states) {
      const match =
        existingStateByCode.get(item.state_code.toUpperCase()) ||
        existingStateByCode.get(item.code.toUpperCase());

      if (match) {
        stateIdMap.set(item.state_code.toUpperCase(), match.id);
        stateIdMap.set(item.code.toUpperCase(), match.id);

        if (match.name !== item.name) {
          await tx
            .update(state)
            .set({
              name: item.name,
              updatedBy: SYSTEM_USER_ID,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(state.id, match.id));
          stats.state.updated++;
        } else {
          stats.state.unchanged++;
        }
      } else {
        const newId = generateDeterministicId('state', item.code);
        stateIdMap.set(item.state_code.toUpperCase(), newId);
        stateIdMap.set(item.code.toUpperCase(), newId);

        await tx.insert(state).values({
          id: newId,
          code: item.state_code,
          name: item.name,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        });
        stats.state.inserted++;
      }
    }

    // ---------------------------------------------------------------------------
    // 2. LGAs: Deterministic ID from type + code (UUID v5), upserted by code
    // ---------------------------------------------------------------------------
    const existingLgas = await tx.select().from(lga);
    const existingLgaByCode = new Map(existingLgas.map((l) => [l.code.toUpperCase(), l]));
    const lgaIdMap = new Map<string, string>();

    const lgasToInsert: Array<typeof lga.$inferInsert> = [];

    for (const item of lgas) {
      const stateId =
        stateIdMap.get(item.state_code.toUpperCase()) ||
        stateIdMap.get(item.state_pcode.toUpperCase());

      if (!stateId) {
        throw new Error(
          `Unable to resolve parent state ID for LGA '${item.code}' (${item.state_code})`,
        );
      }

      const existing = existingLgaByCode.get(item.code.toUpperCase());
      const deterministicId = generateDeterministicId('lga', item.code);

      if (existing) {
        lgaIdMap.set(item.code.toUpperCase(), existing.id);
        if (existing.name !== item.name || existing.stateId !== stateId) {
          await tx
            .update(lga)
            .set({
              name: item.name,
              stateId,
            })
            .where(eq(lga.id, existing.id));
          stats.lga.updated++;
        } else {
          stats.lga.unchanged++;
        }
      } else {
        lgaIdMap.set(item.code.toUpperCase(), deterministicId);
        lgasToInsert.push({
          id: deterministicId,
          stateId,
          code: item.code,
          name: item.name,
        });
        stats.lga.inserted++;
      }
    }

    // Batch insert new LGAs in chunks of 250
    const LGA_CHUNK_SIZE = 250;
    for (let i = 0; i < lgasToInsert.length; i += LGA_CHUNK_SIZE) {
      const chunk = lgasToInsert.slice(i, i + LGA_CHUNK_SIZE);
      await tx.insert(lga).values(chunk);
    }

    // ---------------------------------------------------------------------------
    // 3. Wards: Deterministic ID from type + code (UUID v5), upserted by code
    // ---------------------------------------------------------------------------
    const existingWards = await tx.select().from(ward);
    const existingWardByCode = new Map(existingWards.map((w) => [w.code.toUpperCase(), w]));

    const wardsToInsert: Array<typeof ward.$inferInsert> = [];

    for (const item of wards) {
      const lgaId = lgaIdMap.get(item.lga_code.toUpperCase());
      if (!lgaId) {
        throw new Error(
          `Unable to resolve parent LGA ID for Ward '${item.code}' (${item.lga_code})`,
        );
      }

      const existing = existingWardByCode.get(item.code.toUpperCase());
      const deterministicId = generateDeterministicId('ward', item.code);

      if (existing) {
        if (existing.name !== item.name || existing.lgaId !== lgaId) {
          await tx
            .update(ward)
            .set({
              name: item.name,
              lgaId,
            })
            .where(eq(ward.id, existing.id));
          stats.ward.updated++;
        } else {
          stats.ward.unchanged++;
        }
      } else {
        wardsToInsert.push({
          id: deterministicId,
          lgaId,
          code: item.code,
          name: item.name,
        });
        stats.ward.inserted++;
      }
    }

    // Batch insert new Wards in chunks of 500
    const WARD_CHUNK_SIZE = 500;
    for (let i = 0; i < wardsToInsert.length; i += WARD_CHUNK_SIZE) {
      const chunk = wardsToInsert.slice(i, i + WARD_CHUNK_SIZE);
      await tx.insert(ward).values(chunk);
    }
  });

  // Print results per table
  console.log(
    `Table state: ${stats.state.inserted} inserted / ${stats.state.updated} updated / ${stats.state.unchanged} unchanged`,
  );
  console.log(
    `Table lga: ${stats.lga.inserted} inserted / ${stats.lga.updated} updated / ${stats.lga.unchanged} unchanged`,
  );
  console.log(
    `Table ward: ${stats.ward.inserted} inserted / ${stats.ward.updated} updated / ${stats.ward.unchanged} unchanged`,
  );

  return stats;
}
