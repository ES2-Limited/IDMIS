import { QueryClient } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { ShellLayout } from '../shell/ShellLayout';
import { NotFound } from '../shell/NotFound';
import { ErrorBoundaryView } from '../shell/ErrorBoundaryView';
import { SignInPage } from '../routes/auth/SignInPage';
import { UnauthorizedPage } from '../routes/auth/UnauthorizedPage';
import { WorkspaceDashboard } from '../modules/dashboard/WorkspaceDashboard';
import { CoreHome } from '../modules/core/CoreHome';
import { SlisHome } from '../modules/slis/SlisHome';
import { MeHome } from '../modules/me/MeHome';
import { BlisHome } from '../modules/blis/BlisHome';

export const queryClient = new QueryClient();

// Root Route
const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: ({ error, reset }) => (
    <ErrorBoundaryView
      error={error instanceof Error ? error : new Error(String(error))}
      resetErrorBoundary={reset}
    />
  ),
});

// Auth Routes (unauthenticated shell)
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInPage,
});

const unauthorizedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/unauthorized',
  component: UnauthorizedPage,
});

// Authenticated Application Shell Route
const appShellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated-shell',
  component: ShellLayout,
});

// Workspace Home Dashboard
const indexRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/',
  component: WorkspaceDashboard,
});

// Module routes
const coreRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/core',
  component: CoreHome,
});

const slisRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/slis',
  component: SlisHome,
});

const meRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/me',
  component: MeHome,
});

const blisRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/blis',
  component: BlisHome,
});

const authenticatedChildren = appShellRoute.addChildren([
  indexRoute,
  coreRoute,
  slisRoute,
  meRoute,
  blisRoute,
]);

const routeTree = rootRoute.addChildren([signInRoute, unauthorizedRoute, authenticatedChildren]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
