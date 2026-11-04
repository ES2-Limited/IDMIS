import * as React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { LayoutDashboard, Sprout, TrendingUp, Building, MapPin } from 'lucide-react';
import { useCan } from '../auth';

export function BottomNav() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const canSlis = useCan('slis.farmer.read');
  const canMe = useCan('me.kpi.read');
  const canCore = useCan('core.user.read');

  const navItems = [
    { label: 'Overview', path: '/', icon: LayoutDashboard, exact: true },
    { label: 'SLIS', path: '/slis', icon: Sprout, show: canSlis },
    { label: 'Field Hub', path: '/field', icon: MapPin },
    { label: 'M&E', path: '/me', icon: TrendingUp, show: canMe },
    { label: 'Admin', path: '/core', icon: Building, show: canCore },
  ].filter((item) => item.show !== false);

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 py-1 shadow-lg"
    >
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const isActive =
            item.exact || item.path === '/field'
              ? currentPath === item.path
              : currentPath.startsWith(item.path);
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2 rounded-xl transition-all ${
                isActive
                  ? 'text-teal-700 font-semibold'
                  : 'text-slate-500 hover:text-slate-900 font-medium'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-all ${
                  isActive ? 'bg-teal-50 text-teal-700 scale-105' : 'text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
