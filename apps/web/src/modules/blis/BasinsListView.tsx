import * as React from 'react';
import { Compass, Search, ArrowUpRight, Users, Droplets, RefreshCw } from 'lucide-react';
import {
  Button,
  Input,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  EmptyState,
} from '@idmis/ui';
import { useScope } from '../../shell/ScopeContext';
import { useBasins } from './hooks';

export interface BasinRecord {
  id: string;
  code: string;
  name: string;
  altName?: string;
  hydrologicalUnit: string;
  mainRiver: string;
  rbdaName: string;
  areaKm2: number;
  drainageDensity: string;
  streamCount: number;
  reliefM: number;
  version: number;
  morphometryHistory: {
    year: number;
    streamLengthTotalKm: number;
    avgSlopePct: number;
    highestPointM: number;
    lowestPointM: number;
  }[];
}

export interface StakeholderRecord {
  id: string;
  name: string;
  category:
    | 'Government Agency'
    | 'WUA Federation'
    | 'Commercial Agro'
    | 'Research Institute'
    | 'Community NGO';
  contactPerson: string;
  phone: string;
  email: string;
  basinName: string;
}

export interface WaterUsePriorityRecord {
  id: string;
  basinName: string;
  sector:
    | 'Domestic Municipal Supply'
    | 'Irrigated Agriculture'
    | 'Environmental Wetlands Flow'
    | 'Hydropower Generation'
    | 'Industrial Livestock';
  priorityRank: number;
  allocationPct: number;
  monitoringRule: string;
}

