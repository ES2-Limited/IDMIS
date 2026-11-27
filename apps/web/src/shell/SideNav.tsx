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
  Compass,
  type LucideIcon,
} from 'lucide-react';
import { useCan, MODULE_PERMISSIONS } from '../auth';

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  permission?: string | string[];
}

function NavEntry({
  item,
  currentPath,
  onNavigate,
}: {
  item: NavItem;
  currentPath: string;
  onNavigate?: () => void;
}) {
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
      onClick={onNavigate}
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

export type ActiveNavSection = 'core' | 'slis' | 'me' | 'blis' | 'field' | 'home';

export function useActiveNavSection(currentPath: string): ActiveNavSection {
  const canCoreModule = useCan([...MODULE_PERMISSIONS.core]);
  const canSlisModule = useCan([...MODULE_PERMISSIONS.slis]);
  const canMeModule = useCan([...MODULE_PERMISSIONS.me]);
  const canBlisModule = useCan([...MODULE_PERMISSIONS.blis]);
  const canFieldModule = useCan([...MODULE_PERMISSIONS.field]);

  if (currentPath.startsWith('/core') && canCoreModule) return 'core';
  if (currentPath.startsWith('/slis') && canSlisModule) return 'slis';
  if (currentPath.startsWith('/me') && canMeModule) return 'me';
  if (currentPath.startsWith('/blis') && canBlisModule) return 'blis';
  if (currentPath.startsWith('/field') && canFieldModule) return 'field';
  if (
    (currentPath.startsWith('/slis/reports') || currentPath.startsWith('/field/capture/survey')) &&
    canMeModule
  ) {
    return 'me';
  }
  if (currentPath.startsWith('/field/capture/dam-inspection') && canBlisModule) {
    return 'blis';
  }
  if (currentPath.startsWith('/core/imports') && canSlisModule) return 'slis';
  if (currentPath.startsWith('/core/imports') && canBlisModule) return 'blis';
  return 'home';
}

export function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const activeSection = useActiveNavSection(currentPath);

  let moduleName: string;
  let navItems: NavItem[];

  if (activeSection === 'core') {
    moduleName = 'Core Administration';
    navItems = [
      {
        label: 'Overview',
        path: '/core',
        icon: LayoutDashboard,
        permission: [...MODULE_PERMISSIONS.core],
      },
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
        permission: 'core.import.run',
      },
      { label: 'Audit Logs', path: '/core/audit', icon: FileText, permission: 'core.audit.read' },
    ];
  } else if (activeSection === 'slis') {
    moduleName = 'SLIS Module';
    navItems = [
      {
        label: 'Dashboard',
        path: '/slis',
        icon: LayoutDashboard,
        permission: [...MODULE_PERMISSIONS.slis],
      },
      {
        label: 'Farmers & Households',
        path: '/slis/farmers',
        icon: Users,
        permission: [...MODULE_PERMISSIONS.slis],
      },
      {
        label: 'Plots & Command Areas',
        path: '/slis/plots',
        icon: MapPin,
        permission: [...MODULE_PERMISSIONS.slis],
      },
      {
        label: 'Water Requests',
        path: '/slis/water',
        icon: Waves,
        permission: 'slis.water_request.read',
      },
      {
        label: 'Review & Conflicts',
        path: '/slis/review',
        icon: ShieldAlert,
        permission: 'slis.review.submit',
      },
      {
        label: 'Operational Reports',
        path: '/slis/reports',
        icon: FileText,
        permission: 'slis.report.view',
      },
      {
        label: 'Data Imports',
        path: '/core/imports',
        icon: UploadCloud,
        permission: ['slis.import.run', 'core.import.run'],
      },
    ];
  } else if (activeSection === 'me') {
    moduleName = 'M&E Module';
    navItems = [
      { label: 'Overview', path: '/me', icon: LayoutDashboard },
      {
        label: 'Results Framework',
        path: '/me/indicators',
        icon: Target,
        permission: 'me.indicator.read',
      },
      {
        label: 'Quarterly Entry',
        path: '/me/entry',
        icon: FileText,
        permission: ['me.value.submit', 'me.value.approve'],
      },
      {
        label: 'Indicator Matrix',
        path: '/me/matrix',
        icon: TrendingUp,
        permission: 'me.indicator.read',
      },
      { label: 'Surveys', path: '/me/surveys', icon: Database, permission: 'me.survey.manage' },
      {
        label: 'Field Survey Capture',
        path: '/field/capture/survey',
        icon: MapPin,
        permission: 'me.survey.respond',
      },
      {
        label: 'Scorecards',
        path: '/me/scorecards',
        icon: Award,
        permission: 'me.indicator.read',
      },
      {
        label: 'Matching Grants',
        path: '/me/grants',
        icon: Banknote,
        permission: 'me.indicator.read',
      },
      {
        label: 'Tech Adoption',
        path: '/me/adoption',
        icon: Sprout,
        permission: ['me.adoption.record', 'me.indicator.read'],
      },
      {
        label: 'SLIS Reports',
        path: '/slis/reports',
        icon: FileText,
        permission: 'slis.report.view',
      },
    ];
  } else if (activeSection === 'blis') {
    moduleName = 'BLIS Module';
    navItems = [
      {
        label: 'Map Workspace',
        path: '/blis',
        icon: MapPin,
        permission: ['blis.map.read', 'blis.basin.read'],
      },
      {
        label: 'Basins & Hydrology',
        path: '/blis/basins',
        icon: Compass,
        permission: 'blis.basin.read',
      },
      {
        label: 'Dams & Reservoirs',
        path: '/blis/dams',
        icon: Waves,
        permission: 'blis.basin.read',
      },
      {
        label: 'Hydromet Stations',
        path: '/blis/stations',
        icon: Database,
        permission: 'blis.basin.read',
      },
      {
        label: 'Dam Inspections',
        path: '/blis/inspections',
        icon: ShieldAlert,
        permission: ['blis.inspection.record', 'blis.inspection.approve'],
      },
      {
        label: 'Field Dam Inspection',
        path: '/field/capture/dam-inspection',
        icon: MapPin,
        permission: 'blis.inspection.record',
      },
      {
        label: 'Data Imports',
        path: '/core/imports',
        icon: UploadCloud,
        permission: 'core.import.run',
      },
    ];
  } else if (activeSection === 'field') {
    moduleName = 'Field Collector Hub';
    navItems = [
      { label: 'Field Station Home', path: '/field', icon: LayoutDashboard },
      { label: 'Fast Data Capture', path: '/field/capture', icon: MapPin },
      {
        label: 'Register Farmer (Wizard)',
        path: '/field/capture/farmer',
        icon: Users,
        permission: 'slis.farmer.create',
      },
      {
        label: 'Map Plot Boundary (Walk)',
        path: '/field/capture/plot',
        icon: MapPin,
        permission: 'slis.plot.manage',
      },
      {
        label: 'Water Request',
        path: '/field/capture/water',
        icon: Waves,
        permission: 'slis.water_request.create',
      },
      {
        label: 'Fee Collection',
        path: '/field/capture/fee',
        icon: Banknote,
        permission: 'slis.fee.record',
      },
      {
        label: 'Training Attendance',
        path: '/field/capture/training',
        icon: Users,
        permission: 'slis.training.manage',
      },
      {
        label: 'Crop Production',
        path: '/field/capture/crop',
        icon: Sprout,
        permission: 'slis.crop.manage',
      },
      {
        label: 'Survey Capture',
        path: '/field/capture/survey',
        icon: Database,
        permission: 'me.survey.respond',
      },
      {
        label: 'Dam Inspection',
        path: '/field/capture/dam-inspection',
        icon: ShieldAlert,
        permission: 'blis.inspection.record',
      },
      { label: 'My Cached Records', path: '/field/records', icon: FileText },
      { label: 'Sync Centre', path: '/field/sync', icon: Database },
      { label: 'Collector Profile (Me)', path: '/field/profile', icon: Users },
    ];
  } else {
    moduleName = 'SPIN IDMIS';
    navItems = [
      { label: 'Workspace Home', path: '/', icon: LayoutDashboard },
      {
        label: 'Core Admin',
        path: '/core',
        icon: Building,
        permission: ['core.user.read', 'core.audit.read', 'core.import.run'],
      },
      {
        label: 'SLIS (Land & Schemes)',
        path: '/slis',
        icon: MapPin,
        permission: [
          'slis.farmer.create',
          'slis.farmer.update',
          'slis.plot.manage',
          'slis.water_request.read',
          'slis.review.submit',
        ],
      },
      {
        label: 'M&E (Indicators)',
        path: '/me',
        icon: TrendingUp,
        permission: ['me.indicator.read', 'me.survey.manage', 'me.value.submit'],
      },
      {
        label: 'BLIS (Basin Land Info)',
        path: '/blis',
        icon: Waves,
        permission: [
          'blis.basin.read',
          'blis.dam.manage',
          'blis.station.manage',
          'blis.inspection.record',
        ],
      },
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
          <NavEntry key={item.path} item={item} currentPath={currentPath} onNavigate={onNavigate} />
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
