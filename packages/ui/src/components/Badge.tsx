import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-all select-none shadow-2xs max-w-full truncate sm:whitespace-nowrap tracking-tight',
  {
    variants: {
      variant: {
        default: 'border-teal-800/40 bg-teal-700 text-white shadow-xs',
        secondary: 'border-amber-600/40 bg-amber-500 text-white shadow-xs',
        destructive: 'border-rose-700/40 bg-rose-600 text-white shadow-xs',
        outline: 'text-slate-800 border-slate-300 bg-white shadow-2xs font-semibold',
        success: 'border-emerald-300 bg-emerald-50 text-emerald-850 font-bold',
        warning: 'border-amber-300 bg-amber-50 text-amber-900 font-bold',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
