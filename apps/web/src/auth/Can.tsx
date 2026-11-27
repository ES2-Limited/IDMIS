import * as React from 'react';
import { useCan } from './useCan';

interface CanProps {
  permission: string | string[];
  children: React.ReactNode;
  /** Optional content to render when the user lacks the permission */
  fallback?: React.ReactNode;
}

/**
 * Declarative permission gate. Renders `children` only when the current user
 * has the given `permission` (or any of the permissions if an array is passed);
 * otherwise renders `fallback` (default: nothing).
 */
export function Can({ permission, children, fallback = null }: CanProps) {
  const allowed = useCan(permission);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
