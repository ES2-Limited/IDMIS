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
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { Sheet, SheetContent } from '@idmis/ui';
import { useCan, MODULE_PERMISSIONS } from '../auth';
import { getModuleNavConfig, useActiveNavSection, type NavItem } from './SideNav';

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
        isActive ? 'text-teal-800 font-bold' : 'text-slate-600 hover:text-slate-950 font-semibold'
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

function MoreSheetItem({
  item,
  currentPath,
  onSelect,
}: {
  item: NavItem;
  currentPath: string;
  onSelect: () => void;
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
      onClick={onSelect}
      className={`flex items-center justify-between gap-2.5 rounded-xl border px-3.5 py-3 text-xs font-semibold transition-all min-h-[48px] ${
        isActive
          ? 'border-teal-200 bg-teal-50/90 text-teal-800 font-bold'
          : 'border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon
          className={`h-4 w-4 shrink-0 ${isActive ? 'text-teal-700' : 'text-slate-400'}`}
          aria-hidden="true"
        />
        <span className="truncate">{item.label}</span>
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
    </Link>
  );
}

export function BottomNav() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const activeSection = useActiveNavSection(currentPath);
  const [moreOpen, setMoreOpen] = React.useState(false);

  let tabs: BottomTab[];

  if (activeSection === 'me') {
    tabs = [
      { label: 'Home', path: '/me', icon: LayoutDashboard, exact: true },
      {
        label: 'Indicators',
        path: '/me/indicators',
        icon: Target,
        permission: 'me.indicator.read',
      },
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

  const { moduleName, navItems } = getModuleNavConfig(activeSection);
  const primaryPaths = new Set(tabs.map((t) => t.path));
  const remainingItems = navItems.filter((item) => !primaryPaths.has(item.path));
  const isMoreRouteActive = remainingItems.some(
    (item) => currentPath === item.path || currentPath.startsWith(`${item.path}/`),
  );

  return (
    <>
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 py-1 shadow-lg"
      >
        <div className="flex items-center justify-around">
          {tabs.map((tab) => (
            <BottomTabLink key={tab.path} tab={tab} currentPath={currentPath} />
          ))}
          {remainingItems.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="More navigation routes"
              className={`flex flex-col items-center justify-center min-w-[52px] min-h-[48px] py-1 px-2 rounded-xl transition-all cursor-pointer ${
                moreOpen || isMoreRouteActive
                  ? 'text-teal-800 font-bold'
                  : 'text-slate-600 hover:text-slate-950 font-semibold'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-all ${
                  moreOpen || isMoreRouteActive
                    ? 'bg-teal-50 text-teal-800 scale-105'
                    : 'text-slate-600'
                }`}
              >
                <MoreHorizontal className="h-5 w-5" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">More</span>
            </button>
          )}
        </div>
      </nav>

      {/* Bottom Slider Dialog for Remaining Module Routes */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="md:hidden rounded-t-2xl px-4 pt-3 pb-8 max-h-[75vh] overflow-y-auto"
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
          <div className="mb-4 flex items-center justify-between pr-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {moduleName}
              </p>
              <h3 className="text-sm font-extrabold text-slate-900">More Routes</h3>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {remainingItems.map((item) => (
              <MoreSheetItem
                key={item.path}
                item={item}
                currentPath={currentPath}
                onSelect={() => setMoreOpen(false)}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
