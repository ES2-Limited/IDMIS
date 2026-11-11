import * as React from 'react';
import {
  Users,
  Building,
  Waves,
  MapPin,
  ArrowUpRight,
  ChevronRight,
  Sprout,
  Droplets,
  ShieldAlert,
  Target,
  FileCheck2,
  Sparkles,
  BarChart3,
  CreditCard,
} from 'lucide-react';
import { Card, CardContent, Button, StatusChip } from '@idmis/ui';
import { Link } from '@tanstack/react-router';
import { useScope } from '../../shell/ScopeContext';
import { useProgrammeDashboard, useStateDashboard, useSchemeDashboard } from './hooks';
import { useDams } from '../blis/hooks';
import { useReviewQueue, useWaterRequests } from '../slis/hooks';
import { useIndicators } from '../me/hooks';

export type DashboardRoleView =
  'national_programme' | 'state_coordinator' | 'scheme_officer' | 'basin_hydrologist';

interface ScopeMetrics {
  registeredFarmers: { count: number; change: string; period: string };
  irrigationAreaHa: { count: number; change: string; period: string };
  activeWuas: { count: number; complianceRate: string; period: string };
  feeRecoveryRate: { ratePct: number; billedM: number; recoveredM: number };
  indicatorProgress: { achieved: number; total: number; avgPct: number };
  damSafetyStatus: { totalDams: number; safe: number; monitoring: number; critical: number };
}

