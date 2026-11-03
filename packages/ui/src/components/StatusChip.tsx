import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils';
import { statusChipMap, type RecordStatusType } from '../tokens';

export const statusChipVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold border select-none shadow-2xs tracking-tight',
  {
    variants: {
      variant: {
        good: 'bg-emerald-50 text-emerald-800 border-emerald-200/90',
        warning: 'bg-amber-50 text-amber-800 border-amber-200/90',
        critical: 'bg-rose-50 text-rose-800 border-rose-200/90',
        neutral: 'bg-slate-100/80 text-slate-700 border-slate-200',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface StatusChipProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof statusChipVariants> {
  status?: RecordStatusType;
}

export function StatusChip({ status, variant, className, children, ...props }: StatusChipProps) {
  const config = status ? statusChipMap[status] : undefined;
  const resolvedVariant = variant || config?.variant || 'neutral';
  const label = children || config?.label || status;

  return (
    <span
      className={cn(statusChipVariants({ variant: resolvedVariant }), className)}
      title={config?.description}
      {...props}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          resolvedVariant === 'good' && 'bg-emerald-500',
          resolvedVariant === 'warning' && 'bg-amber-500',
          resolvedVariant === 'critical' && 'bg-rose-500',
          resolvedVariant === 'neutral' && 'bg-slate-400',
        )}
      />
      {label}
    </span>
  );
}
