import * as React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  Users,
  Building,
  UploadCloud,
  FileText,
  MapPin,
  TrendingUp,
  Waves,
  LayoutDashboard,
  ShieldAlert,
  Database,
  type LucideIcon,
} from 'lucide-react';
import { useCan } from '../auth';

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  permission?: string;
}

function NavEntry({ item, currentPath }: { item: NavItem; currentPath: string }) {
  const allowed = useCan(item.permission);
  if (!allowed) return null;

  const isActive =
    item.path === '/'
      ? currentPath === '/'
      : currentPath === item.path ||
        (item.path !== '/core' &&
          item.path !== '/slis' &&
          item.path !== '/me' &&
          item.path !== '/blis' &&
          currentPath.startsWith(item.path));

  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-colors min-h-[40px] ${
        isActive
          ? 'bg-primary-50 text-primary-700 font-semibold'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary-700' : 'text-slate-400'}`}
        aria-hidden="true"
      />
      <span>{item.label}</span>
    </Link>
  );
}

export function SideNav() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Determine active module from pathname
  let moduleName: string;
  let navItems: NavItem[];

  if (currentPath.startsWith('/core')) {
    moduleName = 'Core Administration';
    navItems = [
      { label: 'Overview', path: '/core', icon: LayoutDashboard },
      { label: 'Users & Roles', path: '/core/users', icon: Users, permission: 'core.user.read' },
      {
        label: 'Organisations & WUAs',
        path: '/core/organisations',
        icon: Building,
        permission: 'core.organisation.read',
      },
      {
        label: 'Data Imports',
        path: '/core/imports',
        icon: UploadCloud,
        permission: 'core.import.read',
      },
      { label: 'Audit Logs', path: '/core/audit', icon: FileText, permission: 'core.audit.read' },
    ];
  } else if (currentPath.startsWith('/slis')) {
    moduleName = 'SLIS Module';
    navItems = [
      { label: 'Dashboard', path: '/slis', icon: LayoutDashboard },
      {
        label: 'Farmers & Households',
        path: '/slis/farmers',
        icon: Users,
        permission: 'slis.farmer.read',
      },
      {
        label: 'Plots & Command Areas',
        path: '/slis/plots',
        icon: MapPin,
        permission: 'slis.farm.read',
      },
      { label: 'Water Requests', path: '/slis/water', icon: Waves, permission: 'slis.water.read' },
      {
        label: 'Review & Conflicts',
        path: '/slis/review',
        icon: ShieldAlert,
        permission: 'slis.import.read',
      },
    ];
  } else if (currentPath.startsWith('/me')) {
    moduleName = 'M&E Module';
    navItems = [
      { label: 'Results Framework', path: '/me', icon: LayoutDashboard },
      {
        label: 'Indicator Matrix',
        path: '/me/matrix',
        icon: TrendingUp,
        permission: 'me.kpi.read',
      },
      { label: 'Quarterly Entry', path: '/me/entry', icon: FileText, permission: 'me.kpi.read' },
      { label: 'Surveys', path: '/me/surveys', icon: Database, permission: 'me.survey.read' },
    ];
  } else if (currentPath.startsWith('/blis')) {
    moduleName = 'BLIS Module';
    navItems = [
      { label: 'Map Workspace', path: '/blis', icon: MapPin },
      {
        label: 'Basins & Dams',
        path: '/blis/dams',
        icon: Waves,
        permission: 'blis.irrigation.read',
      },
      {
        label: 'Hydromet Stations',
        path: '/blis/stations',
        icon: Database,
        permission: 'blis.irrigation.read',
      },
      {
        label: 'Dam Inspections',
        path: '/blis/inspections',
        icon: ShieldAlert,
        permission: 'blis.irrigation.read',
      },
    ];
  } else {
    moduleName = 'TRIMING IDMIS';
    navItems = [
      { label: 'Workspace Home', path: '/', icon: LayoutDashboard },
      { label: 'Core Admin', path: '/core', icon: Building },
      { label: 'SLIS (Land & Schemes)', path: '/slis', icon: MapPin },
      { label: 'M&E (Indicators)', path: '/me', icon: TrendingUp },
      { label: 'BLIS (Basin Land Info)', path: '/blis', icon: Waves },
    ];
  }

  return (
    <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 min-h-[calc(100vh-4rem)]">
      <div className="p-4 border-b border-slate-100">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {moduleName}
        </h2>
      </div>

      <nav aria-label="Module sub navigation" className="p-3 space-y-1 flex-1">
        {navItems.map((item) => (
          <NavEntry key={item.path} item={item} currentPath={currentPath} />
        ))}
      </nav>
    </aside>
  );
}
