import { describe, expect, it } from 'vitest';
import { generateDeterministicId } from './deterministic-id';
import {
  seedReferenceData,
  validateParentLinks,
  type StateReferenceItem,
  type LgaReferenceItem,
  type WardReferenceItem,
} from './seed-reference';
import { db } from '../index';
import { appUser, state, lga, ward } from '../schema';
import { SYSTEM_USER_ID } from '../constants';
import { eq } from 'drizzle-orm';

describe('Reference Data Seed & Deterministic IDs (BE-Geography)', () => {
  describe('Deterministic ID Generator (UUID v5)', () => {
    it('produces identical UUID v5 for same type and code', () => {
      const id1 = generateDeterministicId('lga', 'NG020001');
      const id2 = generateDeterministicId('lga', 'NG020001');
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('normalises whitespace and case in code', () => {
      const id1 = generateDeterministicId('lga', 'ng020001');
      const id2 = generateDeterministicId('lga', '  NG020001  ');
      expect(id1).toBe(id2);
    });

    it('produces distinct UUIDs for different entity types with same code', () => {
      const idLga = generateDeterministicId('lga', 'CODE-01');
      const idWard = generateDeterministicId('ward', 'CODE-01');
      expect(idLga).not.toBe(idWard);
    });
  });

  describe('Parent Link Validation', () => {
    const states: StateReferenceItem[] = [
      { code: 'NG001', state_code: 'AB', name: 'Abia' },
      { code: 'NG020', state_code: 'KN', name: 'Kano' },
    ];
    const lgas: LgaReferenceItem[] = [
      { code: 'NG020001', name: 'Ajingi', state_pcode: 'NG020', state_code: 'KN' },
    ];
    const wards: WardReferenceItem[] = [
      { code: 'NG020001001', name: 'Ajingi Ward', lga_code: 'NG020001', state_code: 'KN' },
    ];

    it('succeeds when all parent links are valid', () => {
      expect(() => validateParentLinks(states, lgas, wards)).not.toThrow();
    });

    it('throws before DB write when LGA parent state is invalid', () => {
      const badLgas: LgaReferenceItem[] = [
        { code: 'NG999001', name: 'Bad LGA', state_pcode: 'NG999', state_code: 'XX' },
      ];
      expect(() => validateParentLinks(states, badLgas, wards)).toThrow(/parent state 'XX'/);
    });

    it('throws before DB write when Ward parent LGA is invalid', () => {
      const badWards: WardReferenceItem[] = [
        { code: 'NG020001999', name: 'Bad Ward', lga_code: 'NG999999', state_code: 'KN' },
      ];
      expect(() => validateParentLinks(states, lgas, badWards)).toThrow(/parent LGA 'NG999999'/);
    });
  });

  describe('Seed Execution & Idempotency', () => {
    it('refuses to run unless REFERENCE_SEED_CONFIRM=yes', async () => {
      const prev = process.env.REFERENCE_SEED_CONFIRM;
      delete process.env.REFERENCE_SEED_CONFIRM;

      try {
        await expect(seedReferenceData({ confirm: false })).rejects.toThrow(
          /REFERENCE_SEED_CONFIRM=yes environment variable is required/,
        );
      } finally {
        if (prev) process.env.REFERENCE_SEED_CONFIRM = prev;
      }
    });

    it('executes cleanly in a transaction, keeps existing state IDs, and reports unchanged on re-run', async () => {
      // Create test dataset
      const testStates: StateReferenceItem[] = [{ code: 'NG020', state_code: 'KN', name: 'Kano' }];
      const testLgas: LgaReferenceItem[] = [
        { code: 'NG020099', name: 'Test Ref LGA', state_pcode: 'NG020', state_code: 'KN' },
      ];
      const testWards: WardReferenceItem[] = [
        { code: 'NG020099001', name: 'Test Ref Ward', lga_code: 'NG020099', state_code: 'KN' },
      ];

      // Ensure SYSTEM_USER_ID exists in DB
      await db
        .insert(appUser)
        .values({
          id: SYSTEM_USER_ID,
          email: 'system@idmis.internal',
          username: 'system',
          fullName: 'System',
          passwordHash: '*',
          isActive: false,
          mustChangePassword: false,
          failedSignIns: 0,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        })
        .onConflictDoNothing({ target: appUser.id });

      // Ensure Kano state exists in DB
      let [existingKano] = await db.select().from(state).where(eq(state.code, 'KN')).limit(1);
      if (!existingKano) {
        const [inserted] = await db
          .insert(state)
          .values({
            id: '018f3a5e-0001-7000-8000-000000000020',
            code: 'KN',
            name: 'Kano',
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          })
          .returning();
        existingKano = inserted!;
      }

      const initialKanoId = existingKano.id;

      // 1. First run: should insert the new test LGA and Ward, and mark state unchanged
      const run1 = await seedReferenceData({
        confirm: true,
        customData: {
          states: testStates,
          lgas: testLgas,
          wards: testWards,
        },
      });

      expect(run1.state.inserted).toBe(0);
      expect(run1.state.unchanged).toBe(1);
      expect(run1.lga.inserted).toBe(1);
      expect(run1.ward.inserted).toBe(1);

      // Verify state ID was preserved
      const [kanoAfter] = await db.select().from(state).where(eq(state.code, 'KN')).limit(1);
      expect(kanoAfter?.id).toBe(initialKanoId);

      // Verify LGA & Ward deterministic IDs
      const expectedLgaId = generateDeterministicId('lga', 'NG020099');
      const expectedWardId = generateDeterministicId('ward', 'NG020099001');

      const [lgaRow] = await db.select().from(lga).where(eq(lga.code, 'NG020099')).limit(1);
      expect(lgaRow?.id).toBe(expectedLgaId);
      expect(lgaRow?.stateId).toBe(initialKanoId);

      const [wardRow] = await db.select().from(ward).where(eq(ward.code, 'NG020099001')).limit(1);
      expect(wardRow?.id).toBe(expectedWardId);
      expect(wardRow?.lgaId).toBe(expectedLgaId);

      // 2. Second run: idempotency check (all must be unchanged, 0 inserted, 0 updated)
      const run2 = await seedReferenceData({
        confirm: true,
        customData: {
          states: testStates,
          lgas: testLgas,
          wards: testWards,
        },
      });

      expect(run2.state.inserted).toBe(0);
      expect(run2.state.updated).toBe(0);
      expect(run2.state.unchanged).toBe(1);

      expect(run2.lga.inserted).toBe(0);
      expect(run2.lga.updated).toBe(0);
      expect(run2.lga.unchanged).toBe(1);

      expect(run2.ward.inserted).toBe(0);
      expect(run2.ward.updated).toBe(0);
      expect(run2.ward.unchanged).toBe(1);

      // Clean up test rows
      await db.delete(ward).where(eq(ward.code, 'NG020099001'));
      await db.delete(lga).where(eq(lga.code, 'NG020099'));
    });
  });
});
