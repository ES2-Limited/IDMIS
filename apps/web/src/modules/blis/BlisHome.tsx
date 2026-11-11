import {
  Waves,
  Activity,
  Layers,
  ArrowUpRight,
  Droplets,
  AlertOctagon,
  LineChart,
} from 'lucide-react';
import { Card, StatusChip, Button } from '@idmis/ui';
import { Link } from '@tanstack/react-router';
import { useScope } from '../../shell/ScopeContext';
import { useDams, useStations, useBasins, useDamInspections } from './hooks';

export function BlisHome() {
  const { currentScope } = useScope();

  const { basins = [] } = useBasins();
  const { dams = [] } = useDams({ limit: 100 });
  const { stations = [] } = useStations({ limit: 100 });
  const { inspections = [] } = useDamInspections({ page: 1, limit: 100 });

  const badgeStatus: 'syncing' | 'saved_on_device' =
    stations.length > 0 ? 'syncing' : 'saved_on_device';

  const blisSections = [
    {
      title: 'Interactive Map Workspace',
      description:
        'Vector tiles for river basins, dams, irrigation scheme perimeters, and canal network branches.',
      stats: `${basins.length} Major ${basins.length === 1 ? 'Basin' : 'Basins'}`,
      statLabel: 'Vector Tiles Active',
      icon: Layers,
      badge: 'Active Network',
      badgeStatus: 'approved' as const,
      color: 'teal',
      features: [
        'MapLibre GL vector layer',
        'Basin catchments',
        'Real-time telemetry overlay',
        'Offline vector tile cache',
      ],
      linkText: 'Launch GIS Map',
      to: '/blis/map',
    },
    {
      title: 'Hydromet Time Series & Telemetry',
      description:
        'River discharge gauges, automated weather stations, rainfall metrics, and reservoir storage.',
      stats: `${stations.length} Registered Gauges`,
      statLabel: 'Telemetry Network',
      icon: Waves,
      badge: stations.length > 0 ? 'Live Feeds' : 'Pending Deployment',
      badgeStatus,
      color: 'blue',
      features: [
        'ECharts hydrograph trends',
        'Quality control flagging',
        'Low flow alerts',
        'Reservoir storage curves',
      ],
      linkText: 'Inspect Hydromet Stations',
      to: '/blis/stations',
    },
    {
      title: 'Dam Inspections & Structural Safety',
      description:
        'Engineering dam surveillance, piezometer seepage monitoring, and emergency spillway evaluations.',
      stats: `${dams.length} Monitored Dams`,
      statLabel: `${inspections.length} Audits Logged`,
      icon: AlertOctagon,
      badge: 'Safety Surveillance',
      badgeStatus: 'approved' as const,
      color: 'amber',
      features: [
        'Field inspection checklists',
        'Offline photo evidence',
        'Seepage threshold checks',
        'Surveillance schedule',
      ],
      linkText: 'Review Dam Safety',
      to: '/blis/inspections',
    },
  ];

  const quickStats = [
    {
      label: 'Hydromet Stations',
      value: `${stations.length} Active`,
      sub: stations.length > 0 ? 'Operational telemetry' : 'No telemetry online',
    },
    {
      label: 'Registered Dams',
      value: `${dams.length} Dams`,
      sub: `${dams.length} structures tracked`,
    },
    {
      label: 'Monitored Basins',
      value: `${basins.length} ${basins.length === 1 ? 'Basin' : 'Basins'}`,
      sub: basins.length > 0 ? basins.map((b) => b.code).join(', ') : 'No basins',
    },
    {
      label: 'Safety Audits',
      value: `${inspections.length} Audits`,
      sub: inspections.length > 0 ? 'Audits up to date' : 'No audits logged',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-950 via-teal-950 to-slate-900 p-6 sm:p-8 text-white shadow-lg border border-sky-900">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-950/60 text-sky-200 border border-sky-500/50 backdrop-blur-sm">
                <Droplets className="h-3.5 w-3.5 text-sky-300" /> BLIS Hydrology Network
              </span>
              <StatusChip status="approved">Active Network</StatusChip>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Baseline Land Information System (BLIS)
            </h1>
            <p className="text-sky-100 text-xs sm:text-sm max-w-xl leading-relaxed font-medium">
              Monitor river basin hydrology, dam structural integrity, hydrometric telemetry, and
              watershed spatial layers under scope{' '}
              <span className="font-semibold text-sky-300">
                {currentScope.name || 'National Basins'}
              </span>
              .
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="bg-white/20 hover:bg-white/30 text-white font-bold border border-white/40 shadow-xs backdrop-blur-sm text-xs cursor-pointer"
            >
              <Link to="/blis/stations">
                <Activity className="h-3.5 w-3.5 mr-1.5 text-sky-300" />
                Live Telemetry
              </Link>
            </Button>
            <Button
              asChild
              className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md cursor-pointer"
            >
              <Link to="/blis/dams">
                <LineChart className="h-3.5 w-3.5 mr-1.5" />
                Dams & Reservoirs
              </Link>
            </Button>
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
              <span className="text-[10px] text-sky-700 font-medium">{stat.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {blisSections.map((sec, i) => {
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
                          : 'bg-sky-50 text-sky-600 border border-sky-200/60'
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
                      <div className="h-1.5 w-1.5 rounded-full bg-sky-600" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <Button
                  asChild
                  variant="outline"
                  className="w-full justify-between h-10 rounded-xl text-xs font-bold text-slate-700 hover:text-sky-700 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer"
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
