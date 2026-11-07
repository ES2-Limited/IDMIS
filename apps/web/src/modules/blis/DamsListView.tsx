import * as React from 'react';
import { Waves, Search, Plus, ArrowUpRight, Layers } from 'lucide-react';
import {
  Button,
  Input,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@idmis/ui';
import { useCan } from '../../auth';
import { useScope } from '../../shell/ScopeContext';

export interface DamRecord {
  id: string;
  code: string;
  name: string;
  altName?: string;
  basinName: string;
  reservoirName?: string;
  completionYear: number;
  heightM: number;
  crestLengthM: number;
  reservoirCapacityMcm: number;
  reservoirAreaKm2: number;
  spillwayType: string;
  spillwayCapacityM3s: number;
  hazardRating: 'high' | 'significant' | 'low';
  lastCondition: 'good' | 'fair' | 'poor' | 'critical';
  nearestTown: string;
  ownerOrg: string;
  notes?: string;
  version: number;
}

export interface ReservoirRecord {
  id: string;
  basinName: string;
  name: string;
  river: string;
  areaKm2: number;
  volumeMcm: number;
  meanDepthM: number;
  maxDepthM: number;
  sedimentRatio: number;
  version: number;
}

export const mockDams: DamRecord[] = [
  {
    id: '018f3a70-0001-7000-8000-000000000101',
    code: 'DAM-HJB-001',
    name: 'Tiga Dam',
    altName: 'Kano River Main Reservoir Dam',
    basinName: "Hadejia-Jama'are River Basin",
    reservoirName: 'Lake Tiga Reservoir',
    completionYear: 1974,
    heightM: 48,
    crestLengthM: 6000,
    reservoirCapacityMcm: 1968,
    reservoirAreaKm2: 178,
    spillwayType: 'Ogee Crest with Chute',
    spillwayCapacityM3s: 2150,
    hazardRating: 'high',
    lastCondition: 'good',
    nearestTown: 'Rano / Tiga, Kano State',
    ownerOrg: "Hadejia-Jama'are River Basin Development Authority (HJRBDA)",
    notes: 'Major storage dam supporting Kano River Irrigation Project (Phase I & II).',
    version: 1,
  },
  {
    id: '018f3a70-0001-7000-8000-000000000102',
    code: 'DAM-HJB-002',
    name: 'Challawa Gorge Dam',
    altName: 'Challawa River Dam',
    basinName: "Hadejia-Jama'are River Basin",
    reservoirName: 'Challawa Gorge Reservoir',
    completionYear: 1992,
    heightM: 42,
    crestLengthM: 7800,
    reservoirCapacityMcm: 904,
    reservoirAreaKm2: 101,
    spillwayType: 'Morning Glory Ungated Spillway',
    spillwayCapacityM3s: 1400,
    hazardRating: 'high',
    lastCondition: 'fair',
    nearestTown: 'Karaye, Kano State',
    ownerOrg: 'HJRBDA',
    notes: 'Provides water supply to Kano metropolis and Challawa river scheme downstream.',
    version: 1,
  },
  {
    id: '018f3a70-0001-7000-8000-000000000103',
    code: 'DAM-SRB-001',
    name: 'Bakolori Dam',
    altName: 'Sokoto River Impoundment',
    basinName: 'Sokoto-Rima River Basin',
    reservoirName: 'Bakolori Reservoir',
    completionYear: 1978,
    heightM: 52,
    crestLengthM: 5400,
    reservoirCapacityMcm: 450,
    reservoirAreaKm2: 80,
    spillwayType: 'Radial Gated Concrete Chute',
    spillwayCapacityM3s: 1850,
    hazardRating: 'high',
    lastCondition: 'good',
    nearestTown: 'Talata Mafara, Zamfara State',
    ownerOrg: 'Sokoto-Rima River Basin Development Authority (SRRBDA)',
    notes: 'Primary intake feeder for Bakolori Irrigation Project network.',
    version: 2,
  },
  {
    id: '018f3a70-0001-7000-8000-000000000104',
    code: 'DAM-SRB-002',
    name: 'Goronyo Dam',
    altName: 'Rima River Dam Complex',
    basinName: 'Sokoto-Rima River Basin',
    reservoirName: 'Goronyo Impoundment',
    completionYear: 1984,
    heightM: 21,
    crestLengthM: 12500,
    reservoirCapacityMcm: 942,
    reservoirAreaKm2: 200,
    spillwayType: 'Twin Broad-Crested Overflow',
    spillwayCapacityM3s: 2900,
    hazardRating: 'high',
    lastCondition: 'fair',
    nearestTown: 'Goronyo, Sokoto State',
    ownerOrg: 'SRRBDA',
    notes: 'Secondary embankment requires periodic surveillance during wet season peak.',
    version: 1,
  },
  {
    id: '018f3a70-0001-7000-8000-000000000105',
    code: 'DAM-HJB-003',
    name: 'Hadejia Barrage & Weir',
    altName: 'Hadejia Wetlands Control Structure',
    basinName: "Hadejia-Jama'are River Basin",
    reservoirName: 'Hadejia River Pool',
    completionYear: 1988,
    heightM: 11,
    crestLengthM: 850,
    reservoirCapacityMcm: 45,
    reservoirAreaKm2: 15,
    spillwayType: 'Sluice Gates with Broad Weir',
    spillwayCapacityM3s: 600,
    hazardRating: 'significant',
    lastCondition: 'poor',
    nearestTown: 'Hadejia, Jigawa State',
    ownerOrg: 'HJRBDA',
    notes:
      'Regulates water levels for the Hadejia-Nguru wetlands bird sanctuary & local diversions.',
    version: 3,
  },
];

export const mockReservoirs: ReservoirRecord[] = [
  {
    id: '018f3a70-0002-7000-8000-000000000201',
    basinName: "Hadejia-Jama'are River Basin",
    name: 'Lake Tiga Reservoir',
    river: 'Kano River',
    areaKm2: 178,
    volumeMcm: 1968,
    meanDepthM: 11.1,
    maxDepthM: 40,
    sedimentRatio: 0.042,
    version: 1,
  },
  {
    id: '018f3a70-0002-7000-8000-000000000202',
    basinName: "Hadejia-Jama'are River Basin",
    name: 'Challawa Gorge Reservoir',
    river: 'Challawa River',
    areaKm2: 101,
    volumeMcm: 904,
    meanDepthM: 8.9,
    maxDepthM: 36,
    sedimentRatio: 0.065,
    version: 1,
  },
  {
    id: '018f3a70-0002-7000-8000-000000000203',
    basinName: 'Sokoto-Rima River Basin',
    name: 'Bakolori Reservoir',
    river: 'Sokoto River',
    areaKm2: 80,
    volumeMcm: 450,
    meanDepthM: 5.6,
    maxDepthM: 44,
    sedimentRatio: 0.078,
    version: 2,
  },
  {
    id: '018f3a70-0002-7000-8000-000000000204',
    basinName: 'Sokoto-Rima River Basin',
    name: 'Goronyo Impoundment',
    river: 'Rima River',
    areaKm2: 200,
    volumeMcm: 942,
    meanDepthM: 4.7,
    maxDepthM: 19,
    sedimentRatio: 0.091,
    version: 1,
  },
];

export function DamsListView() {
  const { currentScope } = useScope();
  const canManage = useCan('blis.irrigation.write');
  const [activeTab, setActiveTab] = React.useState<'dams' | 'reservoirs'>('dams');
  const [search, setSearch] = React.useState('');
  const [hazardFilter, setHazardFilter] = React.useState<string>('all');
  const [conditionFilter, setConditionFilter] = React.useState<string>('all');
  const [dams, setDams] = React.useState<DamRecord[]>(mockDams);
  const [reservoirs] = React.useState<ReservoirRecord[]>(mockReservoirs);
  const [selectedDam, setSelectedDam] = React.useState<DamRecord | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);

  // New Dam Form State
  const [formData, setFormData] = React.useState({
    name: '',
    code: '',
    altName: '',
    basinName: "Hadejia-Jama'are River Basin",
    completionYear: 2024,
    heightM: 25,
    crestLengthM: 1200,
    reservoirCapacityMcm: 150,
    reservoirAreaKm2: 30,
    spillwayType: 'Concrete Overflow Chute',
    spillwayCapacityM3s: 500,
    hazardRating: 'significant' as 'high' | 'significant' | 'low',
    lastCondition: 'good' as 'good' | 'fair' | 'poor' | 'critical',
    nearestTown: '',
    ownerOrg: 'Federal Ministry of Water Resources',
  });

  const filteredDams = React.useMemo(() => {
    return dams.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.code.toLowerCase().includes(search.toLowerCase()) ||
        item.nearestTown.toLowerCase().includes(search.toLowerCase()) ||
        item.basinName.toLowerCase().includes(search.toLowerCase());
      const matchHazard = hazardFilter === 'all' || item.hazardRating === hazardFilter;
      const matchCondition = conditionFilter === 'all' || item.lastCondition === conditionFilter;
      return matchSearch && matchHazard && matchCondition;
    });
  }, [dams, search, hazardFilter, conditionFilter]);

  const filteredReservoirs = React.useMemo(() => {
    return reservoirs.filter((item) => {
      return (
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.river.toLowerCase().includes(search.toLowerCase()) ||
        item.basinName.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [reservoirs, search]);

  const handleCreateDam = (e: React.FormEvent) => {
    e.preventDefault();
    const newDam: DamRecord = {
      id: `dam-${Date.now()}`,
      code: formData.code.toUpperCase(),
      name: formData.name,
      altName: formData.altName || undefined,
      basinName: formData.basinName,
      completionYear: Number(formData.completionYear),
      heightM: Number(formData.heightM),
      crestLengthM: Number(formData.crestLengthM),
      reservoirCapacityMcm: Number(formData.reservoirCapacityMcm),
      reservoirAreaKm2: Number(formData.reservoirAreaKm2),
      spillwayType: formData.spillwayType,
      spillwayCapacityM3s: Number(formData.spillwayCapacityM3s),
      hazardRating: formData.hazardRating,
      lastCondition: formData.lastCondition,
      nearestTown: formData.nearestTown,
      ownerOrg: formData.ownerOrg,
      version: 1,
    };
    setDams([newDam, ...dams]);
    setIsCreateModalOpen(false);
  };

  const getConditionBadge = (condition: DamRecord['lastCondition']) => {
    switch (condition) {
      case 'good':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
            Good Condition
          </Badge>
        );
      case 'fair':
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300">Fair Condition</Badge>
        );
      case 'poor':
        return (
          <Badge className="bg-orange-100 text-orange-800 border-orange-300">
            Poor (Action Req.)
          </Badge>
        );
      case 'critical':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-300">Critical Alert</Badge>;
    }
  };

  const getHazardBadge = (hazard: DamRecord['hazardRating']) => {
    switch (hazard) {
      case 'high':
        return <Badge className="bg-rose-50 text-rose-700 border-rose-200">High Hazard</Badge>;
      case 'significant':
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Significant</Badge>;
      case 'low':
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Low Hazard</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Dams & Impoundment Reservoirs
            </h1>
            <Badge className="bg-teal-100 text-teal-800 border-teal-200 font-mono text-xs">
              {currentScope.name || 'National Basin Scoped'}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Registry of large dam barriers, spillways, reservoir storage capacity, and surveillance
            ratings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <Button
              className="bg-teal-700 hover:bg-teal-800 text-white min-h-[44px] gap-2 px-4 shadow-sm"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus className="w-4 h-4" />
              Register New Dam
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('dams')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all min-h-[44px] cursor-pointer ${
            activeTab === 'dams'
              ? 'bg-white text-teal-800 border-t-2 border-teal-600 border-x border-slate-200 font-bold shadow-sm'
              : 'text-slate-700 hover:text-slate-950 font-medium hover:bg-slate-100/70'
          }`}
        >
          <Waves className="w-4 h-4" />
          Dams Infrastructure ({dams.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reservoirs')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all min-h-[44px] cursor-pointer ${
            activeTab === 'reservoirs'
              ? 'bg-white text-teal-800 border-t-2 border-teal-600 border-x border-slate-200 font-bold shadow-sm'
              : 'text-slate-700 hover:text-slate-950 font-medium hover:bg-slate-100/70'
          }`}
        >
          <Layers className="w-4 h-4" />
          Impoundment Reservoirs ({reservoirs.length})
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder={
              activeTab === 'dams'
                ? 'Search dams by name, code, nearest town...'
                : 'Search reservoirs by name, river...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11 text-xs"
          />
        </div>

        {activeTab === 'dams' && (
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Select value={hazardFilter} onValueChange={setHazardFilter}>
              <SelectTrigger className="h-11 min-w-[140px] text-xs">
                <SelectValue placeholder="Hazard Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Hazards</SelectItem>
                <SelectItem value="high">High Hazard</SelectItem>
                <SelectItem value="significant">Significant</SelectItem>
                <SelectItem value="low">Low Hazard</SelectItem>
              </SelectContent>
            </Select>

            <Select value={conditionFilter} onValueChange={setConditionFilter}>
              <SelectTrigger className="h-11 min-w-[140px] text-xs">
                <SelectValue placeholder="Condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Conditions</SelectItem>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="fair">Fair</SelectItem>
                <SelectItem value="poor">Poor</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Main Table Content */}
      {activeTab === 'dams' ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Dam Name & Code</th>
                  <th className="py-3 px-4">Basin</th>
                  <th className="py-3 px-4">Completion</th>
                  <th className="py-3 px-4">Height / Crest</th>
                  <th className="py-3 px-4">Storage Capacity</th>
                  <th className="py-3 px-4">Hazard Class</th>
                  <th className="py-3 px-4">Last Assessment</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDams.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No dams matching search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredDams.map((dam) => (
                    <tr key={dam.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 text-sm">{dam.name}</div>
                        <div className="text-slate-400 font-mono text-[11px]">{dam.code}</div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">{dam.basinName}</td>
                      <td className="py-3.5 px-4">{dam.completionYear}</td>
                      <td className="py-3.5 px-4 font-mono">
                        {dam.heightM}m / {dam.crestLengthM.toLocaleString()}m
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-teal-800">
                        {dam.reservoirCapacityMcm.toLocaleString()} MCM
                      </td>
                      <td className="py-3.5 px-4">{getHazardBadge(dam.hazardRating)}</td>
                      <td className="py-3.5 px-4">{getConditionBadge(dam.lastCondition)}</td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedDam(dam)}
                          className="min-h-[38px] text-xs gap-1 hover:text-teal-700"
                        >
                          Details
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
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Reservoir Name</th>
                  <th className="py-3 px-4">River Source</th>
                  <th className="py-3 px-4">Basin</th>
                  <th className="py-3 px-4">Surface Area</th>
                  <th className="py-3 px-4">Live Volume</th>
                  <th className="py-3 px-4">Mean / Max Depth</th>
                  <th className="py-3 px-4">Sediment Ratio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReservoirs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No reservoirs matching search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredReservoirs.map((res) => (
                    <tr key={res.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">{res.name}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">{res.river}</td>
                      <td className="py-3.5 px-4 text-slate-600">{res.basinName}</td>
                      <td className="py-3.5 px-4 font-mono">{res.areaKm2} km²</td>
                      <td className="py-3.5 px-4 font-bold text-teal-800">{res.volumeMcm} MCM</td>
                      <td className="py-3.5 px-4 font-mono">
                        {res.meanDepthM}m / {res.maxDepthM}m
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">{res.sedimentRatio}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dam Detail Modal */}
      {selectedDam && (
        <Dialog open={!!selectedDam} onOpenChange={(open) => !open && setSelectedDam(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge className="bg-teal-100 text-teal-800 font-mono text-xs">
                  {selectedDam.code}
                </Badge>
                {getHazardBadge(selectedDam.hazardRating)}
              </div>
              <DialogTitle className="text-xl font-bold text-slate-900 mt-2">
                {selectedDam.name}
              </DialogTitle>
              {selectedDam.altName && (
                <p className="text-xs text-slate-500">{selectedDam.altName}</p>
              )}
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 text-xs">
              <div className="space-y-3 bg-slate-50 p-3.5 rounded-lg border border-slate-100">
                <div className="font-bold text-slate-800 text-[13px] border-b border-slate-200 pb-1">
                  Structural & Engineering Specs
                </div>
                <div>
                  <span className="text-slate-400">Dam Height:</span>{' '}
                  <span className="font-semibold text-slate-800">{selectedDam.heightM} meters</span>
                </div>
                <div>
                  <span className="text-slate-400">Crest Length:</span>{' '}
                  <span className="font-semibold text-slate-800">
                    {selectedDam.crestLengthM.toLocaleString()} meters
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Spillway Type:</span>{' '}
                  <span className="font-semibold text-slate-800">{selectedDam.spillwayType}</span>
                </div>
                <div>
                  <span className="text-slate-400">Spillway Design Capacity:</span>{' '}
                  <span className="font-semibold text-slate-800">
                    {selectedDam.spillwayCapacityM3s.toLocaleString()} m³/s
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Completion Year:</span>{' '}
                  <span className="font-semibold text-slate-800">{selectedDam.completionYear}</span>
                </div>
              </div>

              <div className="space-y-3 bg-slate-50 p-3.5 rounded-lg border border-slate-100">
                <div className="font-bold text-slate-800 text-[13px] border-b border-slate-200 pb-1">
                  Reservoir & Governance
                </div>
                <div>
                  <span className="text-slate-400">Basin Catchment:</span>{' '}
                  <span className="font-semibold text-slate-800">{selectedDam.basinName}</span>
                </div>
                <div>
                  <span className="text-slate-400">Reservoir Name:</span>{' '}
                  <span className="font-semibold text-slate-800">
                    {selectedDam.reservoirName || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Total Storage:</span>{' '}
                  <span className="font-semibold text-teal-800">
                    {selectedDam.reservoirCapacityMcm.toLocaleString()} MCM
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Water Surface Area:</span>{' '}
                  <span className="font-semibold text-slate-800">
                    {selectedDam.reservoirAreaKm2} km²
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Location / Nearest Town:</span>{' '}
                  <span className="font-semibold text-slate-800">{selectedDam.nearestTown}</span>
                </div>
                <div>
                  <span className="text-slate-400">Owner Authority:</span>{' '}
                  <span className="font-semibold text-slate-800">{selectedDam.ownerOrg}</span>
                </div>
              </div>
            </div>

            {selectedDam.notes && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900">
                <strong>Operational Notes:</strong> {selectedDam.notes}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSelectedDam(null)}
                className="min-h-[44px] text-xs"
              >
                Close Inspector
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Dam Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Register Dam Infrastructure Asset
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateDam} className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Dam Name *</label>
                <Input
                  required
                  placeholder="e.g. Wurno Dam"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="h-10 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Asset Code *</label>
                <Input
                  required
                  placeholder="e.g. DAM-SRB-005"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="h-10 text-xs uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Basin Unit *</label>
                <Select
                  value={formData.basinName}
                  onValueChange={(val) => setFormData({ ...formData, basinName: val })}
                >
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hadejia-Jama'are River Basin">
                      Hadejia-Jama'are River Basin
                    </SelectItem>
                    <SelectItem value="Sokoto-Rima River Basin">Sokoto-Rima River Basin</SelectItem>
                    <SelectItem value="Upper Niger River Basin">Upper Niger River Basin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Completion Year</label>
                <Input
                  type="number"
                  value={formData.completionYear}
                  onChange={(e) =>
                    setFormData({ ...formData, completionYear: Number(e.target.value) })
                  }
                  className="h-10 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Height (m)</label>
                <Input
                  type="number"
                  value={formData.heightM}
                  onChange={(e) => setFormData({ ...formData, heightM: Number(e.target.value) })}
                  className="h-10 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Crest Length (m)</label>
                <Input
                  type="number"
                  value={formData.crestLengthM}
                  onChange={(e) =>
                    setFormData({ ...formData, crestLengthM: Number(e.target.value) })
                  }
                  className="h-10 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Capacity (MCM)</label>
                <Input
                  type="number"
                  value={formData.reservoirCapacityMcm}
                  onChange={(e) =>
                    setFormData({ ...formData, reservoirCapacityMcm: Number(e.target.value) })
                  }
                  className="h-10 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  Hazard Classification
                </label>
                <Select
                  value={formData.hazardRating}
                  onValueChange={(val: 'high' | 'significant' | 'low') =>
                    setFormData({ ...formData, hazardRating: val })
                  }
                >
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High Hazard</SelectItem>
                    <SelectItem value="significant">Significant Hazard</SelectItem>
                    <SelectItem value="low">Low Hazard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Nearest Town</label>
                <Input
                  placeholder="e.g. Wurno, Sokoto State"
                  value={formData.nearestTown}
                  onChange={(e) => setFormData({ ...formData, nearestTown: e.target.value })}
                  className="h-10 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateModalOpen(false)}
                className="min-h-[44px] text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-teal-700 hover:bg-teal-800 text-white min-h-[44px] text-xs"
              >
                Save Dam Asset
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
