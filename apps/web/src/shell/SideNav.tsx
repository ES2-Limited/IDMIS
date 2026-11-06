import * as React from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  Users,
  Building,
  UploadCloud,
  FileText,
  MapPin,
  TrendingUp,
  Target,
  Waves,
  LayoutDashboard,
  ShieldAlert,
  Database,
  Award,
  Banknote,
  Sprout,
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
    item.path === '/' || item.path === '/field'
      ? currentPath === item.path
      : currentPath === item.path ||
        (item.path !== '/core' &&
          item.path !== '/slis' &&
          item.path !== '/me' &&
          item.path !== '/blis' &&
          item.path !== '/field' &&
          currentPath.startsWith(item.path));

  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all min-h-[40px] ${
        isActive
          ? 'bg-teal-50 text-teal-800 shadow-2xs font-bold'
          : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
      }`}
    >
      <Icon
        className={`h-4.5 w-4.5 shrink-0 ${isActive ? 'text-teal-700' : 'text-slate-400'}`}
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
      { label: 'Overview', path: '/me', icon: LayoutDashboard },
      {
        label: 'Results Framework',
        path: '/me/indicators',
        icon: Target,
        permission: 'me.kpi.read',
      },
      { label: 'Quarterly Entry', path: '/me/entry', icon: FileText, permission: 'me.kpi.read' },
      {
        label: 'Indicator Matrix',
        path: '/me/matrix',
        icon: TrendingUp,
        permission: 'me.kpi.read',
      },
      { label: 'Surveys', path: '/me/surveys', icon: Database, permission: 'me.survey.read' },
      { label: 'Scorecards', path: '/me/scorecards', icon: Award, permission: 'me.kpi.read' },
      { label: 'Matching Grants', path: '/me/grants', icon: Banknote, permission: 'me.kpi.read' },
      { label: 'Tech Adoption', path: '/me/adoption', icon: Sprout, permission: 'me.kpi.read' },
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
  } else if (currentPath.startsWith('/field')) {
    moduleName = 'Field Collector Hub';
    navItems = [
      { label: 'Field Station Home', path: '/field', icon: LayoutDashboard },
      { label: 'Fast Data Capture', path: '/field/capture', icon: MapPin },
      { label: 'Register Farmer (Wizard)', path: '/field/capture/farmer', icon: Users },
      { label: 'Map Plot Boundary (Walk)', path: '/field/capture/plot', icon: MapPin },
      { label: 'My Cached Records', path: '/field/records', icon: FileText },
      { label: 'Sync Centre', path: '/field/sync', icon: Database },
      { label: 'Collector Profile (Me)', path: '/field/profile', icon: Users },
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
    <aside className="w-64 border-r border-slate-200/80 bg-white/70 backdrop-blur-md flex flex-col shrink-0 h-full">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {moduleName}
        </h2>
        <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
      </div>

      <nav aria-label="Module sub navigation" className="p-3 space-y-1.5 flex-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavEntry key={item.path} item={item} currentPath={currentPath} />
        ))}
      </nav>

      {/* Footer / Quick Info */}
      <div className="p-4 border-t border-slate-100 text-[11px] text-slate-400 shrink-0">
        <p className="font-semibold text-slate-600">IDMIS v2.0</p>
        <p className="text-[10px]">National Irrigation Registry</p>
      </div>
    </aside>
  );
}
