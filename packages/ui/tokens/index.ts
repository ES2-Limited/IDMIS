export const colors = {
  primary: {
    DEFAULT: '#0F766E', // Deep Teal
    50: '#F0FDFA',
    100: '#CCFBF1',
    200: '#99F6E4',
    300: '#5EEAD4',
    400: '#2DD4BF',
    500: '#14B8A6',
    600: '#0D9488',
    700: '#0F766E',
    800: '#115E59',
    900: '#134E4A',
    950: '#042F2E',
  },
  accent: {
    DEFAULT: '#D97706', // Warm Ochre
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
    950: '#451A03',
  },
  status: {
    good: {
      bg: '#DCFCE7',
      text: '#166534',
      border: '#86EFAC',
    },
    warning: {
      bg: '#FEF3C7',
      text: '#92400E',
      border: '#FCD34D',
    },
    critical: {
      bg: '#FEE2E2',
      text: '#991B1B',
      border: '#FCA5A5',
    },
    neutral: {
      bg: '#F1F5F9',
      text: '#475569',
      border: '#CBD5E1',
    },
  },
} as const;

export type RecordStatusType =
  | 'draft'
  | 'saved_on_device'
  | 'syncing'
  | 'needs_fixing'
  | 'awaiting_review'
  | 'conflict'
  | 'returned'
  | 'approved';

export interface StatusChipConfig {
  label: string;
  variant: 'good' | 'warning' | 'critical' | 'neutral';
  description: string;
}

export const statusChipMap: Record<RecordStatusType, StatusChipConfig> = {
  draft: {
    label: 'Draft',
    variant: 'neutral',
    description: 'Work in progress not yet submitted',
  },
  saved_on_device: {
    label: 'Saved on device',
    variant: 'neutral',
    description: 'Stored locally in offline storage',
  },
  syncing: {
    label: 'Syncing',
    variant: 'warning',
    description: 'Currently synchronizing with the server',
  },
  needs_fixing: {
    label: 'Needs fixing',
    variant: 'critical',
    description: 'Validation failed or data rejected by server',
  },
  awaiting_review: {
    label: 'Awaiting review',
    variant: 'warning',
    description: 'Submitted and waiting for supervisor review',
  },
  conflict: {
    label: 'Conflict',
    variant: 'critical',
    description: 'Version conflict detected; held for resolution',
  },
  returned: {
    label: 'Returned',
    variant: 'critical',
    description: 'Returned by supervisor with feedback',
  },
  approved: {
    label: 'Approved',
    variant: 'good',
    description: 'Verified and approved into official records',
  },
};
