import { describe, it, expect } from 'vitest';
import { colors, statusChipMap } from './tokens';
import { buttonVariants } from './components/Button';
import { statusChipVariants } from './components/StatusChip';
import { badgeVariants } from './components/Badge';

describe('UI Design System Tokens & Variants', () => {
  it('defines primary water-and-soil palette with deep teal', () => {
    expect(colors.primary.DEFAULT).toBe('#0F766E');
    expect(colors.primary[700]).toBe('#0F766E');
    expect(colors.accent.DEFAULT).toBe('#D97706');
    expect(colors.accent[600]).toBe('#D97706');
  });

  it('maps all required record status types to variants and labels', () => {
    const statuses = [
      'draft',
      'saved_on_device',
      'syncing',
      'needs_fixing',
      'awaiting_review',
      'conflict',
      'returned',
      'approved',
    ] as const;

    statuses.forEach((status) => {
      const config = statusChipMap[status];
      expect(config).toBeDefined();
      expect(config.label).toBeDefined();
      expect(['good', 'warning', 'critical', 'neutral']).toContain(config.variant);
    });

    expect(statusChipMap.draft.label).toBe('Draft');
    expect(statusChipMap.saved_on_device.label).toBe('Saved on device');
    expect(statusChipMap.syncing.variant).toBe('warning');
    expect(statusChipMap.conflict.variant).toBe('critical');
    expect(statusChipMap.approved.variant).toBe('good');
  });

  it('provides button variant class generator', () => {
    const defaultBtn = buttonVariants({ variant: 'default' });
    expect(defaultBtn).toContain('bg-primary-700');

    const secBtn = buttonVariants({ variant: 'secondary' });
    expect(secBtn).toContain('bg-accent-600');

    const iconBtn = buttonVariants({ size: 'icon' });
    expect(iconBtn).toContain('min-h-[48px]');
  });

  it('provides badge and status chip variant generators', () => {
    const goodChip = statusChipVariants({ variant: 'good' });
    expect(goodChip).toContain('bg-emerald-50');

    const critBadge = badgeVariants({ variant: 'destructive' });
    expect(critBadge).toContain('bg-red-600');
  });
});
