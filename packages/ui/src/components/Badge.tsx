import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all select-none shadow-2xs',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-teal-700 text-white shadow-xs',
        secondary: 'border-transparent bg-amber-500 text-white shadow-xs',
        destructive: 'border-transparent bg-rose-600 text-white shadow-xs',
        outline: 'text-slate-700 border-slate-200/90 bg-white shadow-2xs',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800 font-bold',
        warning: 'border-amber-200 bg-amber-50 text-amber-800 font-bold',
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
