import * as React from 'react';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { TopBar } from './TopBar';
import { SideNav } from './SideNav';
import { ScopeProvider } from './ScopeContext';
import { SyncProvider } from '../sync';
import { Sheet, SheetContent, Spinner } from '@idmis/ui';
import { useAuth } from '../auth';

export function ShellLayout() {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: '/sign-in' });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size="lg" className="text-teal-700" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <ScopeProvider>
      <SyncProvider>
        <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
          <TopBar onToggleSidebar={() => setMobileNavOpen((prev) => !prev)} />

          <div className="flex flex-1">
            {/* Desktop Sidebar */}
            <div className="hidden md:block">
              <SideNav />
            </div>

            {/* Mobile Navigation Sheet */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetContent side="left" className="p-0 w-72">
                <div className="pt-6">
                  <SideNav />
                </div>
              </SheetContent>
            </Sheet>

            {/* Main Content Area */}
            <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto max-w-7xl">
              <Outlet />
            </main>
          </div>
        </div>
      </SyncProvider>
    </ScopeProvider>
  );
}