export function BasinsListView() {
  const { currentScope } = useScope();
  const [activeTab, setActiveTab] = React.useState<'basins' | 'priorities' | 'stakeholders'>(
    'basins',
  );
  const [search, setSearch] = React.useState('');
  const [selectedBasin, setSelectedBasin] = React.useState<BasinRecord | null>(null);

  // Modular custom hook for Basins
  const { basins: serverBasins, isLoading, isFetching: isRefetching, refetch } = useBasins();

  const basins: BasinRecord[] = React.useMemo(() => {
    if (serverBasins && serverBasins.length > 0) {
      return serverBasins.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        altName: b.altName || undefined,
        hydrologicalUnit: b.hydrologicalUnit || 'Hydrological Unit Area',
        mainRiver: b.mainRiver || b.name,
        rbdaName: b.rbdaId ? `RBDA (${b.rbdaId.slice(-4)})` : 'National River Basin Authority',
        areaKm2: 0,
        drainageDensity: 'N/A',
        streamCount: 0,
        reliefM: 0,
        version: b.version,
        morphometryHistory: [],
      }));
    }
    return [];
  }, [serverBasins]);

  const filteredBasins = React.useMemo(() => {
    return basins.filter((item) => {
      return (
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.code.toLowerCase().includes(search.toLowerCase()) ||
        item.mainRiver.toLowerCase().includes(search.toLowerCase()) ||
        item.rbdaName.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [basins, search]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              River Basin Hydro-Morphometry & Governance
              {isLoading && (
                <RefreshCw className="h-4 w-4 animate-spin text-teal-600" aria-label="Loading..." />
              )}
            </h1>
            <Badge className="bg-teal-100 text-teal-800 border-teal-200 font-mono text-xs">
              {currentScope.name || 'National River Basin Authorities'}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Catchment geomorphometry, drainage orders, water allocation hierarchies, and registered
            stakeholders.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="text-xs h-9 font-semibold text-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('basins')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all min-h-[44px] cursor-pointer ${
            activeTab === 'basins'
              ? 'bg-white text-teal-800 border-t-2 border-teal-600 border-x border-slate-200 font-bold shadow-sm'
              : 'text-slate-700 hover:text-slate-950 font-medium hover:bg-slate-100/70'
          }`}
        >
          <Compass className="w-4 h-4" />
          Basins & Morphometry ({basins.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('priorities')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all min-h-[44px] cursor-pointer ${
            activeTab === 'priorities'
              ? 'bg-white text-teal-800 border-t-2 border-teal-600 border-x border-slate-200 font-bold shadow-sm'
              : 'text-slate-700 hover:text-slate-950 font-medium hover:bg-slate-100/70'
          }`}
        >
          <Droplets className="w-4 h-4" />
          Water-Use Allocations (0)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('stakeholders')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all min-h-[44px] cursor-pointer ${
            activeTab === 'stakeholders'
              ? 'bg-white text-teal-800 border-t-2 border-teal-600 border-x border-slate-200 font-bold shadow-sm'
              : 'text-slate-700 hover:text-slate-950 font-medium hover:bg-slate-100/70'
          }`}
        >
          <Users className="w-4 h-4" />
          Basin Stakeholders (0)
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search records..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11 text-xs"
          />
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === 'basins' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Basin Name & Code</th>
                  <th className="py-3 px-4">Main River Channel</th>
                  <th className="py-3 px-4">Drainage Area</th>
                  <th className="py-3 px-4">Drainage Density</th>
                  <th className="py-3 px-4">Stream Count</th>
                  <th className="py-3 px-4">Relief</th>
                  <th className="py-3 px-4">Supervising RBDA</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBasins.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <div className="flex justify-center">
                        <EmptyState
                          icon={<Compass className="w-8 h-8 text-teal-600" />}
                          title="No Basins Registered"
                          description={
                            search
                              ? 'No basins match your search criteria.'
                              : 'No river basin hydromorphometry records found in this scope.'
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredBasins.map((basin) => (
                    <tr key={basin.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 text-sm">{basin.name}</div>
                        <div className="text-slate-400 font-mono text-[11px]">{basin.code}</div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">{basin.mainRiver}</td>
                      <td className="py-3.5 px-4 font-bold text-teal-800">
                        {basin.areaKm2 ? `${basin.areaKm2.toLocaleString()} km²` : '-'}
                      </td>
                      <td className="py-3.5 px-4 font-mono">{basin.drainageDensity}</td>
                      <td className="py-3.5 px-4 font-mono">
                        {basin.streamCount ? `${basin.streamCount} streams` : '-'}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {basin.reliefM ? `${basin.reliefM} meters` : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">{basin.rbdaName}</td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedBasin(basin)}
                          className="min-h-[38px] text-xs gap-1 hover:text-teal-700"
                        >
                          Morphometry
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'priorities' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Priority Rank</th>
                  <th className="py-3 px-4">Water-Use Sector</th>
                  <th className="py-3 px-4">Basin</th>
                  <th className="py-3 px-4">Allocation Share</th>
                  <th className="py-3 px-4">Statutory Monitoring Rule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <div className="flex justify-center">
                      <EmptyState
                        icon={<Droplets className="w-8 h-8 text-teal-600" />}
                        title="No Water Allocations Configured"
                        description="No water-use allocation priorities have been defined for this river basin."
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'stakeholders' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Entity / Stakeholder Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Basin</th>
                  <th className="py-3 px-4">Contact Representative</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="flex justify-center">
                      <EmptyState
                        icon={<Users className="w-8 h-8 text-teal-600" />}
                        title="No Stakeholders Registered"
                        description="No community water user associations or basin stakeholders are registered yet."
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Morphometry Modal */}
      {selectedBasin && (
        <Dialog open={!!selectedBasin} onOpenChange={(open) => !open && setSelectedBasin(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge className="bg-teal-100 text-teal-800 font-mono text-xs">
                  {selectedBasin.code}
                </Badge>
              </div>
              <DialogTitle className="text-xl font-bold text-slate-900 mt-2">
                {selectedBasin.name} — Morphometry Assessment
              </DialogTitle>
              <p className="text-xs text-slate-500">{selectedBasin.hydrologicalUnit}</p>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 block">Total Drainage Area:</span>
                  <span className="font-semibold text-teal-800 text-sm">
                    {selectedBasin.areaKm2 ? `${selectedBasin.areaKm2.toLocaleString()} km²` : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Drainage Density:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedBasin.drainageDensity}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Total Stream Count:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedBasin.streamCount ? `${selectedBasin.streamCount} streams` : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Basin Relief:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedBasin.reliefM ? `${selectedBasin.reliefM} meters` : '-'}
                  </span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                  Morphometric Measurement Records
                </div>
                <div className="divide-y divide-slate-100">
                  {selectedBasin.morphometryHistory.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-xs">
                      No historical morphometry survey measurements logged.
                    </div>
                  ) : (
                    selectedBasin.morphometryHistory.map((rec) => (
                      <div key={rec.year} className="p-3 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-400">Measurement Year:</span>{' '}
                          <span className="font-bold text-slate-900">{rec.year}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Total Stream Length:</span>{' '}
                          <span className="font-semibold text-slate-800">
                            {rec.streamLengthTotalKm.toLocaleString()} km
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Average Slope:</span>{' '}
                          <span className="font-semibold text-slate-800">{rec.avgSlopePct}%</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Elevation Span:</span>{' '}
                          <span className="font-semibold text-slate-800">
                            {rec.lowestPointM}m – {rec.highestPointM}m
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSelectedBasin(null)}
                className="min-h-[44px] text-xs"
              >
                Close Inspector
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
