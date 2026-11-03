import { QueryClient } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { ShellLayout } from '../shell/ShellLayout';
import { NotFound } from '../shell/NotFound';
import { ErrorBoundaryView } from '../shell/ErrorBoundaryView';
import { CoreHome } from '../modules/core/CoreHome';
import { SlisHome } from '../modules/slis/SlisHome';
import { MeHome } from '../modules/me/MeHome';
import { BlisHome } from '../modules/blis/BlisHome';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  StatusChip,
} from '@idmis/ui';
import { Link } from '@tanstack/react-router';

export const queryClient = new QueryClient();

// Root Route using ShellLayout
const rootRoute = createRootRoute({
  component: ShellLayout,
  notFoundComponent: NotFound,
  errorComponent: ({ error, reset }) => (
    <ErrorBoundaryView
      error={error instanceof Error ? error : new Error(String(error))}
      resetErrorBoundary={reset}
    />
  ),
});

// Workspace Home Dashboard
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Workspace Overview</h1>
          <p className="text-sm text-slate-500">
            Welcome to TRIMING IDMIS 2.0. Select an operational module to proceed.
          </p>
        </div>
        <div className="flex gap-2">
          <StatusChip status="approved">Phase 1 Foundations</StatusChip>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:border-primary-600 transition-colors">
          <CardHeader>
            <CardTitle className="text-base text-primary-700">Core Admin</CardTitle>
            <CardDescription>Users, WUAs, & Import Engine</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-600">
              Manage accounts, scopes, organisations, and batch spreadsheet imports.
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/core">Open Core Admin</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-primary-600 transition-colors">
          <CardHeader>
            <CardTitle className="text-base text-primary-700">SLIS</CardTitle>
            <CardDescription>Scheme Land Information System</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-600">
              Farmer registries, parcel GIS boundaries, water requests, and field conflict queues.
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/slis">Open SLIS</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-primary-600 transition-colors">
          <CardHeader>
            <CardTitle className="text-base text-primary-700">M&E</CardTitle>
            <CardDescription>Monitoring & Evaluation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-600">
              Results framework, quarterly indicator tracking, and survey collection.
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/me">Open M&E</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-primary-600 transition-colors">
          <CardHeader>
            <CardTitle className="text-base text-primary-700">BLIS</CardTitle>
            <CardDescription>Baseline Land Info & Dam Safety</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-600">
              River basins, hydrometric time series, vector maps, and dam inspections.
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/blis">Open BLIS</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  ),
});

// Module routes
const coreRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/core',
  component: CoreHome,
});

const slisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/slis',
  component: SlisHome,
});

const meRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/me',
  component: MeHome,
});

const blisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/blis',
  component: BlisHome,
});

const routeTree = rootRoute.addChildren([indexRoute, coreRoute, slisRoute, meRoute, blisRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
