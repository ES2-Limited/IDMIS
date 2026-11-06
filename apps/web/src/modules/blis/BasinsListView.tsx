import * as React from 'react';
import { Compass, Search, ArrowUpRight, Users, Droplets } from 'lucide-react';
import {
  Button,
  Input,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@idmis/ui';
import { useScope } from '../../shell/ScopeContext';

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

export const mockBasins: BasinRecord[] = [
  {
    id: '018f3a70-0004-7000-8000-000000000401',
    code: 'BAS-HJB',
    name: "Hadejia-Jama'are River Basin",
    altName: 'Lake Chad Sub-Basin Nigeria',
    hydrologicalUnit: 'Hydrological Area VIII (Chad Basin)',
    mainRiver: "Hadejia & Jama'are Rivers",
    rbdaName: "Hadejia-Jama'are River Basin Development Authority (HJRBDA)",
    areaKm2: 84000,
    drainageDensity: '0.42 km/km²',
    streamCount: 412,
    reliefM: 920,
    version: 1,
    morphometryHistory: [
      {
        year: 2024,
        streamLengthTotalKm: 35280,
        avgSlopePct: 2.1,
        highestPointM: 1240,
        lowestPointM: 320,
      },
      {
        year: 2018,
        streamLengthTotalKm: 35120,
        avgSlopePct: 2.2,
        highestPointM: 1240,
        lowestPointM: 320,
      },
    ],
  },
  {
    id: '018f3a70-0004-7000-8000-000000000402',
    code: 'BAS-SRB',
    name: 'Sokoto-Rima River Basin',
    altName: 'North-Western Drainage Basin',
    hydrologicalUnit: 'Hydrological Area I (Niger North)',
    mainRiver: 'Sokoto & Rima Rivers',
    rbdaName: 'Sokoto-Rima River Basin Development Authority (SRRBDA)',
    areaKm2: 131600,
    drainageDensity: '0.36 km/km²',
    streamCount: 524,
    reliefM: 710,
    version: 1,
    morphometryHistory: [
      {
        year: 2023,
        streamLengthTotalKm: 47376,
        avgSlopePct: 1.8,
        highestPointM: 960,
        lowestPointM: 250,
      },
    ],
  },
  {
    id: '018f3a70-0004-7000-8000-000000000403',
    code: 'BAS-UNB',
    name: 'Upper Niger River Basin',
    altName: 'Kainji Catchment Basin',
    hydrologicalUnit: 'Hydrological Area II (Niger Central)',
    mainRiver: 'River Niger / Kaduna River',
    rbdaName: 'Upper Niger River Basin Development Authority (UNRBDA)',
    areaKm2: 154000,
    drainageDensity: '0.51 km/km²',
    streamCount: 880,
    reliefM: 1150,
    version: 1,
    morphometryHistory: [
      {
        year: 2022,
        streamLengthTotalKm: 78540,
        avgSlopePct: 3.4,
        highestPointM: 1450,
        lowestPointM: 300,
      },
    ],
  },
];

export const mockStakeholders: StakeholderRecord[] = [
  {
    id: 'stk-1',
    name: 'Kano State Water Board',
    category: 'Government Agency',
    contactPerson: 'Engr. Garba Sani',
    phone: '+234 803 555 1201',
    email: 'info@kanowater.ng',
    basinName: "Hadejia-Jama'are River Basin",
  },
  {
    id: 'stk-2',
    name: 'KRIS WUA Apex Federation',
    category: 'WUA Federation',
    contactPerson: 'Alhaji Bashir Umar',
    phone: '+234 802 333 4410',
    email: 'kris.wua.apex@idmis.gov.ng',
    basinName: "Hadejia-Jama'are River Basin",
  },
  {
    id: 'stk-3',
    name: 'Hadejia Wetlands Conservation Project',
    category: 'Community NGO',
    contactPerson: 'Dr. Fatima Mustapha',
    phone: '+234 806 888 9012',
    email: 'wetlands@conservation.ng',
    basinName: "Hadejia-Jama'are River Basin",
  },
  {
    id: 'stk-4',
    name: 'Bakolori Water Users Association',
    category: 'WUA Federation',
    contactPerson: 'Mallam Bello Mafara',
    phone: '+234 803 777 2201',
    email: 'bakolori.wua@idmis.gov.ng',
    basinName: 'Sokoto-Rima River Basin',
  },
];

export const mockWaterPriorities: WaterUsePriorityRecord[] = [
  {
    id: 'wup-1',
    basinName: "Hadejia-Jama'are River Basin",
    sector: 'Domestic Municipal Supply',
    priorityRank: 1,
    allocationPct: 35,
    monitoringRule: 'Guaranteed 24/7 uncurtailed baseline intake for Greater Kano metropolis.',
  },
  {
    id: 'wup-2',
    basinName: "Hadejia-Jama'are River Basin",
    sector: 'Irrigated Agriculture',
    priorityRank: 2,
    allocationPct: 45,
    monitoringRule: 'Scheduled rotational gravity supply for KRIS Phase I & II blocks.',
  },
  {
    id: 'wup-3',
    basinName: "Hadejia-Jama'are River Basin",
    sector: 'Environmental Wetlands Flow',
    priorityRank: 3,
    allocationPct: 20,
    monitoringRule: 'Minimum mandated 18 m³/s ecological reserve into Hadejia-Nguru wetlands.',
  },
  {
    id: 'wup-4',
    basinName: 'Sokoto-Rima River Basin',
    sector: 'Irrigated Agriculture',
    priorityRank: 1,
    allocationPct: 55,
    monitoringRule: 'Dry season command area delivery to Bakolori and Wurno schemes.',
  },
  {
    id: 'wup-5',
    basinName: 'Sokoto-Rima River Basin',
    sector: 'Domestic Municipal Supply',
    priorityRank: 2,
    allocationPct: 30,
    monitoringRule: 'Sokoto urban water supply intake security.',
  },
];

export function BasinsListView() {
  const { currentScope } = useScope();
  const [activeTab, setActiveTab] = React.useState<'basins' | 'priorities' | 'stakeholders'>(
    'basins',
  );
  const [search, setSearch] = React.useState('');
  const [basins] = React.useState<BasinRecord[]>(mockBasins);
  const [selectedBasin, setSelectedBasin] = React.useState<BasinRecord | null>(null);

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

  const filteredStakeholders = React.useMemo(() => {
    return mockStakeholders.filter((item) => {
      return (
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
        item.category.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [search]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              River Basin Hydro-Morphometry & Governance
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
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('basins')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all min-h-[44px] ${
            activeTab === 'basins'
              ? 'bg-white text-teal-800 border-t-2 border-teal-600 border-x border-slate-200 font-bold shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Compass className="w-4 h-4" />
          Basins & Morphometry ({basins.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('priorities')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all min-h-[44px] ${
            activeTab === 'priorities'
              ? 'bg-white text-teal-800 border-t-2 border-teal-600 border-x border-slate-200 font-bold shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Droplets className="w-4 h-4" />
          Water-Use Allocations ({mockWaterPriorities.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('stakeholders')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all min-h-[44px] ${
            activeTab === 'stakeholders'
              ? 'bg-white text-teal-800 border-t-2 border-teal-600 border-x border-slate-200 font-bold shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          Basin Stakeholders ({mockStakeholders.length})
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
                {filteredBasins.map((basin) => (
                  <tr key={basin.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 text-sm">{basin.name}</div>
                      <div className="text-slate-400 font-mono text-[11px]">{basin.code}</div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-800">{basin.mainRiver}</td>
                    <td className="py-3.5 px-4 font-bold text-teal-800">
                      {basin.areaKm2.toLocaleString()} km²
                    </td>
                    <td className="py-3.5 px-4 font-mono">{basin.drainageDensity}</td>
                    <td className="py-3.5 px-4 font-mono">{basin.streamCount} streams</td>
                    <td className="py-3.5 px-4 font-mono">{basin.reliefM} meters</td>
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
                ))}
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
                {mockWaterPriorities.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <Badge className="bg-teal-100 text-teal-800 font-bold">
                        Tier #{item.priorityRank}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{item.sector}</td>
                    <td className="py-3.5 px-4 text-slate-600">{item.basinName}</td>
                    <td className="py-3.5 px-4 font-bold text-teal-800">{item.allocationPct}%</td>
                    <td className="py-3.5 px-4 text-slate-600">{item.monitoringRule}</td>
                  </tr>
                ))}
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
                {filteredStakeholders.map((stk) => (
                  <tr key={stk.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">{stk.name}</td>
                    <td className="py-3.5 px-4">
                      <Badge className="bg-slate-100 text-slate-700">{stk.category}</Badge>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{stk.basinName}</td>
                    <td className="py-3.5 px-4 font-medium text-slate-800">{stk.contactPerson}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">{stk.phone}</td>
                    <td className="py-3.5 px-4 text-teal-700 font-medium">{stk.email}</td>
                  </tr>
                ))}
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
                    {selectedBasin.areaKm2.toLocaleString()} km²
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
                    {selectedBasin.streamCount} streams
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Basin Relief:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedBasin.reliefM} meters
                  </span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                  Morphometric Measurement Records
                </div>
                <div className="divide-y divide-slate-100">
                  {selectedBasin.morphometryHistory.map((rec) => (
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
                  ))}
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
