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
} from '@idmis/ui';
import { useCan } from '../../auth';
import { useScope } from '../../shell/ScopeContext';
import { ImportWizard } from '../../imports/ImportWizard';
import { useStations } from './hooks';

export type StationType = 'discharge' | 'rainfall' | 'water_level' | 'meteorological';
export type TelemetryQuality = 'checked' | 'raw' | 'suspect';

export interface StationRecord {
  id: string;
  code: string;
  name: string;
  basinName: string;
  stationType: StationType;
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

export const mockStations: StationRecord[] = [
  {
    id: '018f3a70-0003-7000-8000-000000000301',
    code: 'HYD-HJB-001',
    name: 'Wudil River Gauging Station',
    basinName: "Hadejia-Jama'are River Basin",
    stationType: 'discharge',
    river: 'Hadejia River (Wudil Reach)',
    latitude: 11.8124,
    longitude: 8.8412,
    installedOn: '2018-04-12',
    telemetryQuality: 'checked',
    status: 'active',
    operatorOrg: 'HJRBDA / NIHSA',
    description:
      'Acoustic Doppler Current Profiler (ADCP) telemetry station transmitting 15-min stage-discharge.',
    version: 1,
  },
  {
    id: '018f3a70-0003-7000-8000-000000000302',
    code: 'HYD-HJB-002',
    name: 'Hadejia Wetland Inflow Gauge',
    basinName: "Hadejia-Jama'are River Basin",
    stationType: 'water_level',
    river: 'Hadejia River',
    latitude: 12.4501,
    longitude: 10.0418,
    installedOn: '2019-09-20',
    telemetryQuality: 'raw',
    status: 'active',
    operatorOrg: 'HJRBDA',
    description: 'Radar stage sensor monitoring wetland inflow and ecological flood recession.',
    version: 1,
  },
  {
    id: '018f3a70-0003-7000-8000-000000000303',
    code: 'MET-HJB-001',
    name: 'Kadawa Agro-Meteorological Station',
    basinName: "Hadejia-Jama'are River Basin",
    stationType: 'meteorological',
    river: 'N/A',
    latitude: 11.642,
    longitude: 8.451,
    installedOn: '2016-11-05',
    telemetryQuality: 'checked',
    status: 'active',
    operatorOrg: 'IAR / KRIS Scheme',
    description:
      'Full weather station: solar radiation, air temp, humidity, wind velocity, pan evapotranspiration.',
    version: 2,
  },
  {
    id: '018f3a70-0003-7000-8000-000000000304',
    code: 'HYD-SRB-001',
    name: 'Bakolori Spillway Tailrace Station',
    basinName: 'Sokoto-Rima River Basin',
    stationType: 'discharge',
    river: 'Sokoto River',
    latitude: 12.512,
    longitude: 5.891,
    installedOn: '2020-02-14',
    telemetryQuality: 'checked',
    status: 'active',
    operatorOrg: 'SRRBDA',
    description: 'Calibrated stilling well and pressure transducer measuring dam outflow.',
    version: 1,
  },
  {
    id: '018f3a70-0003-7000-8000-000000000305',
    code: 'HYD-SRB-002',
    name: 'Goronyo Hydromet Monitoring Point',
    basinName: 'Sokoto-Rima River Basin',
    stationType: 'water_level',
    river: 'Rima River',
    latitude: 13.441,
    longitude: 5.682,
    installedOn: '2021-08-30',
    telemetryQuality: 'suspect',
    status: 'maintenance',
    operatorOrg: 'SRRBDA',
    description: 'Submerged pressure logger undergoing recalibration following high silt deposit.',
    version: 2,
  },
  {
    id: '018f3a70-0003-7000-8000-000000000306',
    code: 'RNF-HJB-003',
    name: 'Tiga Automatic Tipping Bucket Rain Gauge',
    basinName: "Hadejia-Jama'are River Basin",
    stationType: 'rainfall',
    river: 'Kano River Basin',
    latitude: 11.428,
    longitude: 8.614,
    installedOn: '2017-06-18',
    telemetryQuality: 'checked',
    status: 'active',
    operatorOrg: 'HJRBDA',
    description: '0.2mm sensitivity dual-chamber tipping bucket telemetry rain gauge.',
    version: 1,
  },
];

export function StationsListView() {
  const { currentScope } = useScope();
  const canManage = useCan('blis.irrigation.write');
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [selectedStation, setSelectedStation] = React.useState<StationRecord | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);

  // Modular custom hook for Stations
  const { stations: serverStations, createStation } = useStations({
    limit: 50,
  });

