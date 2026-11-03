import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils';

export const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary-700 select-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary-700 text-white hover:bg-primary-800',
        secondary: 'border-transparent bg-accent-600 text-white hover:bg-accent-700',
        destructive: 'border-transparent bg-red-600 text-white hover:bg-red-700',
        outline: 'text-slate-900 border-slate-300',
        success: 'border-transparent bg-emerald-600 text-white',
        warning: 'border-transparent bg-amber-500 text-white',
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
