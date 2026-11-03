import * as React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { ScopePicker } from './ScopePicker';
import { IconButton } from '@idmis/ui';
import { Search, Bell, User, Menu, LogOut } from 'lucide-react';
import { useAuth } from '../auth';

interface TopBarProps {
  onToggleSidebar?: () => void;
}

export function TopBar({ onToggleSidebar }: TopBarProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { user, signOut } = useAuth();

  const modules = [
    { id: 'core', label: 'Core Admin', path: '/core' },
    { id: 'slis', label: 'SLIS', path: '/slis' },
    { id: 'me', label: 'M&E', path: '/me' },
    { id: 'blis', label: 'BLIS', path: '/blis' },
  ];

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-4 shadow-2xs sm:px-6">
      <div className="flex items-center gap-3 md:gap-6">
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="Toggle navigation menu"
          className="md:hidden"
          onClick={onToggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </IconButton>

        <Link to="/" className="flex items-center gap-2 font-bold text-slate-900 tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-700 text-white font-black text-sm">
            ID
          </span>
          <span className="hidden font-bold sm:inline text-base">TRIMING IDMIS</span>
        </Link>

        {/* Module Switcher */}
        <nav
          aria-label="Modules"
          className="hidden lg:flex items-center gap-1 border-l border-slate-200 pl-4"
        >
          {modules.map((m) => {
            const isActive = currentPath.startsWith(m.path);
            return (
              <Link
                key={m.id}
                to={m.path}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors min-h-[36px] flex items-center ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {m.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {/* Scope Picker */}
        <div className="hidden sm:block">
          <ScopePicker />
        </div>

        {/* Search Placeholder */}
        <div className="relative hidden xl:block w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search records..."
            aria-label="Global search"
            className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-700"
          />
        </div>

        {/* Notification Placeholder */}
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="Notifications"
          className="text-slate-600 hover:text-slate-900"
        >
          <Bell className="h-4 w-4" />
        </IconButton>

        {/* Profile menu */}
        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
          <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-medium text-xs">
            <User className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="hidden md:inline text-xs font-medium text-slate-700">
            {user?.fullName ?? 'Guest User'}
          </span>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label="Sign out"
            title="Sign out"
            className="text-slate-500 hover:text-red-600 ml-1"
            onClick={() => signOut()}
          >
            <LogOut className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
