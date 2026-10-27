import { QueryClient } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';

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
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">IDMIS 2.0</h1>
        <p className="mt-2 text-sm text-slate-600">TRIMING IDMIS 2.0 placeholder page.</p>
      </div>
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