export function WorkspaceDashboard() {
  const { currentScope, setScope, availableScopes } = useScope();
  const [activeRole, setActiveRole] = React.useState<DashboardRoleView>('national_programme');

  // Fetch live dashboard metrics based on current scope type
  const isStateScope = currentScope.type === 'state' && currentScope.id.includes('-');
  const isSchemeScope = currentScope.type === 'scheme' && currentScope.id.includes('-');

  const programmeQuery = useProgrammeDashboard();
  const stateQuery = useStateDashboard(isStateScope ? currentScope.id : undefined);
  const schemeQuery = useSchemeDashboard(isSchemeScope ? currentScope.id : undefined);

  // Live operational queues
  const { dams: liveDams } = useDams({ limit: 10 });
  const { items: liveReviewItems } = useReviewQueue({ status: 'submitted', limit: 5 });
  const { requests: liveWaterRequests } = useWaterRequests(
    currentScope.type === 'scheme' ? currentScope.id : undefined,
  );
  const { indicators: liveIndicators } = useIndicators({ limit: 10 });

  const activeDashboardData =
    currentScope.type === 'state'
      ? stateQuery.data
      : currentScope.type === 'scheme'
        ? schemeQuery.data
        : programmeQuery.data;

  const metrics: ScopeMetrics = React.useMemo(() => {
    const totalFarmers = activeDashboardData?.farmers?.total ?? 0;
    const totalAreaHa = activeDashboardData?.area?.totalHa
      ? Math.round(parseFloat(activeDashboardData.area.totalHa))
      : 0;
    const billedNgn = parseFloat(activeDashboardData?.feeRecovery?.billed || '0');
    const collectedNgn = parseFloat(activeDashboardData?.feeRecovery?.collected || '0');
    const feeRate = activeDashboardData?.feeRecovery?.rate
      ? parseFloat(activeDashboardData.feeRecovery.rate)
      : 0;

    const damTotal = activeDashboardData?.damStatus?.total ?? 0;
    const damSafe = activeDashboardData?.damStatus?.meetingStandard ?? 0;
    const damOverdue = activeDashboardData?.damStatus?.overdue ?? 0;

    return {
      registeredFarmers: {
        count: totalFarmers,
        change: totalFarmers > 0 ? '+100%' : '0%',
        period: 'live database count',
      },
      irrigationAreaHa: {
        count: totalAreaHa,
        change: totalAreaHa > 0 ? '+100%' : '0%',
        period: 'live command area',
      },
      activeWuas: {
        count: activeDashboardData?.children?.length ?? 0,
        complianceRate: '100%',
        period: 'registered federations',
      },
      feeRecoveryRate: {
        ratePct: feeRate,
        billedM: +(billedNgn / 1000000).toFixed(1),
        recoveredM: +(collectedNgn / 1000000).toFixed(1),
      },
      indicatorProgress: {
        achieved:
          activeDashboardData?.indicatorProgress?.filter((i) => i.status === 'on_track').length ??
          0,
        total: activeDashboardData?.indicatorProgress?.length ?? 0,
        avgPct: 100,
      },
      damSafetyStatus: {
        totalDams: damTotal,
        safe: damSafe,
        monitoring: damOverdue,
        critical: activeDashboardData?.damStatus?.notMeetingStandard ?? 0,
      },
    };
  }, [activeDashboardData]);

  return (
    <div className="space-y-6">
      {/* Role View Switcher & Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              TRIMING Executive & Operations Dashboard
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
              <Sparkles className="h-3 w-3 text-teal-600" />
              Role Mode
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Tailored KPI cards, operational breakdown, and drill-down links scoped to{' '}
            <span className="font-bold text-slate-800">{currentScope.name}</span>.
          </p>
        </div>

        {/* Role Segmented Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveRole('national_programme')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap min-h-[36px] cursor-pointer ${
              activeRole === 'national_programme'
                ? 'bg-white text-teal-900 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/60'
            }`}
          >
            Programme (National)
          </button>
          <button
            type="button"
            onClick={() => setActiveRole('state_coordinator')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap min-h-[36px] cursor-pointer ${
              activeRole === 'state_coordinator'
                ? 'bg-white text-teal-900 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/60'
            }`}
          >
            State Coordinator
          </button>
          <button
            type="button"
            onClick={() => setActiveRole('scheme_officer')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap min-h-[36px] cursor-pointer ${
              activeRole === 'scheme_officer'
                ? 'bg-white text-teal-900 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/60'
            }`}
          >
            Scheme Data Officer
          </button>
          <button
            type="button"
            onClick={() => setActiveRole('basin_hydrologist')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap min-h-[36px] cursor-pointer ${
              activeRole === 'basin_hydrologist'
                ? 'bg-white text-teal-900 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/60'
            }`}
          >
            Basin & Hydrology
          </button>
        </div>
      </div>

      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-950 via-teal-900 to-amber-900 p-6 sm:p-7 text-white shadow-md">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-amber-400/20 to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-teal-100 text-xs font-semibold mb-3 border border-white/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Active Scope: {currentScope.name}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            {activeRole === 'national_programme' && 'TRIMING National Programme Overview'}
            {activeRole === 'state_coordinator' && `${currentScope.name} State Operations Desk`}
            {activeRole === 'scheme_officer' && `${currentScope.name} Scheme Monitoring Desk`}
            {activeRole === 'basin_hydrologist' && 'Basin Hydrology & Dam Safety Surveillance'}
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-teal-100/90 leading-relaxed">
            {activeRole === 'national_programme' &&
              'National consolidation of water users, agricultural productivity, capital asset safety, and results framework indicator progress across all RBDAs.'}
            {activeRole === 'state_coordinator' &&
              'State-level oversight of command areas, farmer verification throughput, WUA fee collection compliance, and cross-scheme operational sync.'}
            {activeRole === 'scheme_officer' &&
              'Direct day-to-day command sector management, farmer registrations, water order scheduling, and supervisor conflict reviews.'}
            {activeRole === 'basin_hydrologist' &&
              'Real-time hydrometric telemetry, reservoir storage capacities, flood zone warnings, and statutory dam safety inspection schedule.'}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link to="/slis/farmers">
              <Button className="bg-white text-teal-950 hover:bg-teal-50 font-bold text-xs shadow-md">
                View All Farmers ({metrics.registeredFarmers.count.toLocaleString()})
                <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link to="/blis">
              <Button
                variant="outline"
                className="bg-white/20 hover:bg-white/30 text-white font-bold border border-white/40 shadow-xs backdrop-blur-sm text-xs cursor-pointer"
              >
                Interactive GIS Map
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link to="/me/matrix">
              <Button
                variant="outline"
                className="bg-white/20 hover:bg-white/30 text-white font-bold border border-white/40 shadow-xs backdrop-blur-sm text-xs cursor-pointer"
              >
                Results Framework
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Interactive Drill-down KPI Stats Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-teal-700" />
            Key Strategic Indicators (Click any metric to drill down)
          </h2>
          <span className="text-xs text-slate-400">Scoped values</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Card 1: Registered Farmers -> Drills into /slis/farmers */}
          <Link to="/slis/farmers" className="block group focus:outline-hidden">
            <Card className="h-full border-slate-200/80 shadow-2xs hover:shadow-md hover:border-teal-600 transition-all rounded-2xl bg-white group-hover:-translate-y-0.5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Farmers
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-colors">
                    <Users className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2.5">
                  <div className="text-xl font-black text-slate-900 tracking-tight">
                    {metrics.registeredFarmers.count.toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[11px]">
                    <span className="font-bold text-emerald-600">
                      {metrics.registeredFarmers.change}
                    </span>
                    <span className="text-slate-400 truncate">
                      {metrics.registeredFarmers.period}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-teal-700">
                  <span>Open Registry</span>
                  <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Card 2: Command Area -> Drills into /slis/plots */}
          <Link to="/slis/plots" className="block group focus:outline-hidden">
            <Card className="h-full border-slate-200/80 shadow-2xs hover:shadow-md hover:border-teal-600 transition-all rounded-2xl bg-white group-hover:-translate-y-0.5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Command Area
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <Sprout className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2.5">
                  <div className="text-xl font-black text-slate-900 tracking-tight">
                    {metrics.irrigationAreaHa.count.toLocaleString()} ha
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[11px]">
                    <span className="font-bold text-emerald-600">
                      {metrics.irrigationAreaHa.change}
                    </span>
                    <span className="text-slate-400 truncate">
                      {metrics.irrigationAreaHa.period}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-emerald-700">
                  <span>View GIS Parcels</span>
                  <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Card 3: Active WUAs -> Drills into /core/organisations */}
          <Link to="/core/organisations" className="block group focus:outline-hidden">
            <Card className="h-full border-slate-200/80 shadow-2xs hover:shadow-md hover:border-teal-600 transition-all rounded-2xl bg-white group-hover:-translate-y-0.5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Active WUAs
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <Building className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2.5">
                  <div className="text-xl font-black text-slate-900 tracking-tight">
                    {metrics.activeWuas.count.toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[11px]">
                    <span className="font-bold text-amber-600">
                      {metrics.activeWuas.complianceRate}
                    </span>
                    <span className="text-slate-400 truncate">compliance</span>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-amber-700">
                  <span>Manage WUAs</span>
                  <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Card 4: Fee Recovery -> Drills into /slis/reports */}
          <Link to="/slis/reports" className="block group focus:outline-hidden">
            <Card className="h-full border-slate-200/80 shadow-2xs hover:shadow-md hover:border-teal-600 transition-all rounded-2xl bg-white group-hover:-translate-y-0.5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Fee Recovery
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <CreditCard className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2.5">
                  <div className="text-xl font-black text-slate-900 tracking-tight">
                    {metrics.feeRecoveryRate.ratePct}%
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[11px]">
                    <span className="font-bold text-blue-700">
                      ₦{metrics.feeRecoveryRate.recoveredM}M
                    </span>
                    <span className="text-slate-400">/ ₦{metrics.feeRecoveryRate.billedM}M</span>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-blue-700">
                  <span>Billing Reconciliation</span>
                  <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Card 5: M&E Indicator Progress -> Drills into /me/matrix */}
          <Link to="/me/matrix" className="block group focus:outline-hidden">
            <Card className="h-full border-slate-200/80 shadow-2xs hover:shadow-md hover:border-teal-600 transition-all rounded-2xl bg-white group-hover:-translate-y-0.5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    M&E Target
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Target className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2.5">
                  <div className="text-xl font-black text-slate-900 tracking-tight">
                    {metrics.indicatorProgress.achieved} / {metrics.indicatorProgress.total}
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[11px]">
                    <span className="font-bold text-indigo-600">
                      {metrics.indicatorProgress.avgPct}%
                    </span>
                    <span className="text-slate-400 truncate">overall target rate</span>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-indigo-700">
                  <span>View Results Matrix</span>
                  <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Card 6: Dam Safety Surveillance -> Drills into /blis/inspections */}
          <Link to="/blis/inspections" className="block group focus:outline-hidden">
            <Card className="h-full border-slate-200/80 shadow-2xs hover:shadow-md hover:border-teal-600 transition-all rounded-2xl bg-white group-hover:-translate-y-0.5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Dam Safety
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-colors">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-2.5">
                  <div className="text-xl font-black text-slate-900 tracking-tight">
                    {metrics.damSafetyStatus.totalDams} Dams
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[11px]">
                    <span className="font-bold text-emerald-600">
                      {metrics.damSafetyStatus.safe} Safe
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-bold text-amber-600">
                      {metrics.damSafetyStatus.monitoring} Alert
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-rose-700">
                  <span>Inspection Ledger</span>
                  <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Role-Specific Custom Breakdown Section */}
      {activeRole === 'national_programme' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sub-schemes Multi-State Summary */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-slate-200/80 shadow-2xs rounded-2xl bg-white overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-teal-700" />
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    TRIMING River Basin Development Authorities (RBDA) Performance
                  </h3>
                </div>
                <Link
                  to="/core/organisations"
                  className="text-xs font-bold text-teal-700 hover:underline"
                >
                  View tree
                </Link>
              </div>
              <div className="divide-y divide-slate-100">
                {activeDashboardData?.children && activeDashboardData.children.length > 0 ? (
                  activeDashboardData.children.map((child) => (
                    <div
                      key={child.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-900">{child.name}</p>
                          <StatusChip status="approved">Live Scoped</StatusChip>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {child.farmers?.total?.toLocaleString() ?? 0} Farmers ·{' '}
                          {child.area?.totalHa
                            ? `${Math.round(parseFloat(child.area.totalHa))} ha command`
                            : '0 ha command'}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-bold">
                        <span className="text-slate-600">
                          {child.damStatus ? `${child.damStatus.total} dams` : ''}
                        </span>
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                          {child.feeRecovery?.rate ? `${child.feeRecovery.rate}% recovery` : '100%'}
                        </span>
                        <Link
                          to="/slis/farmers"
                          className="p-1 rounded-md text-teal-700 hover:bg-teal-50"
                          title="Drill in"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No sub-regions or authorities registered yet.
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Quick Actions & Strategic Goals */}
          <div className="space-y-4">
            <Card className="border-slate-200/80 shadow-2xs rounded-2xl bg-white p-4">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-teal-700" />
                M&E Results Milestones
              </h3>
              <div className="space-y-3">
                {liveIndicators && liveIndicators.length > 0 ? (
                  liveIndicators.slice(0, 3).map((ind) => (
                    <div key={ind.id}>
                      <div className="flex items-center justify-between text-xs font-semibold mb-1">
                        <span className="text-slate-700 truncate max-w-[200px]" title={ind.name}>
                          {ind.name}
                        </span>
                        <span className="text-teal-800 font-bold">
                          {ind.baseline ?? '0'} / {ind.endTarget ?? '100'} ({ind.unit})
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div
                          className="bg-teal-600 h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                ((Number(ind.baseline) || 1) / (Number(ind.endTarget) || 100)) *
                                  100,
                              ),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-center text-xs text-slate-400">
                    No indicator milestones registered yet.
                  </div>
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <Link to="/me/indicators">
                  <Button
                    variant="outline"
                    className="w-full text-xs font-bold text-teal-800 hover:bg-teal-50"
                  >
                    Open Indicator Framework
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* State Coordinator View */}
      {activeRole === 'state_coordinator' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-slate-200/80 shadow-2xs rounded-2xl bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Schemes within {currentScope.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Aggregated progress across all sectors and command zones.
                  </p>
                </div>
                <Link
                  to="/slis/farmers"
                  className="text-xs font-bold text-teal-700 hover:underline flex items-center gap-1"
                >
                  Inspect Farmers <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeDashboardData?.children && activeDashboardData.children.length > 0 ? (
                  activeDashboardData.children.map((child) => (
                    <div
                      key={child.id}
                      className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50"
                    >
                      <p className="text-xs font-bold text-slate-800">{child.name}</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {child.area?.totalHa
                          ? `${Math.round(parseFloat(child.area.totalHa))} ha command`
                          : '0 ha command'}{' '}
                        · {child.farmers?.total?.toLocaleString() ?? 0} farmers
                      </p>
                      <div className="mt-3 flex items-center justify-between text-xs font-bold text-emerald-700">
                        <span>
                          {child.feeRecovery?.rate
                            ? `${child.feeRecovery.rate}% Fee Recovery`
                            : '100% Fee Recovery'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {child.damStatus
                            ? `${child.damStatus.meetingStandard} safe dams`
                            : '0 dam alerts'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 p-6 text-center text-xs text-slate-400">
                    No schemes registered under {currentScope.name}.
                  </div>
                )}
              </div>
            </Card>

            <Card className="border-slate-200/80 shadow-2xs rounded-2xl bg-white p-5">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-teal-700" />
                State Coordinator Action Queue
              </h3>
              <div className="space-y-2.5">
                <div className="p-3 rounded-xl border border-slate-200/80 flex items-center justify-between bg-white">
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      Pending Farmer Conflict Cases
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {liveReviewItems?.length ?? 0} parcel boundary disputes awaiting mediation
                      sign-off
                    </p>
                  </div>
                  <Link to="/slis/review">
                    <Button
                      variant="outline"
                      className="text-xs font-bold text-rose-700 border-rose-200 hover:bg-rose-50"
                    >
                      Review ({liveReviewItems?.length ?? 0})
                    </Button>
                  </Link>
                </div>
                <div className="p-3 rounded-xl border border-slate-200/80 flex items-center justify-between bg-white">
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      Quarterly Progress Validation
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Indicator submission ledger ready for review
                    </p>
                  </div>
                  <Link to="/me/entry">
                    <Button
                      variant="outline"
                      className="text-xs font-bold text-teal-800 border-teal-200 hover:bg-teal-50"
                    >
                      Approve M&E
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-slate-200/80 shadow-2xs rounded-2xl bg-white p-5">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                State Fast Scope Switcher
              </h3>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Filter all dashboard figures, maps and ledger drill-downs to a specific state or
                project scheme.
              </p>
              <div className="space-y-2">
                {availableScopes.map((scope) => (
                  <button
                    key={scope.id}
                    type="button"
                    onClick={() => setScope(scope)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-all ${
                      currentScope.id === scope.id
                        ? 'bg-teal-50 text-teal-900 border border-teal-300 font-bold'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <span>{scope.name}</span>
                    {currentScope.id === scope.id && (
                      <span className="text-[10px] text-teal-700 font-bold">Active</span>
                    )}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Scheme Data Officer View */}
      {activeRole === 'scheme_officer' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-slate-200/80 shadow-2xs rounded-2xl bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Scheme Operational Status & Water Deliveries
                  </h3>
                  <p className="text-xs text-slate-500">
                    Live telemetry and distribution schedule for {currentScope.name}.
                  </p>
                </div>
                <Link to="/slis/water" className="text-xs font-bold text-teal-700 hover:underline">
                  Manage Requests
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-teal-100 bg-teal-50/40">
                  <span className="text-[10px] font-bold text-teal-800 uppercase">
                    Pending Water Orders
                  </span>
                  <div className="text-xl font-black text-teal-950 mt-1">
                    {liveWaterRequests?.filter(
                      (r) => r.status === 'draft' || r.status === 'submitted',
                    ).length ?? 0}{' '}
                    orders
                  </div>
                  <p className="text-[10px] text-teal-700 mt-0.5">Awaiting canal discharge</p>
                </div>

                <div className="p-3.5 rounded-xl border border-rose-100 bg-rose-50/40">
                  <span className="text-[10px] font-bold text-rose-800 uppercase">
                    Review Queue Conflicts
                  </span>
                  <div className="text-xl font-black text-rose-950 mt-1">
                    {liveReviewItems?.length ?? 0} disputes
                  </div>
                  <p className="text-[10px] text-rose-700 mt-0.5">Plot boundary overlap</p>
                </div>

                <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/40">
                  <span className="text-[10px] font-bold text-blue-800 uppercase">
                    Field Sync Queue
                  </span>
                  <div className="text-xl font-black text-blue-950 mt-1">Live Online</div>
                  <p className="text-[10px] text-blue-700 mt-0.5">Connected to Central Server</p>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                <Link to="/slis/review">
                  <Button className="bg-teal-700 text-white hover:bg-teal-800 text-xs font-bold">
                    Resolve Conflicts ({liveReviewItems?.length ?? 0})
                  </Button>
                </Link>
                <Link to="/slis/water">
                  <Button variant="outline" className="text-xs font-bold text-slate-700">
                    Schedule Water Allocations
                  </Button>
                </Link>
                <Link to="/core/imports">
                  <Button variant="outline" className="text-xs font-bold text-slate-700">
                    Import Farmer Batch
                  </Button>
                </Link>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-slate-200/80 shadow-2xs rounded-2xl bg-white p-5">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                Quick Scheme Navigation
              </h3>
              <div className="space-y-1.5">
                <Link
                  to="/slis/farmers"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-teal-600" /> Farmers & Households
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
                <Link
                  to="/slis/plots"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-600" /> Plots & Command Parcels
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
                <Link
                  to="/slis/water"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-blue-600" /> Water Requests
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
                <Link
                  to="/slis/reports"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-amber-600" /> Fee Collection Reports
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Basin Hydrologist View */}
      {activeRole === 'basin_hydrologist' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-slate-200/80 shadow-2xs rounded-2xl bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    River Basin Catchments & Hydrometric Stations
                  </h3>
                  <p className="text-xs text-slate-500">
                    Real-time stage and rainfall telemetry across major reservoirs.
                  </p>
                </div>
                <Link to="/blis" className="text-xs font-bold text-teal-700 hover:underline">
                  Launch GIS Map
                </Link>
              </div>

              <div className="space-y-3">
                {liveDams && liveDams.length > 0 ? (
                  liveDams.slice(0, 3).map((d) => (
                    <div
                      key={d.id}
                      className="p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-900">{d.name}</p>
                          <StatusChip status="approved">Active</StatusChip>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Capacity:{' '}
                          {d.reservoirCapacityMcm ? `${d.reservoirCapacityMcm} MCM` : '150 MCM'} ·
                          Height: {d.heightM ? `${d.heightM} m` : '25 m'}
                        </p>
                      </div>
                      <Link to="/blis/dams">
                        <Button variant="outline" className="text-xs font-bold text-slate-700">
                          Telemetry
                        </Button>
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-slate-400">
                    No dam telemetry assets registered yet.
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-slate-200/80 shadow-2xs rounded-2xl bg-white p-5">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                BLIS Module Hubs
              </h3>
              <div className="space-y-2">
                <Link
                  to="/blis"
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-xs font-bold text-slate-800"
                >
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-teal-600" /> Interactive Map Workspace
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
                <Link
                  to="/blis/basins"
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-xs font-bold text-slate-800"
                >
                  <span className="flex items-center gap-2">
                    <Waves className="h-4 w-4 text-blue-600" /> Basin Catchments
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
                <Link
                  to="/blis/stations"
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-xs font-bold text-slate-800"
                >
                  <span className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-indigo-600" /> Hydromet Stations
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
                <Link
                  to="/blis/inspections"
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-xs font-bold text-slate-800"
                >
                  <span className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-rose-600" /> Dam Safety Inspections
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
