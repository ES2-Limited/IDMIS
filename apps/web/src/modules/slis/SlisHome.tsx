import {
  Users,
  MapPin,
  AlertTriangle,
  Sprout,
  ArrowUpRight,
  FileSearch,
  FileSpreadsheet,
} from 'lucide-react';
import { Card, StatusChip, Button } from '@idmis/ui';
import { Link } from '@tanstack/react-router';
import { useScope } from '../../shell/ScopeContext';

export function SlisHome() {
  const { currentScope } = useScope();

  const slisSections = [
    {
      title: 'Farmer Registry & Households',
      description:
        'Farmer profiles, household member rosters, national identity (NIN/BVN) verification, and tenure documents.',
      stats: '28,490 Farmers',
      statLabel: '94% Identity Verified',
      icon: Users,
      badge: 'Field Ready',
      badgeStatus: 'saved_on_device' as const,
      color: 'teal',
      features: [
        'NIN/BVN masked storage',
        'Household head link',
        'Photo capture',
        'Bulk spreadsheet import',
      ],
      linkText: 'Open Farmer Registry',
      to: '/slis/farmers',
    },
    {
      title: 'Plots & GIS Boundaries',
      description:
        'Cadastral irrigation parcels, GPS boundary walks, vertex smoothing, and crop rotation cycles.',
      stats: '46,120 Hectares',
      statLabel: '34,210 Polygons',
      icon: MapPin,
      badge: 'Spatial GIS',
      badgeStatus: 'approved' as const,
      color: 'amber',
      features: [
        'GPS track walk',
        'Self-intersection validation',
        'Canal reach link',
        'Soil & slope data',
      ],
      linkText: 'Inspect Land Parcels',
      to: '/slis/plots',
    },
    {
      title: 'Review Queue & Conflicts',
      description:
        'Supervisory approval workflow, concurrent edits resolution, and held offline conflict queues.',
      stats: '14 Held Conflicts',
      statLabel: 'Needs Supervisor',
      icon: AlertTriangle,
      badge: 'Resolution Required',
      badgeStatus: 'conflict' as const,
      color: 'rose',
      features: [
        'Version 409 handling',
        'Boundary overlap review',
        'Audit diff compare',
        'One-click resolve',
      ],
      linkText: 'Review Held Conflicts',
      to: '/slis/review',
    },
  ];

  const quickStats = [
    { label: 'Registered Farmers', value: '28,490', sub: '+310 this week' },
    { label: 'Mapped Farmland', value: '46,120 ha', sub: '92% irrigated' },
    { label: 'Unsynced Records', value: '4 Saved', sub: 'Cached on device' },
    { label: 'Approval Status', value: '98.8%', sub: 'Field verified' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-950 via-teal-900 to-emerald-950 p-6 sm:p-8 text-white shadow-lg border border-teal-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/60 text-emerald-200 border border-emerald-500/50 backdrop-blur-sm">
                <Sprout className="h-3.5 w-3.5 text-emerald-300" /> SLIS Module
              </span>
              <StatusChip status="saved_on_device">Verified</StatusChip>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Scheme Land Information System (SLIS)
            </h1>
            <p className="text-emerald-100 text-xs sm:text-sm max-w-xl leading-relaxed font-medium">
              Supervise scheme farmers, land parcels, irrigation command areas, and water
              allocations under active scheme{' '}
              <span className="font-semibold text-emerald-300">
                {currentScope.name || 'All Schemes'}
              </span>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/slis/reports">
              <Button
                variant="outline"
                className="bg-white/20 hover:bg-white/30 text-white font-bold border border-white/40 shadow-xs backdrop-blur-sm text-xs cursor-pointer"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-200" />
                Reports & Summaries
              </Button>
            </Link>
            <Link to="/slis/plots">
              <Button
                variant="outline"
                className="bg-white/20 hover:bg-white/30 text-white font-bold border border-white/40 shadow-xs backdrop-blur-sm text-xs cursor-pointer"
              >
                <FileSearch className="h-3.5 w-3.5 mr-1.5 text-teal-200" />
                GIS Map View
              </Button>
            </Link>
            <Link to="/slis/farmers">
              <Button className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md cursor-pointer flex items-center">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                View Farmer Registry
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {quickStats.map((stat, i) => (
          <div
            key={i}
            className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between"
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {stat.label}
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-base sm:text-lg font-extrabold text-slate-900">
                {stat.value}
              </span>
              <span className="text-[10px] text-teal-700 font-medium">{stat.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {slisSections.map((sec, i) => {
          const Icon = sec.icon;
          return (
            <Card
              key={i}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                      sec.color === 'teal'
                        ? 'bg-teal-50 text-teal-700 border border-teal-200/60'
                        : sec.color === 'amber'
                          ? 'bg-amber-50 text-amber-600 border border-amber-200/60'
                          : 'bg-rose-50 text-rose-600 border border-rose-200/60'
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <StatusChip status={sec.badgeStatus}>{sec.badge}</StatusChip>
                </div>

                <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                  {sec.title}
                </h3>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed min-h-[40px]">
                  {sec.description}
                </p>

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">{sec.stats}</span>
                  <span className="text-[11px] font-medium text-slate-400">{sec.statLabel}</span>
                </div>

                <div className="mt-4 space-y-1.5">
                  {sec.features.map((feat, fIdx) => (
                    <div key={fIdx} className="flex items-center gap-2 text-[11px] text-slate-600">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <Button
                  asChild
                  variant="outline"
                  className="w-full justify-between h-10 rounded-xl text-xs font-bold text-slate-700 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50/50 cursor-pointer"
                >
                  <Link to={sec.to}>
                    <span>{sec.linkText}</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
