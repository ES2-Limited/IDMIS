import * as React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Sprout,
  TrendingUp,
  Building,
  MapPin,
  Waves,
  Target,
  FileText,
  Database,
  Users,
  UploadCloud,
  Compass,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useCan, MODULE_PERMISSIONS } from '../auth';
import { useActiveNavSection } from './SideNav';

interface BottomTab {
  label: string;
  path: string;
  icon: LucideIcon;
  exact?: boolean;
  permission?: string | string[];
}

function BottomTabLink({ tab, currentPath }: { tab: BottomTab; currentPath: string }) {
  const allowed = useCan(tab.permission);
  if (!allowed) return null;

  const isActive = tab.exact
    ? currentPath === tab.path
    : currentPath === tab.path || currentPath.startsWith(`${tab.path}/`);
  const Icon = tab.icon;

  return (
    <Link
      to={tab.path}
      className={`flex flex-col items-center justify-center min-w-[52px] min-h-[48px] py-1 px-2 rounded-xl transition-all ${
        isActive
          ? 'text-teal-800 font-bold'
          : 'text-slate-600 hover:text-slate-950 font-semibold'
      }`}
    >
      <div
        className={`p-1 rounded-lg transition-all ${
          isActive ? 'bg-teal-50 text-teal-800 scale-105' : 'text-slate-600'
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-[64px]">{tab.label}</span>
    </Link>
  );
}

interface BottomNavProps {
  onOpenMore?: () => void;
}

export function BottomNav({ onOpenMore }: BottomNavProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const activeSection = useActiveNavSection(currentPath);

  let tabs: BottomTab[];

  if (activeSection === 'me') {
    tabs = [
      { label: 'Home', path: '/me', icon: LayoutDashboard, exact: true },
      { label: 'Indicators', path: '/me/indicators', icon: Target, permission: 'me.indicator.read' },
      {
        label: 'Entry',
        path: '/me/entry',
        icon: FileText,
        permission: ['me.value.submit', 'me.value.approve'],
      },
      { label: 'Surveys', path: '/me/surveys', icon: Database, permission: 'me.survey.manage' },
    ];
  } else if (activeSection === 'slis') {
    tabs = [
      { label: 'Home', path: '/slis', icon: LayoutDashboard, exact: true },
      {
        label: 'Farmers',
        path: '/slis/farmers',
        icon: Users,
        permission: [...MODULE_PERMISSIONS.slis],
      },
      {
        label: 'Plots',
        path: '/slis/plots',
        icon: MapPin,
        permission: [...MODULE_PERMISSIONS.slis],
      },
      {
        label: 'Water',
        path: '/slis/water',
        icon: Waves,
        permission: 'slis.water_request.read',
      },
    ];
  } else if (activeSection === 'blis') {
    tabs = [
      { label: 'Map', path: '/blis', icon: MapPin, exact: true },
      { label: 'Basins', path: '/blis/basins', icon: Compass, permission: 'blis.basin.read' },
      { label: 'Dams', path: '/blis/dams', icon: Waves, permission: 'blis.basin.read' },
      { label: 'Stations', path: '/blis/stations', icon: Database, permission: 'blis.basin.read' },
    ];
  } else if (activeSection === 'core') {
    tabs = [
      { label: 'Home', path: '/core', icon: LayoutDashboard, exact: true },
      { label: 'Users', path: '/core/users', icon: Users, permission: 'core.user.read' },
      {
        label: 'Orgs',
        path: '/core/organisations',
        icon: Building,
        permission: 'core.organisation.read',
      },
      { label: 'Imports', path: '/core/imports', icon: UploadCloud, permission: 'core.import.run' },
    ];
  } else {
    tabs = [
      { label: 'Overview', path: '/', icon: LayoutDashboard, exact: true },
      { label: 'SLIS', path: '/slis', icon: Sprout, permission: [...MODULE_PERMISSIONS.slis] },
      { label: 'M&E', path: '/me', icon: TrendingUp, permission: [...MODULE_PERMISSIONS.me] },
      { label: 'BLIS', path: '/blis', icon: Waves, permission: [...MODULE_PERMISSIONS.blis] },
    ];
  }

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 py-1 shadow-lg"
    >
      <div className="flex items-center justify-around">
        {tabs.map((tab) => (
          <BottomTabLink key={tab.path} tab={tab} currentPath={currentPath} />
        ))}
        <button
          type="button"
          onClick={onOpenMore}
          aria-label="More navigation routes"
          className="flex flex-col items-center justify-center min-w-[52px] min-h-[48px] py-1 px-2 rounded-xl text-slate-600 hover:text-slate-950 font-semibold transition-all cursor-pointer"
        >
          <div className="p-1 rounded-lg text-slate-600">
            <MoreHorizontal className="h-5 w-5" />
          </div>
          <span className="text-[10px] tracking-tight mt-0.5">More</span>
        </button>
      </div>
    </nav>
  );
}
