import * as React from 'react';
import { Button, type ButtonProps } from './Button';
import { cn } from '../utils';

export interface IconButtonProps extends Omit<ButtonProps, 'size'> {
  'aria-label': string;
  size?: 'sm' | 'default' | 'lg';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, 'aria-label': ariaLabel, size = 'default', ...props }, ref) => {
    const sizeClasses = {
      sm: 'h-9 w-9 min-h-[36px] min-w-[36px]',
      default: 'h-11 w-11 min-h-[48px] min-w-[48px]',
      lg: 'h-12 w-12 min-h-[48px] min-w-[48px]',
    };

    return (
      <Button
        ref={ref}
        size="icon"
        aria-label={ariaLabel}
        className={cn(sizeClasses[size], className)}
        {...props}
      />
    );
  },
);
IconButton.displayName = 'IconButton';