  const activeStations: StationRecord[] = React.useMemo(() => {
    if (serverStations && serverStations.length > 0) {
      return serverStations.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        basinName: s.basinId ? `Basin ${s.basinId.slice(-4)}` : "Hadejia-Jama'are River Basin",
        stationType: 'discharge',
        river: s.river || 'Main River',
        latitude:
          s.geom &&
          typeof s.geom === 'object' &&
          'coordinates' in s.geom &&
          Array.isArray((s.geom as { coordinates: number[] }).coordinates)
            ? (s.geom as { coordinates: number[] }).coordinates[1]!
            : 11.85,
        longitude:
          s.geom &&
          typeof s.geom === 'object' &&
          'coordinates' in s.geom &&
          Array.isArray((s.geom as { coordinates: number[] }).coordinates)
            ? (s.geom as { coordinates: number[] }).coordinates[0]!
            : 8.52,
        installedOn: s.installedOn || '2020-01-01',
        telemetryQuality: 'checked',
        status: s.isActive ? 'active' : 'offline',
        operatorOrg: 'HJRBDA',
        description: s.description || undefined,
        version: s.version || 1,
      }));
    }
    return [];
  }, [serverStations]);

  // New Station Form State
  const [formData, setFormData] = React.useState({
    name: '',
    code: '',
    basinName: "Hadejia-Jama'are River Basin",
    stationType: 'discharge' as StationType,
    river: '',
    latitude: 12.0,
    longitude: 8.5,
    operatorOrg: 'HJRBDA',
    description: '',
  });

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
    const newStation: StationRecord = {
      id: `station-${Date.now()}`,
      code: formData.code.toUpperCase(),
      name: formData.name,
      basinName: formData.basinName,
      stationType: formData.stationType,
      river: formData.river || undefined,
      latitude: Number(formData.latitude),
      longitude: Number(formData.longitude),
      installedOn: new Date().toISOString().split('T')[0],
      telemetryQuality: 'raw',
      status: 'active',
      operatorOrg: formData.operatorOrg,
      description: formData.description,
      version: 1,
    };
    try {
      await createStation({
        name: newStation.name,
        code: newStation.code,
        river: newStation.river,
        basinId: '018f3a5e-0000-7000-8000-000000000001',
        stationTypeId: '018f3a5e-0002-7000-8000-000000000001',
        geom: {
          type: 'Point',
          coordinates: [newStation.longitude, newStation.latitude],
        },
      });
      setIsCreateModalOpen(false);
    } catch {
      setIsCreateModalOpen(false);
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
              {currentScope.name || 'National Basin Network'}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Telemetry stations transmitting water stage, discharge rates, rainfall and
            meteorological time-series.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <Button
                variant="outline"
                className="min-h-[44px] gap-2 px-3 text-xs"
                onClick={() => setIsImportModalOpen(true)}
              >
                <UploadCloud className="w-4 h-4 text-slate-600" />
                Batch Import CSV
              </Button>
              <Button
                className="bg-teal-700 hover:bg-teal-800 text-white min-h-[44px] gap-2 px-4 shadow-sm"
                onClick={() => setIsCreateModalOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Add Hydromet Station
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
            placeholder="Search station by name, code, river..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-11 min-w-[140px] text-xs">
              <SelectValue placeholder="Station Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="discharge">Discharge Gauges</SelectItem>
              <SelectItem value="rainfall">Rainfall Stations</SelectItem>
              <SelectItem value="water_level">Water Level</SelectItem>
              <SelectItem value="meteorological">Weather Stations</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 min-w-[140px] text-xs">
              <SelectValue placeholder="Status" />
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
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No stations matching search criteria.
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
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 block">Basin Authority:</span>
                  <span className="font-semibold text-slate-800">{selectedStation.basinName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Operating Entity:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedStation.operatorOrg}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">River Channel:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedStation.river || 'None / Meteorological'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Installed Date:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedStation.installedOn}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Geographic Coordinates:</span>
                  <span className="font-mono text-slate-800">
                    {selectedStation.latitude}° N, {selectedStation.longitude}° E
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Telemetry Quality Flag:</span>
                  <span className="font-semibold text-slate-800 uppercase">
                    {selectedStation.telemetryQuality}
                  </span>
                </div>
              </div>

              {selectedStation.description && (
                <div className="p-3 bg-teal-50/50 rounded-lg border border-teal-100 text-slate-700">
                  <div className="font-bold text-teal-900 mb-1">
                    Equipment Description & Sensors:
                  </div>
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
                  value={formData.stationType}
                  onValueChange={(val: StationType) =>
                    setFormData({ ...formData, stationType: val })
                  }
                >
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discharge">Discharge Gauge</SelectItem>
                    <SelectItem value="water_level">Water Level Sensor</SelectItem>
                    <SelectItem value="rainfall">Rainfall Bucket</SelectItem>
                    <SelectItem value="meteorological">Weather Station</SelectItem>
                  </SelectContent>
                </Select>
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
                Save Station Asset
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Batch Import Modal */}
      {isImportModalOpen && (
        <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">
                Batch Import Hydromet Stations
              </DialogTitle>
            </DialogHeader>
            <ImportWizard
              initialDatasetId="blis.station"
              onCancel={() => setIsImportModalOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
