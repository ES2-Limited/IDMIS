import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-primary-700 text-white hover:bg-primary-800 active:bg-primary-900',
        destructive: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
        outline:
          'border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 dark:border-slate-700',
        secondary: 'bg-accent-600 text-white hover:bg-accent-700 active:bg-accent-800',
        ghost: 'hover:bg-slate-100 text-slate-700',
        link: 'text-primary-700 underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-11 px-4 py-2 min-h-[44px] sm:min-h-[40px]',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-12 px-8 text-base min-h-[48px]',
        icon: 'h-11 w-11 min-h-[48px] min-w-[48px] p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';
