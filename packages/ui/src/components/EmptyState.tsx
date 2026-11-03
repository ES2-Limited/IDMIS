import * as React from 'react';
import { cn } from '../utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-8 sm:p-12 text-center shadow-xs animate-in fade-in-50 max-w-md w-full',
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 shadow-2xs">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h3>
      <p className="mt-2 text-xs sm:text-sm text-slate-500 max-w-xs leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-6 w-full sm:w-auto">{action}</div>}
    </div>
  );
}
