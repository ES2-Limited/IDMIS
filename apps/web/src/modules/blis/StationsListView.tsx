import * as React from 'react';
import {
  Search,
  Plus,
  ArrowUpRight,
  Radio,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
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
import { ImportWizard } from '../../imports/ImportWizard';
import { useStations, useBasins } from './hooks';
import { useLookupValues } from '../core/hooks/usePlatformAdmin';

export type StationType = 'discharge' | 'rainfall' | 'water_level' | 'meteorological';
export type TelemetryQuality = 'checked' | 'raw' | 'suspect';

export interface StationRecord {
  id: string;
  code: string;
  name: string;
  basinId?: string;
  basinName: string;
  stationType: StationType;
  stationTypeLabel?: string;
  river?: string;
  latitude: number;
  longitude: number;
  installedOn: string;
  telemetryQuality: TelemetryQuality;
  status: 'active' | 'maintenance' | 'offline';
  operatorOrg: string;
  description?: string;
  version: number;
}

export function StationsListView() {
  const { currentScope } = useScope();
  const canManage = useCan('blis.irrigation.write');
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [selectedStation, setSelectedStation] = React.useState<StationRecord | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);

  // Basins and lookup values
  const { basins } = useBasins();
  const { data: stationTypeLookups = [] } = useLookupValues('station_type');

  const basinMap = React.useMemo(() => {
    const map = new Map<string, string>();
    basins.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [basins]);

  const stationTypeMap = React.useMemo(() => {
    const map = new Map<string, { code: string; label: string }>();
    stationTypeLookups.forEach((l) => map.set(l.id, { code: l.code, label: l.label }));
    return map;
  }, [stationTypeLookups]);

  // Modular custom hook for Stations
  const {
    stations: serverStations,
    createStation,
    isCreating,
  } = useStations({
    limit: 50,
  });

  const activeStations: StationRecord[] = React.useMemo(() => {
    if (serverStations && serverStations.length > 0) {
      return serverStations.map((s) => {
        const typeInfo = stationTypeMap.get(s.stationTypeId);
        const mappedType: StationType =
          typeInfo?.code === 'rainfall'
            ? 'rainfall'
            : typeInfo?.code === 'water_level'
              ? 'water_level'
              : typeInfo?.code === 'meteorological' || typeInfo?.code === 'agro_meteorological'
                ? 'meteorological'
                : 'discharge';

        let lat = 11.85;
        let lng = 8.52;
        if (s.geom && typeof s.geom === 'object' && 'coordinates' in s.geom) {
          const coords = (s.geom as { coordinates: number[] }).coordinates;
          if (Array.isArray(coords) && coords.length >= 2) {
            lng = coords[0]!;
            lat = coords[1]!;
          }
        }

        return {
          id: s.id,
          code: s.code,
          name: s.name,
          basinId: s.basinId,
          basinName: basinMap.get(s.basinId) || `Basin ${s.basinId.slice(-4)}`,
          stationType: mappedType,
          stationTypeLabel: typeInfo?.label,
          river: s.river || undefined,
          latitude: lat,
          longitude: lng,
          installedOn: s.installedOn || '2020-01-01',
          telemetryQuality: 'checked',
          status: s.isActive ? 'active' : 'offline',
          operatorOrg: 'National Hydrological Services Agency',
          description: s.description || undefined,
          version: s.version || 1,
        };
      });
    }
    return [];
  }, [serverStations, basinMap, stationTypeMap]);

  // New Station Form State
  const [formData, setFormData] = React.useState({
    name: '',
    code: '',
    basinId: '',
    stationTypeId: '',
    river: '',
    latitude: 12.0,
    longitude: 8.5,
    operatorOrg: 'HJRBDA',
    description: '',
  });

  React.useEffect(() => {
    if (basins.length > 0 && !formData.basinId) {
      setFormData((prev) => ({ ...prev, basinId: basins[0]!.id }));
    }
  }, [basins, formData.basinId]);

  React.useEffect(() => {
    if (stationTypeLookups.length > 0 && !formData.stationTypeId) {
      setFormData((prev) => ({ ...prev, stationTypeId: stationTypeLookups[0]!.id }));
    }
  }, [stationTypeLookups, formData.stationTypeId]);

  const filteredStations = React.useMemo(() => {
    return activeStations.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.code.toLowerCase().includes(search.toLowerCase()) ||
        (item.river && item.river.toLowerCase().includes(search.toLowerCase())) ||
        item.basinName.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === 'all' || item.stationType === typeFilter;
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    });
  }, [activeStations, search, typeFilter, statusFilter]);

  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.basinId || !formData.stationTypeId) return;

    try {
      await createStation({
        name: formData.name,
        code: formData.code.toUpperCase(),
        river: formData.river || undefined,
        basinId: formData.basinId,
        stationTypeId: formData.stationTypeId,
        geom: {
          type: 'Point',
          coordinates: [Number(formData.longitude), Number(formData.latitude)],
        },
        description: formData.description || undefined,
        installedOn: new Date().toISOString().split('T')[0],
      });
      setIsCreateModalOpen(false);
      setFormData({
        name: '',
        code: '',
        basinId: basins[0]?.id || '',
        stationTypeId: stationTypeLookups[0]?.id || '',
        river: '',
        latitude: 12.0,
        longitude: 8.5,
        operatorOrg: 'HJRBDA',
        description: '',
      });
    } catch {
      // Handled by query boundary
    }
  };

  const getTypeBadge = (type: StationType) => {
    switch (type) {
      case 'discharge':
        return <Badge className="bg-sky-100 text-sky-800 border-sky-300">River Discharge</Badge>;
      case 'rainfall':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Precipitation</Badge>;
      case 'water_level':
        return (
          <Badge className="bg-teal-100 text-teal-800 border-teal-300">Stage / Water Level</Badge>
        );
      case 'meteorological':
        return (
          <Badge className="bg-purple-100 text-purple-800 border-purple-300">Weather / Met</Badge>
        );
    }
  };

  const getStatusBadge = (status: StationRecord['status']) => {
    switch (status) {
      case 'active':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Operational</Badge>
        );
      case 'maintenance':
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300">Under Maintenance</Badge>
        );
      case 'offline':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-300">Offline</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Hydrological & Meteorological Stations
            </h1>
            <Badge className="bg-teal-100 text-teal-800 border-teal-200 font-mono text-xs">
              {currentScope.name || 'National Basin Scoped'}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time telemetry networks, river discharge gauging posts, precipitation sensors, and
            automated weather stations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <Button
                variant="outline"
                className="min-h-[44px] gap-2 px-4 shadow-sm text-xs"
                onClick={() => setIsImportModalOpen(true)}
              >
                <UploadCloud className="w-4 h-4" />
                Import Stations
              </Button>
              <Button
                className="bg-teal-700 hover:bg-teal-800 text-white min-h-[44px] gap-2 px-4 shadow-sm"
                onClick={() => setIsCreateModalOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Register Station
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search stations by name, code, river, basin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-11 min-w-[150px] text-xs">
              <SelectValue placeholder="Station Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="discharge">Discharge Gauges</SelectItem>
              <SelectItem value="water_level">Water Level Sensors</SelectItem>
              <SelectItem value="rainfall">Precipitation</SelectItem>
              <SelectItem value="meteorological">Meteorological (AWS)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 min-w-[150px] text-xs">
              <SelectValue placeholder="Network Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Operational</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Station Code & Name</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">River / Catchment</th>
                <th className="py-3 px-4">Basin</th>
                <th className="py-3 px-4">Coordinates</th>
                <th className="py-3 px-4">Data Quality</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <div className="flex justify-center">
                      <EmptyState
                        icon={<Radio className="w-8 h-8 text-teal-600" />}
                        title="No Hydromet Stations"
                        description={
                          search
                            ? 'No telemetry stations matching search criteria.'
                            : 'No telemetry or river gauging stations have been registered.'
                        }
                        action={
                          canManage && !search ? (
                            <Button
                              size="sm"
                              className="bg-teal-700 hover:bg-teal-800 text-white min-h-[40px] gap-2 px-4"
                              onClick={() => setIsCreateModalOpen(true)}
                            >
                              <Plus className="w-4 h-4" />
                              Register First Station
                            </Button>
                          ) : undefined
                        }
                      />
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStations.map((station) => (
                  <tr key={station.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 text-sm">{station.name}</div>
                      <div className="text-slate-400 font-mono text-[11px]">{station.code}</div>
                    </td>
                    <td className="py-3.5 px-4">{getTypeBadge(station.stationType)}</td>
                    <td className="py-3.5 px-4 font-medium text-slate-700">
                      {station.river || 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{station.basinName}</td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                      {station.latitude.toFixed(4)}°N, {station.longitude.toFixed(4)}°E
                    </td>
                    <td className="py-3.5 px-4">
                      {station.telemetryQuality === 'checked' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Checked QA
                        </span>
                      ) : station.telemetryQuality === 'raw' ? (
                        <span className="inline-flex items-center gap-1 text-sky-700 font-semibold text-[11px]">
                          <Radio className="w-3.5 h-3.5" /> Raw Telemetry
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-700 font-semibold text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5" /> Flagged Suspect
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">{getStatusBadge(station.status)}</td>
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedStation(station)}
                        className="min-h-[38px] text-xs gap-1 hover:text-teal-700"
                      >
                        Inspect
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

      {/* Station Inspector Modal */}
      {selectedStation && (
        <Dialog open={!!selectedStation} onOpenChange={(open) => !open && setSelectedStation(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge className="bg-teal-100 text-teal-800 font-mono text-xs">
                  {selectedStation.code}
                </Badge>
                {getTypeBadge(selectedStation.stationType)}
                {getStatusBadge(selectedStation.status)}
              </div>
              <DialogTitle className="text-xl font-bold text-slate-900 mt-2">
                {selectedStation.name}
              </DialogTitle>
              <p className="text-xs text-slate-500">
                Operating in {selectedStation.basinName} • Installed on{' '}
                {selectedStation.installedOn}
              </p>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[11px]">Geographic Location</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {selectedStation.latitude.toFixed(6)}° N, {selectedStation.longitude.toFixed(6)}
                    ° E
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Associated River Reach</span>
                  <span className="font-semibold text-slate-800">
                    {selectedStation.river || 'Catchment Overground'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Operating Agency</span>
                  <span className="font-semibold text-slate-800">
                    {selectedStation.operatorOrg}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Telemetry QA Status</span>
                  <span className="font-semibold text-slate-800 capitalize">
                    {selectedStation.telemetryQuality} (automated ingestion)
                  </span>
                </div>
              </div>

              {selectedStation.description && (
                <div className="text-slate-600 bg-teal-50/50 p-3 rounded border border-teal-100">
                  <span className="font-bold text-teal-900 block mb-1">
                    Telemetry Equipment Details:
                  </span>
                  {selectedStation.description}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSelectedStation(null)}
                className="min-h-[44px] text-xs"
              >
                Close Details
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Station Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Register Hydromet Telemetry Station
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateStation} className="space-y-4 py-2 text-xs">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Station Name *</label>
              <Input
                required
                placeholder="e.g. Ringim Stage Discharge Gauge"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-10 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Station Code *</label>
                <Input
                  required
                  placeholder="e.g. HYD-HJB-005"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="h-10 text-xs uppercase"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Station Type *</label>
                <Select
                  value={formData.stationTypeId}
                  onValueChange={(val) => setFormData({ ...formData, stationTypeId: val })}
                >
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {stationTypeLookups.map((st) => (
                      <SelectItem key={st.id} value={st.id}>
                        {st.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <label className="block text-slate-600 font-semibold mb-1">River Name</label>
                <Input
                  placeholder="e.g. Hadejia River"
                  value={formData.river}
                  onChange={(e) => setFormData({ ...formData, river: e.target.value })}
                  className="h-10 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Latitude (°N)</label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: Number(e.target.value) })}
                  className="h-10 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Longitude (°E)</label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: Number(e.target.value) })}
                  className="h-10 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-semibold mb-1">Description / Notes</label>
              <Input
                placeholder="Sensor model, transmission protocol, telemetry specs..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="h-10 text-xs"
              />
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
                disabled={isCreating || !formData.basinId || !formData.stationTypeId}
                className="bg-teal-700 hover:bg-teal-800 text-white min-h-[44px] text-xs"
              >
                {isCreating ? 'Saving...' : 'Save Station'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dataset Import Modal */}
      {isImportModalOpen && (
        <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">
                Import Hydromet Station Registry
              </DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <ImportWizard
                initialDatasetId="blis.station"
                onBatchCommitted={() => {
                  setIsImportModalOpen(false);
                }}
                onCancel={() => setIsImportModalOpen(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
