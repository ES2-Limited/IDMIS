import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-teal-700 text-white shadow-xs hover:bg-teal-800 hover:shadow-sm active:bg-teal-900 border border-teal-800/30',
        destructive:
          'bg-rose-600 text-white shadow-xs hover:bg-rose-700 hover:shadow-sm active:bg-rose-800 border border-rose-700/30',
        outline:
          'border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 text-slate-800 shadow-2xs hover:text-slate-950 font-semibold',
        secondary:
          'bg-amber-500 text-white shadow-xs hover:bg-amber-600 hover:shadow-sm active:bg-amber-700 border border-amber-600/30',
        ghost: 'hover:bg-slate-100 text-slate-700 hover:text-slate-950 font-medium',
        link: 'text-teal-700 underline-offset-4 hover:underline p-0 h-auto cursor-pointer font-medium',
      },
      size: {
        default: 'h-10 px-4 py-2 min-h-[40px]',
        sm: 'h-8.5 px-3 text-xs min-h-[34px] rounded-lg',
        lg: 'h-11.5 px-6 text-base min-h-[46px] rounded-xl font-bold',
        icon: 'h-10 w-10 min-h-[40px] min-w-[40px] p-0 rounded-xl',
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
