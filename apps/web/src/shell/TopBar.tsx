import * as React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { ScopePicker } from './ScopePicker';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SyncDrawer } from './SyncDrawer';
import { IconButton } from '@idmis/ui';
import { Bell, User, Menu, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth';
import { useSync } from '../sync';

interface TopBarProps {
  onToggleSidebar?: () => void;
}

export function TopBar({ onToggleSidebar }: TopBarProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { user, signOut } = useAuth();
  const { syncState, pendingOpsCount } = useSync();
  const [syncDrawerOpen, setSyncDrawerOpen] = React.useState(false);

  const modules = [
    { id: 'core', label: 'Core Admin', path: '/core' },
    { id: 'slis', label: 'SLIS', path: '/slis' },
    { id: 'me', label: 'M&E', path: '/me' },
    { id: 'blis', label: 'BLIS', path: '/blis' },
    { id: 'field', label: 'Field Station', path: '/field' },
  ];

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/90 backdrop-blur-md px-3.5 sm:px-6 shadow-xs">
      <div className="flex items-center gap-2.5 sm:gap-4 md:gap-6">
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="Toggle navigation menu"
          className="inline-flex md:hidden text-slate-600 hover:text-slate-900 cursor-pointer"
          onClick={onToggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </IconButton>

        <Link
          to="/"
          className="flex items-center gap-2.5 font-bold text-slate-900 tracking-tight cursor-pointer"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-700 to-teal-900 text-white font-black text-sm shadow-sm ring-1 ring-teal-800/20">
            ID
          </span>
          <div className="flex flex-col">
            <span className="font-extrabold text-sm sm:text-base leading-tight tracking-tight text-slate-900">
              TRIMING <span className="text-teal-700 font-bold">IDMIS</span>
            </span>
            <span className="hidden sm:inline text-[10px] text-slate-400 font-medium leading-none">
              Federal Ministry of Water Resources
            </span>
          </div>
        </Link>

        {/* Module Switcher (Desktop) */}
        <nav
          aria-label="Modules"
          className="hidden lg:flex items-center gap-1.5 border-l border-slate-200/80 pl-4 ml-1"
        >
          {modules.map((m) => {
            const isActive =
              m.path === '/field' ? currentPath === m.path : currentPath.startsWith(m.path);
            return (
              <Link
                key={m.id}
                to={m.path}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all min-h-[34px] flex items-center ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 shadow-2xs font-bold'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 font-semibold'
                }`}
              >
                {m.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {/* Offline Sync Status & Manual Trigger */}
        <button
          type="button"
          onClick={() => setSyncDrawerOpen(true)}
          aria-label="Open synchronization drawer"
          title={`Sync status: ${syncState}. Pending mutations: ${pendingOpsCount}. Click to open details.`}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
            syncState === 'error'
              ? 'border-red-300 bg-red-50 text-red-800 shadow-2xs font-bold'
              : syncState === 'pushing' || syncState === 'pulling'
                ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-2xs font-bold'
                : pendingOpsCount > 0
                  ? 'border-amber-300 bg-amber-50/90 text-amber-900 shadow-2xs font-bold'
                  : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-950'
          }`}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${
              syncState === 'pushing' || syncState === 'pulling'
                ? 'animate-spin text-amber-600'
                : pendingOpsCount > 0
                  ? 'text-amber-600'
                  : 'text-slate-400'
            }`}
          />
          <span className="hidden sm:inline font-medium">
            {syncState === 'pushing'
              ? 'Syncing...'
              : syncState === 'pulling'
                ? 'Pulling...'
                : syncState === 'error'
                  ? 'Sync error'
                  : pendingOpsCount > 0
                    ? `${pendingOpsCount} unsaved`
                    : 'Synced'}
          </span>
        </button>

        {/* Scope Picker (Scheme / National) */}
        <div>
          <ScopePicker />
        </div>

        {/* National Language Switcher */}
        <div>
          <LanguageSwitcher />
        </div>

        {/* Notification Placeholder */}
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="Notifications"
          className="text-slate-700 hover:text-slate-950 rounded-lg hidden sm:flex cursor-pointer"
        >
          <Bell className="h-4 w-4" />
        </IconButton>

        {/* Profile menu */}
        <div className="flex items-center gap-2 border-l border-slate-200/80 pl-2 sm:pl-3">
          <div className="h-8 w-8 rounded-full bg-teal-100/70 border border-teal-200 text-teal-800 flex items-center justify-center font-bold text-xs shadow-2xs">
            {user?.fullName ? (
              user.fullName.charAt(0)
            ) : (
              <User className="h-4 w-4" aria-hidden="true" />
            )}
          </div>
          <span className="hidden lg:inline text-xs font-semibold text-slate-800 max-w-[120px] truncate">
            {user?.fullName ?? 'Admin User'}
          </span>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label="Sign out"
            title="Sign out"
            className="text-slate-600 hover:text-red-700 rounded-lg p-1 cursor-pointer"
            onClick={() => signOut()}
          >
            <LogOut className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {/* Slide-out Offline Sync & Reconciliation Drawer */}
      <SyncDrawer open={syncDrawerOpen} onOpenChange={setSyncDrawerOpen} />
    </header>
  );
}
