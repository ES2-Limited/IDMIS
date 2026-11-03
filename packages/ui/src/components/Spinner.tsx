import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../utils';

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'default' | 'lg';
}

export function Spinner({ size = 'default', className, ...props }: SpinnerProps) {
  const sizeMap = {
    sm: 'h-4 w-4',
    default: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn('inline-flex items-center justify-center', className)}
      {...props}
    >
      <Loader2 className={cn('animate-spin text-primary-700', sizeMap[size])} />
      <span className="sr-only">Loading...</span>
    </div>
  );
}
