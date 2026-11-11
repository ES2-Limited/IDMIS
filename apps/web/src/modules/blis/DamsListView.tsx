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
  EmptyState,
} from '@idmis/ui';
import { useCan } from '../../auth';
import { useScope } from '../../shell/ScopeContext';
import { useDams, useReservoirs, useBasins } from './hooks';
import { useLookupValues } from '../core/hooks/usePlatformAdmin';

export interface DamRecord {
  id: string;
  code: string;
  name: string;
  altName?: string;
  basinId?: string;
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
  meanDepthM?: number;
  maxDepthM?: number;
  sedimentRatio?: number;
  version: number;
}

export function DamsListView() {
  const { currentScope } = useScope();
  const canManage = useCan('blis.irrigation.write');
  const [activeTab, setActiveTab] = React.useState<'dams' | 'reservoirs'>('dams');
  const [search, setSearch] = React.useState('');
  const [hazardFilter, setHazardFilter] = React.useState<string>('all');
  const [conditionFilter, setConditionFilter] = React.useState<string>('all');
  const [selectedDam, setSelectedDam] = React.useState<DamRecord | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);

  // Modular custom hooks for Dams, Reservoirs, Basins, and Lookups
  const { basins } = useBasins();
  const { data: damPurposes = [] } = useLookupValues('dam_purpose');
  const { data: damCategories = [] } = useLookupValues('dam_category');

  const {
    dams: serverDams,
    createDam,
    isCreating,
  } = useDams({
    limit: 50,
  });

  const { reservoirs: serverReservoirs } = useReservoirs();

  const basinMap = React.useMemo(() => {
    const map = new Map<string, string>();
    basins.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [basins]);

  const activeReservoirs: ReservoirRecord[] = React.useMemo(() => {
    if (serverReservoirs && serverReservoirs.length > 0) {
      return (serverReservoirs as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        basinName:
          r.basinId && basinMap.has(String(r.basinId))
            ? basinMap.get(String(r.basinId))!
            : String(
                r.basinId ? `Basin ${String(r.basinId).slice(-4)}` : "Hadejia-Jama'are River Basin",
              ),
        name: String(r.name),
        river: String(r.river || 'River Source'),
        areaKm2: r.areaKm2 ? Number(r.areaKm2) : 0,
        volumeMcm: r.volumeMcm ? Number(r.volumeMcm) : 0,
        meanDepthM: r.meanDepthM ? Number(r.meanDepthM) : undefined,
        maxDepthM: r.maxDepthM ? Number(r.maxDepthM) : undefined,
        sedimentRatio: r.sedimentRatio ? Number(r.sedimentRatio) : undefined,
        version: typeof r.version === 'number' ? r.version : 1,
      }));
    }
    return [];
  }, [serverReservoirs, basinMap]);

  const activeDams: DamRecord[] = React.useMemo(() => {
    if (serverDams && serverDams.length > 0) {
      return serverDams.map((d) => ({
        id: d.id,
        code: d.code || `DAM-${d.id.slice(0, 4)}`,
        name: d.name,
        altName: d.altName || undefined,
        basinId: d.basinId,
        basinName: basinMap.get(d.basinId) || `Basin ${d.basinId.slice(-4)}`,
        reservoirName: d.reservoirId ? `Reservoir ${d.reservoirId.slice(-4)}` : undefined,
        completionYear: d.completionYear || 2020,
        heightM: d.heightM ? Number(d.heightM) : 0,
        crestLengthM: d.crestLengthM ? Number(d.crestLengthM) : 0,
        reservoirCapacityMcm: d.reservoirCapacityMcm ? Number(d.reservoirCapacityMcm) : 0,
        reservoirAreaKm2: d.reservoirAreaKm2 ? Number(d.reservoirAreaKm2) : 0,
        spillwayType: d.spillwayType || 'Concrete Overflow Chute',
        spillwayCapacityM3s: d.spillwayCapacityM3s ? Number(d.spillwayCapacityM3s) : 0,
        hazardRating: 'significant',
        lastCondition: 'good',
        nearestTown: d.nearestTown || 'N/A',
        ownerOrg: 'Federal Ministry of Water Resources',
        notes: d.notes || undefined,
        version: d.version || 1,
      }));
    }
    return [];
  }, [serverDams, basinMap]);

  // New Dam Form State
  const [formData, setFormData] = React.useState({
    name: '',
    code: '',
    altName: '',
    basinId: '',
    purposeId: '',
    categoryId: '',
    completionYear: new Date().getFullYear(),
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

  // Ensure default basinId is set when basins load
  React.useEffect(() => {
    if (basins.length > 0 && !formData.basinId) {
      setFormData((prev) => ({ ...prev, basinId: basins[0]!.id }));
    }
  }, [basins, formData.basinId]);

  const filteredDams = React.useMemo(() => {
    return activeDams.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.code.toLowerCase().includes(search.toLowerCase()) ||
        item.nearestTown.toLowerCase().includes(search.toLowerCase()) ||
        item.basinName.toLowerCase().includes(search.toLowerCase());
      const matchHazard = hazardFilter === 'all' || item.hazardRating === hazardFilter;
      const matchCondition = conditionFilter === 'all' || item.lastCondition === conditionFilter;
      return matchSearch && matchHazard && matchCondition;
    });
  }, [activeDams, search, hazardFilter, conditionFilter]);

  const filteredReservoirs = React.useMemo(() => {
    return activeReservoirs.filter((item) => {
      return (
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.river.toLowerCase().includes(search.toLowerCase()) ||
        item.basinName.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [activeReservoirs, search]);

  const handleCreateDam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.basinId) return;

    try {
      await createDam({
        name: formData.name,
        code: formData.code.toUpperCase(),
        basinId: formData.basinId,
        altName: formData.altName || undefined,
        purposeId: formData.purposeId || undefined,
        categoryId: formData.categoryId || undefined,
        completionYear: formData.completionYear ? Number(formData.completionYear) : undefined,
        heightM: String(formData.heightM),
        crestLengthM: String(formData.crestLengthM),
        reservoirCapacityMcm: String(formData.reservoirCapacityMcm),
        reservoirAreaKm2: String(formData.reservoirAreaKm2),
        spillwayType: formData.spillwayType,
        spillwayCapacityM3s: String(formData.spillwayCapacityM3s),
        nearestTown: formData.nearestTown || undefined,
      });
      setIsCreateModalOpen(false);
      setFormData({
        name: '',
        code: '',
        altName: '',
        basinId: basins[0]?.id || '',
        purposeId: '',
        categoryId: '',
        completionYear: new Date().getFullYear(),
        heightM: 25,
        crestLengthM: 1200,
        reservoirCapacityMcm: 150,
        reservoirAreaKm2: 30,
        spillwayType: 'Concrete Overflow Chute',
        spillwayCapacityM3s: 500,
        hazardRating: 'significant',
        lastCondition: 'good',
        nearestTown: '',
        ownerOrg: 'Federal Ministry of Water Resources',
      });
    } catch {
      // Handled by query/toast boundary
    }
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
          Dams Infrastructure ({activeDams.length})
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
          Reservoirs & Impoundments ({activeReservoirs.length})
        </button>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder={`Search ${activeTab === 'dams' ? 'dams by name, code, basin...' : 'reservoirs by name, river, basin...'}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11 text-xs"
          />
        </div>

        {activeTab === 'dams' && (
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Select value={hazardFilter} onValueChange={setHazardFilter}>
              <SelectTrigger className="h-11 min-w-[150px] text-xs">
                <SelectValue placeholder="Hazard Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Hazards</SelectItem>
                <SelectItem value="high">High Hazard</SelectItem>
                <SelectItem value="significant">Significant</SelectItem>
                <SelectItem value="low">Low Hazard</SelectItem>
              </SelectContent>
            </Select>

            <Select value={conditionFilter} onValueChange={setConditionFilter}>
              <SelectTrigger className="h-11 min-w-[150px] text-xs">
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

      {/* Tab Panels */}
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
                    <td colSpan={8} className="py-12 text-center">
                      <div className="flex justify-center">
                        <EmptyState
                          icon={<Waves className="w-8 h-8 text-teal-600" />}
                          title="No Dams Registered"
                          description={
                            search
                              ? 'No dam assets matched your search query.'
                              : 'No dam structures have been registered in this basin yet.'
                          }
                          action={
                            canManage && !search ? (
                              <Button
                                size="sm"
                                className="bg-teal-700 hover:bg-teal-800 text-white min-h-[40px] gap-2 px-4"
                                onClick={() => setIsCreateModalOpen(true)}
                              >
                                <Plus className="w-4 h-4" />
                                Register First Dam
                              </Button>
                            ) : undefined
                          }
                        />
                      </div>
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
                    <td colSpan={7} className="py-12 text-center">
                      <div className="flex justify-center">
                        <EmptyState
                          icon={<Layers className="w-8 h-8 text-teal-600" />}
                          title="No Reservoirs Recorded"
                          description={
                            search
                              ? 'No reservoirs match your search terms.'
                              : 'No impoundment reservoirs or storage bodies are catalogued.'
                          }
                        />
                      </div>
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
                        {res.meanDepthM ?? '-'}m / {res.maxDepthM ?? '-'}m
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {res.sedimentRatio ?? '-'}
                      </td>
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
                  <span className="text-slate-400">Spillway Configuration:</span>{' '}
                  <span className="font-semibold text-slate-800">{selectedDam.spillwayType}</span>
                </div>
                <div>
                  <span className="text-slate-400">Spillway Discharge Cap:</span>{' '}
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
                  Reservoir & Basin Context
                </div>
                <div>
                  <span className="text-slate-400">Basin Catchment:</span>{' '}
                  <span className="font-semibold text-slate-800">{selectedDam.basinName}</span>
                </div>
                <div>
                  <span className="text-slate-400">Reservoir Name:</span>{' '}
                  <span className="font-semibold text-slate-800">
                    {selectedDam.reservoirName || 'Direct Impoundment'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Gross Capacity:</span>{' '}
                  <span className="font-semibold text-teal-800 font-mono">
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
                  <span className="text-slate-400">Nearest Municipality:</span>{' '}
                  <span className="font-semibold text-slate-800">{selectedDam.nearestTown}</span>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedDam(null)}
                className="min-h-[44px] text-xs"
              >
                Close Asset Details
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Dam Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Register New Dam Asset
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
                  value={formData.basinId}
                  onValueChange={(val) => setFormData({ ...formData, basinId: val })}
                >
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder="Select Basin" />
                  </SelectTrigger>
                  <SelectContent>
                    {basins.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </SelectItem>
                    ))}
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Dam Purpose</label>
                <Select
                  value={formData.purposeId}
                  onValueChange={(val) => setFormData({ ...formData, purposeId: val })}
                >
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder="Select Purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    {damPurposes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Dam Category</label>
                <Select
                  value={formData.categoryId}
                  onValueChange={(val) => setFormData({ ...formData, categoryId: val })}
                >
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {damCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <label className="block text-slate-600 font-semibold mb-1">Nearest Town</label>
                <Input
                  placeholder="e.g. Wurno, Sokoto State"
                  value={formData.nearestTown}
                  onChange={(e) => setFormData({ ...formData, nearestTown: e.target.value })}
                  className="h-10 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Spillway Type</label>
                <Input
                  placeholder="e.g. Ogee Crest"
                  value={formData.spillwayType}
                  onChange={(e) => setFormData({ ...formData, spillwayType: e.target.value })}
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
                disabled={isCreating || !formData.basinId}
                className="bg-teal-700 hover:bg-teal-800 text-white min-h-[44px] text-xs"
              >
                {isCreating ? 'Saving...' : 'Save Dam Asset'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
