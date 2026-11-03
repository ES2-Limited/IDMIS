import {
  Users,
  Building,
  TrendingUp,
  Waves,
  ArrowUpRight,
  Layers,
  ChevronRight,
  Sprout,
  Activity,
  Droplets,
} from 'lucide-react';
import { Card, CardContent, Button, StatusChip } from '@idmis/ui';
import { Link } from '@tanstack/react-router';
import { useScope } from '../../shell/ScopeContext';

export function WorkspaceDashboard() {
  const { currentScope } = useScope();

  // Metric KPIs inspired by the dashboard analytics view
  const metrics = [
    {
      label: 'Registered Farmers',
      value: '28,490',
      change: '+12.4%',
      period: 'vs last quarter',
      trend: 'up',
      icon: Users,
      color: 'teal',
    },
    {
      label: 'Command Area (Hectares)',
      value: '46,120 ha',
      change: '+4.2%',
      period: 'cultivated',
      trend: 'up',
      icon: Sprout,
      color: 'emerald',
    },
    {
      label: 'Active WUAs',
      value: '382',
      change: '98.5%',
      period: 'fee compliance',
      trend: 'up',
      icon: Building,
      color: 'amber',
    },
    {
      label: 'Water Allocations',
      value: '91.8%',
      change: '-1.5%',
      period: 'efficiency index',
      trend: 'down',
      icon: Droplets,
      color: 'blue',
    },
  ];

  // Recent operational activity
  const recentActivities = [
    {
      id: 'act-1',
      title: 'Batch Farmer Ingestion completed',
      scheme: 'Kano River (KRIS) Sector 4',
      time: '12 mins ago',
      status: 'approved' as const,
      statusLabel: 'Applied',
    },
    {
      id: 'act-2',
      title: 'Plot Boundary Overlap Conflict',
      scheme: 'Bakolori (BIS) Sector 12',
      time: '45 mins ago',
      status: 'conflict' as const,
      statusLabel: 'Needs Review',
    },
    {
      id: 'act-3',
      title: 'Dry Season Water Request submitted',
      scheme: 'Hadejia Valley (HVIP)',
      time: '2 hours ago',
      status: 'awaiting_review' as const,
      statusLabel: 'Pending WUA',
    },
    {
      id: 'act-4',
      title: 'Quarterly Indicator Report finalized',
      scheme: 'National Project M&E',
      time: 'Yesterday',
      status: 'approved' as const,
      statusLabel: 'Signed Off',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero Welcome Banner with Gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-900 via-teal-800 to-amber-700 p-6 sm:p-8 text-white shadow-lg">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-amber-400/20 to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-teal-100 text-xs font-semibold mb-3 border border-white/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Active Scope: {currentScope.name}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Irrigation Management & Schemes Registry
          </h1>
          <p className="mt-2 text-sm text-teal-100/90 leading-relaxed">
            Welcome to TRIMING IDMIS 2.0. Monitor scheme operations, manage farmer land rights,
            track water delivery requests, and resolve field conflicts.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/slis">
              <Button className="bg-white text-teal-900 hover:bg-teal-50 font-semibold shadow-md">
                Launch SLIS Registry
                <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/me">
              <Button variant="outline" className="text-white border-white/40 hover:bg-white/10">
                View Results Framework
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <Card
              key={m.label}
              className="border-slate-200/80 shadow-xs hover:shadow-md transition-all rounded-2xl bg-white"
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {m.label}
                  </span>
                  <div className="h-9 w-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-black text-slate-900 tracking-tight">{m.value}</div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs">
                    <span
                      className={`font-bold flex items-center ${
                        m.trend === 'up' ? 'text-emerald-600' : 'text-slate-500'
                      }`}
                    >
                      {m.change}
                    </span>
                    <span className="text-slate-400">{m.period}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Two Column Layout: Operational Modules + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core Modules (2 Columns on large) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="h-4.5 w-4.5 text-teal-700" />
              Operational Modules
            </h2>
            <span className="text-xs text-slate-500">TRIMING Monolith</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* SLIS Card */}
            <Card className="group hover:border-teal-600 border-slate-200 shadow-xs transition-all rounded-2xl overflow-hidden bg-white">
              <div className="h-2 bg-teal-600" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
                    <Sprout className="h-5 w-5" />
                  </div>
                  <StatusChip status="approved">Active</StatusChip>
                </div>
                <h3 className="mt-3 text-base font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                  SLIS (Land Information)
                </h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Farmer registries, GIS parcel boundaries, water allocation orders, and supervisor
                  conflict queue.
                </p>
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">28,490 Records</span>
                  <Link
                    to="/slis"
                    className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                  >
                    Open SLIS <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* M&E Card */}
            <Card className="group hover:border-teal-600 border-slate-200 shadow-xs transition-all rounded-2xl overflow-hidden bg-white">
              <div className="h-2 bg-amber-500" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <StatusChip status="approved">Active</StatusChip>
                </div>
                <h3 className="mt-3 text-base font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                  M&E (Indicators)
                </h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Project results framework, quarterly indicator telemetry, and field survey
                  questionnaires.
                </p>
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">18 KPIs tracked</span>
                  <Link
                    to="/me"
                    className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                  >
                    Open M&E <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* BLIS Card */}
            <Card className="group hover:border-teal-600 border-slate-200 shadow-xs transition-all rounded-2xl overflow-hidden bg-white">
              <div className="h-2 bg-blue-600" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                    <Waves className="h-5 w-5" />
                  </div>
                  <StatusChip status="approved">Active</StatusChip>
                </div>
                <h3 className="mt-3 text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  BLIS (Basin Land Info)
                </h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  River basin maps, dam safety inspections, hydrometric telemetry stations, and
                  reservoir monitoring.
                </p>
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">4 River Basins</span>
                  <Link
                    to="/blis"
                    className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                  >
                    Open BLIS <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Core Admin Card */}
            <Card className="group hover:border-teal-600 border-slate-200 shadow-xs transition-all rounded-2xl overflow-hidden bg-white">
              <div className="h-2 bg-slate-700" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold">
                    <Building className="h-5 w-5" />
                  </div>
                  <StatusChip status="approved">Active</StatusChip>
                </div>
                <h3 className="mt-3 text-base font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                  Core Administration
                </h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  User authentication, RBAC roles, WUA governance bodies, batch Excel imports, and
                  audit trails.
                </p>
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Security & Scopes</span>
                  <Link
                    to="/core"
                    className="text-xs font-bold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                  >
                    Open Core <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Activity & Operational Status Feed */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-4.5 w-4.5 text-teal-700" />
              Recent Sync Activity
            </h2>
            <span className="text-xs text-teal-700 font-semibold cursor-pointer hover:underline">
              View all
            </span>
          </div>

          <Card className="border-slate-200/80 shadow-xs rounded-2xl bg-white divide-y divide-slate-100">
            {recentActivities.map((act) => (
              <div key={act.id} className="p-4 hover:bg-slate-50/80 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-slate-900">{act.title}</p>
                  <StatusChip status={act.status}>{act.statusLabel}</StatusChip>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{act.scheme}</p>
                <span className="text-[10px] text-slate-400 mt-1 inline-block">{act.time}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
