import { QueryClient } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import {
  Button,
  StatusChip,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@idmis/ui';

export const queryClient = new QueryClient();

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg shadow-sm border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl text-primary-700">TRIMING IDMIS 2.0</CardTitle>
            <StatusChip status="approved" />
          </div>
          <CardDescription>
            Irrigation Data Management Information System — Design System & UI Foundations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Welcome to IDMIS 2.0. The design system tokens, accessible primitives, and status
            indicators are active.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <StatusChip status="draft" />
            <StatusChip status="saved_on_device" />
            <StatusChip status="syncing" />
            <StatusChip status="awaiting_review" />
            <StatusChip status="conflict" />
            <StatusChip status="returned" />
          </div>
          <div className="pt-4 flex gap-3">
            <Button variant="default">Primary Action</Button>
            <Button variant="secondary">Secondary Action</Button>
            <Button variant="outline">Dismiss</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  ),
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
