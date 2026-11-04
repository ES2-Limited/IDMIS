import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonEn from './locales/en/common.json';
import authEn from './locales/en/auth.json';
import coreEn from './locales/en/core.json';

export const defaultNS = 'common';
export const resources = {
  'en-NG': {
    common: commonEn,
    auth: authEn,
    core: coreEn,
  },
  en: {
    common: commonEn,
    auth: authEn,
    core: coreEn,
  },
} as const;

i18n.use(initReactI18next).init({
  lng: 'en-NG',
  fallbackLng: 'en',
  defaultNS,
  resources,
  interpolation: {
    escapeValue: false, // React already safes from XSS
  },
});

export default i18n;

// Nigerian Formatting Helpers (en-NG)
export function formatCurrencyNGN(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateNG(date: string | Date | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-NG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function formatDateTimeNG(date: string | Date | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-NG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
