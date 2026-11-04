import * as React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Home, PlusCircle, FolderCheck, RefreshCw, UserCheck } from 'lucide-react';
import { useSync } from '../sync';

export function FieldBottomBar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { pendingOpsCount, syncState } = useSync();

  const isSyncing = syncState === 'pushing' || syncState === 'pulling';

  const tabs = [
    { label: 'Home', path: '/field', icon: Home, exact: true },
    { label: 'Capture', path: '/field/capture', icon: PlusCircle },
    {
      label: 'My Records',
      path: '/field/records',
      icon: FolderCheck,
      badge: pendingOpsCount > 0 ? pendingOpsCount : undefined,
    },
    {
      label: 'Sync',
      path: '/field/sync',
      icon: RefreshCw,
      isSpinning: isSyncing,
      badge: pendingOpsCount > 0 ? `${pendingOpsCount}` : undefined,
    },
    { label: 'Me', path: '/field/profile', icon: UserCheck },
  ];

  return (
    <nav
      aria-label="Field Collector Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-teal-800/40 px-2 py-1.5 shadow-2xl safe-area-bottom"
    >
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive =
            tab.exact || tab.path === '/field'
              ? currentPath === tab.path
              : currentPath.startsWith(tab.path);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`relative flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2.5 rounded-xl transition-all ${
                isActive
                  ? 'text-teal-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
            >
              <div
                className={`relative p-1 rounded-lg transition-transform ${
                  isActive ? 'bg-teal-500/20 text-teal-400 scale-110' : 'text-slate-400'
                }`}
              >
                <Icon className={`h-5 w-5 ${tab.isSpinning ? 'animate-spin text-teal-300' : ''}`} />
                {tab.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2 bg-amber-500 text-slate-950 font-black text-[9px] min-w-4 h-4 rounded-full flex items-center justify-center px-1 shadow-sm">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-1 leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
