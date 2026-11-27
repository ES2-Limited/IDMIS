import * as React from 'react';
import { Navigate } from '@tanstack/react-router';
import { useCan } from './useCan';

interface PermissionGuardProps {
  /** Permission (or list of permissions, any-of) required to access the wrapped route. */
  permission: string | string[];
  children: React.ReactNode;
}

/**
 * Route-level permission guard. When the authenticated user does not hold
 * `permission`, they are redirected to `/unauthorized` instead of seeing
 * an empty or broken page.
 */
export function PermissionGuard({ permission, children }: PermissionGuardProps) {
  const allowed = useCan(permission);

  if (!allowed) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
