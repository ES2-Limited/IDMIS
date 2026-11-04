import { describe, it, expect } from 'vitest';
import i18n, { formatCurrencyNGN, formatDateNG, formatDateTimeNG } from './index';

describe('i18n & Nigerian Locales (FE-1.7)', () => {
  it('initializes with default locale en-NG', () => {
    expect(i18n.language).toBe('en-NG');
  });

  it('translates common brand, actions, and status keys', () => {
    expect(i18n.t('brand.title', { ns: 'common' })).toBe('TRIMING IDMIS');
    expect(i18n.t('actions.save', { ns: 'common' })).toBe('Save');
    expect(i18n.t('actions.undo', { ns: 'common' })).toBe('Undo Batch');
    expect(i18n.t('status.saved_on_device', { ns: 'common' })).toBe('Saved on Device');
  });

  it('translates auth namespace keys', () => {
    expect(i18n.t('title', { ns: 'auth' })).toBe('Sign In to TRIMING IDMIS');
    expect(i18n.t('twoFactorTitle', { ns: 'auth' })).toBe('Two-Factor Authentication (TOTP)');
  });

  it('translates core administration namespace keys', () => {
    expect(i18n.t('title', { ns: 'core' })).toBe('Core Administration & Identity');
    expect(i18n.t('tabs.imports', { ns: 'core' })).toBe('Batch Import Center');
  });

  it('formats Nigerian currency in Naira (NGN)', () => {
    const formatted = formatCurrencyNGN(250000);
    // Should contain the Naira symbol ₦ or NGN
    expect(formatted).toMatch(/(₦|NGN)/);
    expect(formatted).toContain('250,000');
  });

  it('formats dates in Nigerian DD/MM/YYYY format', () => {
    const formatted = formatDateNG('2026-11-04T12:00:00Z');
    expect(formatted).toMatch(/04[/-]11[/-]2026/);
  });

  it('formats date and time in Nigerian format', () => {
    const formatted = formatDateTimeNG('2026-11-04T12:00:00Z');
    expect(formatted).toMatch(/04[/-]11[/-]2026/);
  });
});
