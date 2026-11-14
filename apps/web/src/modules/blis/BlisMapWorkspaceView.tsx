import * as React from 'react';
import {
  Layers,
  Search,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Activity,
  Info,
  Waves,
  Compass,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  UploadCloud,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  useToast,
} from '@idmis/ui';
import type { MapLayer } from '@idmis/contracts';
import { useScope } from '../../shell/ScopeContext';
import { BlisLayerUploadModal } from './BlisLayerUploadModal';
import { useMapLayers } from './hooks/useMapLayers';
import { useDams, useStations, useDamInspections } from './hooks/useWaterBodies';
import { useBasins } from './hooks/useBasins';
import { useOrganisations } from '../core/hooks/useOrganisations';

export type BlisFeatureType = 'basin' | 'dam' | 'station' | 'scheme';

export interface BlisFeature {
  id: string;
  name: string;
  code: string;
  type: BlisFeatureType;
  basinName: string;
  schemeName?: string;
  coordinates: { lat: number; lng: number };
  status: 'active' | 'fair' | 'poor' | 'critical' | 'normal' | 'suspect' | 'alert';
  details: Record<string, string | number>;
  latestInspectionDate?: string;
  latestReading?: {
    parameter: string;
    value: string;
    timestamp: string;
    quality: 'checked' | 'raw' | 'suspect';
  };
}

// Layer visibility toggles
export interface LayerVisibility {
  basins: boolean;
  dams: boolean;
  stations: boolean;
  schemes: boolean;
}

// Helper to extract numeric lat/lng from GeoJSON geometry objects or strings
function parseCoordinates(
  geom: unknown,
  fallbackLat: number,
  fallbackLng: number,
): { lat: number; lng: number } {
  if (geom && typeof geom === 'object' && 'coordinates' in geom) {
    const coords = (geom as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coords)) {
      if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        return { lng: coords[0], lat: coords[1] };
      }
      if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
        return { lng: coords[0][0], lat: coords[0][1] };
      }
      if (
        Array.isArray(coords[0]) &&
        Array.isArray(coords[0][0]) &&
        typeof coords[0][0][0] === 'number'
      ) {
        return { lng: coords[0][0][0], lat: coords[0][0][1] };
      }
    }
  } else if (typeof geom === 'string') {
    try {
      const parsed = JSON.parse(geom);
      return parseCoordinates(parsed, fallbackLat, fallbackLng);
    } catch {
      // Ignore parse failure, use fallback
    }
  }
  return { lat: fallbackLat, lng: fallbackLng };
}

export function BlisMapWorkspaceView() {
  const { currentScope } = useScope();
  const { info } = useToast();

  // Queries for live data
  const { basins = [], isLoading: isLoadingBasins } = useBasins();
  const { dams = [], isLoading: isLoadingDams } = useDams({ limit: 100 });
  const { stations = [], isLoading: isLoadingStations } = useStations({ limit: 100 });
  const { inspections = [] } = useDamInspections();
  const { organisations: schemes = [], isLoading: isLoadingSchemes } = useOrganisations({
    type: 'scheme',
  });
  const { layers: serverLayers = [], isLoading: isLoadingLayers } = useMapLayers();

  // Basin map for fast label lookups
  const basinMap = React.useMemo(() => {
    const map = new Map<string, string>();
    basins.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [basins]);

  // Inspection map by damId (latest inspection)
  const damInspectionMap = React.useMemo(() => {
    const map = new Map<
      string,
      { inspectedOn: string; meetsStandard: boolean | null | undefined }
    >();
    inspections.forEach((insp) => {
      if (!map.has(insp.damId)) {
        map.set(insp.damId, {
          inspectedOn: insp.inspectedOn,
          meetsStandard: insp.meetsStandard,
        });
      }
    });
    return map;
  }, [inspections]);

  // Assemble unified live features array
  const liveFeatures = React.useMemo<BlisFeature[]>(() => {
    const list: BlisFeature[] = [];

    // 1. Basins
    basins.forEach((b, idx) => {
      const coords = parseCoordinates(b.geom, 11.5 + (idx % 3) * 0.5, 8.5 + (idx % 4) * 0.4);
      list.push({
        id: b.id,
        name: b.name,
        code: b.code,
        type: 'basin',
        basinName: b.name,
        coordinates: coords,
        status: 'normal',
        details: {
          'Main River': b.mainRiver || 'N/A',
          'Hydrological Unit': b.hydrologicalUnit || 'N/A',
          'Alt Name': b.altName || 'N/A',
        },
      });
    });

    // 2. Dams
    dams.forEach((d, idx) => {
      const bName = basinMap.get(d.basinId) || 'Regional River Basin';
      const coords = parseCoordinates(d.geom, 11.6 + (idx % 4) * 0.3, 8.2 + (idx % 3) * 0.3);
      const insp = damInspectionMap.get(d.id);
      const meetsStandard = insp?.meetsStandard;

      const status: BlisFeature['status'] =
        meetsStandard === false ? 'poor' : meetsStandard === true ? 'active' : 'fair';

      list.push({
        id: d.id,
        name: d.name,
        code: d.code || `DAM-${d.id.slice(-4).toUpperCase()}`,
        type: 'dam',
        basinName: bName,
        coordinates: coords,
        status,
        latestInspectionDate: insp?.inspectedOn,
        details: {
          'Dam Height': d.heightM ? `${d.heightM} m` : 'N/A',
          'Crest Length': d.crestLengthM ? `${d.crestLengthM} m` : 'N/A',
          'Reservoir Capacity': d.reservoirCapacityMcm ? `${d.reservoirCapacityMcm} MCM` : 'N/A',
          'Spillway Type': d.spillwayType || 'N/A',
          'Nearest Town': d.nearestTown || 'N/A',
        },
      });
    });

    // 3. Hydromet Stations
    stations.forEach((s, idx) => {
      const bName = basinMap.get(s.basinId) || 'Regional River Basin';
      const coords = parseCoordinates(s.geom, 11.7 + (idx % 5) * 0.2, 8.6 + (idx % 4) * 0.2);
      list.push({
        id: s.id,
        name: s.name,
        code: s.code,
        type: 'station',
        basinName: bName,
        coordinates: coords,
        status: s.isActive ? 'active' : 'suspect',
        details: {
          'River Channel': s.river || 'N/A',
          'Installed Date': s.installedOn || 'N/A',
          'Active Telemetry': s.isActive ? 'Online / Transmitting' : 'Offline / Standby',
        },
        latestReading: {
          parameter: 'Operational Status',
          value: s.isActive ? 'Active Transmitting' : 'Standby / Offline',
          timestamp: s.installedOn || 'Current',
          quality: s.isActive ? 'checked' : 'suspect',
        },
      });
    });

    // 4. Irrigation Schemes
    schemes.forEach((scm, idx) => {
      list.push({
        id: scm.id,
        name: scm.name,
        code: scm.code,
        type: 'scheme',
        basinName: 'Regional Scheme Reach',
        schemeName: scm.name,
        coordinates: { lat: 11.65 + (idx % 3) * 0.4, lng: 8.55 + (idx % 3) * 0.3 },
        status: 'normal',
        details: {
          'Scheme Code': scm.code,
          'Authority / Operator': 'Federal Ministry of Water Resources',
        },
      });
    });

    return list;
  }, [basins, dams, stations, schemes, basinMap, damInspectionMap]);

  // Map view controls
  const [isFullscreen, setIsFullscreen] = React.useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = React.useState<number>(8);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [selectedFeature, setSelectedFeature] = React.useState<BlisFeature | null>(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = React.useState<string>('all');

  // Layer visibility toggles
  const [layers, setLayers] = React.useState<LayerVisibility>({
    basins: true,
    dams: true,
    stations: true,
    schemes: true,
  });

  // Track visibility of custom uploaded layers
  const [customLayersVisibility, setCustomLayersVisibility] = React.useState<
    Record<string, boolean>
  >({});
  const [isUploadModalOpen, setIsUploadModalOpen] = React.useState(false);

  // Set default selected feature when data loads
  React.useEffect(() => {
    if (!selectedFeature && liveFeatures.length > 0) {
      // Prefer a dam, otherwise first feature
      const damFeature = liveFeatures.find((f) => f.type === 'dam');
      setSelectedFeature(damFeature || liveFeatures[0]!);
    }
  }, [liveFeatures, selectedFeature]);

  const toggleLayer = (layer: keyof LayerVisibility) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const toggleCustomLayer = (id: string) => {
    setCustomLayersVisibility((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id],
    }));
  };

  // Filtered features matching scope, search, and layer visibility
  const filteredFeatures = React.useMemo(() => {
    return liveFeatures.filter((f) => {
      // Layer toggle check
      if (f.type === 'basin' && !layers.basins) return false;
      if (f.type === 'dam' && !layers.dams) return false;
      if (f.type === 'station' && !layers.stations) return false;
      if (f.type === 'scheme' && !layers.schemes) return false;

      // Type selector
      if (selectedTypeFilter !== 'all' && f.type !== selectedTypeFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          f.name.toLowerCase().includes(q) ||
          f.code.toLowerCase().includes(q) ||
          f.basinName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [liveFeatures, layers, selectedTypeFilter, searchQuery]);

  const totalDamsCount = liveFeatures.filter((f) => f.type === 'dam').length;
  const totalStationsCount = liveFeatures.filter((f) => f.type === 'station').length;
  const totalBasinsCount = liveFeatures.filter((f) => f.type === 'basin').length;
  const totalSchemesCount = liveFeatures.filter((f) => f.type === 'scheme').length;

  const isDataLoading =
    isLoadingBasins || isLoadingDams || isLoadingStations || isLoadingSchemes || isLoadingLayers;

  return (
    <div className="space-y-4 animate-in fade-in-50">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Compass className="h-3 w-3 text-teal-700" /> BLIS GIS Map Workspace
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-bold text-slate-600">
              Scope: {currentScope.name || 'All Basins & Dams'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Basin & Water Infrastructure GIS Workspace
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Vector tiles for river basins, dams (coloured by inspection rating), and hydromet
            stations (coloured by telemetry status).
          </p>
        </div>

        {/* Legend Shortcuts & Upload Button */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-teal-700 hover:bg-teal-800 text-white min-h-[38px] text-xs font-bold gap-1.5 shadow-xs"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Upload Layer
          </Button>

          <Badge
            variant="outline"
            className="text-[11px] font-semibold border-slate-300 gap-1.5 py-1"
          >
            <span className="h-2 w-2 rounded-full bg-blue-500" /> Basins ({totalBasinsCount})
          </Badge>
          <Badge
            variant="outline"
            className="text-[11px] font-semibold border-slate-300 gap-1.5 py-1"
          >
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Dams ({totalDamsCount})
          </Badge>
          <Badge
            variant="outline"
            className="text-[11px] font-semibold border-slate-300 gap-1.5 py-1"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Stations ({totalStationsCount})
          </Badge>
          <Badge
            variant="outline"
            className="text-[11px] font-semibold border-slate-300 gap-1.5 py-1"
          >
            <span className="h-2 w-2 rounded-full bg-teal-500" /> Schemes ({totalSchemesCount})
          </Badge>
        </div>
      </div>

      {/* Main Split Grid: Left Sidebar & Right GIS Canvas */}
      <div className={`grid gap-4 ${isFullscreen ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-12'}`}>
        {/* Left Column: Layers Panel, Filters & Record Browser */}
        {!isFullscreen && (
          <div className="lg:col-span-4 space-y-3">
            {/* Search & Type Filter */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Filter dam, basin or gauge..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-8.5 bg-slate-50"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] font-bold text-slate-500">Filter Feature:</span>
                <div className="w-40">
                  <Select
                    value={selectedTypeFilter}
                    onValueChange={(val) => setSelectedTypeFilter(val)}
                  >
                    <SelectTrigger className="h-7.5 text-xs font-medium bg-slate-50">
                      <SelectValue placeholder="All Features" />
                    </SelectTrigger>
                    <SelectContent className="bg-white shadow-xl">
                      <SelectItem value="all" className="text-xs py-1.5">
                        All Features ({liveFeatures.length})
                      </SelectItem>
                      <SelectItem value="dam" className="text-xs py-1.5">
                        Dams & Reservoirs ({totalDamsCount})
                      </SelectItem>
                      <SelectItem value="station" className="text-xs py-1.5">
                        Hydromet Stations ({totalStationsCount})
                      </SelectItem>
                      <SelectItem value="basin" className="text-xs py-1.5">
                        River Basins ({totalBasinsCount})
                      </SelectItem>
                      <SelectItem value="scheme" className="text-xs py-1.5">
                        Command Areas ({totalSchemesCount})
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Layer Visibility Toggle Panel */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-teal-700" /> Vector Layer Toggles
                </span>
                <span className="text-[10px] text-slate-400 font-mono">EPSG:4326 (WGS84)</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => toggleLayer('basins')}
                  className={`p-2 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                    layers.basins
                      ? 'border-blue-300 bg-blue-50/60 text-blue-950 font-bold'
                      : 'border-slate-200 text-slate-400 opacity-60'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> River Basins
                  </span>
                  {layers.basins ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>

                <button
                  type="button"
                  onClick={() => toggleLayer('dams')}
                  className={`p-2 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                    layers.dams
                      ? 'border-amber-300 bg-amber-50/60 text-amber-950 font-bold'
                      : 'border-slate-200 text-slate-400 opacity-60'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Dams & Safety
                  </span>
                  {layers.dams ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>

                <button
                  type="button"
                  onClick={() => toggleLayer('stations')}
                  className={`p-2 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                    layers.stations
                      ? 'border-emerald-300 bg-emerald-50/60 text-emerald-950 font-bold'
                      : 'border-slate-200 text-slate-400 opacity-60'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Hydromet
                  </span>
                  {layers.stations ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>

                <button
                  type="button"
                  onClick={() => toggleLayer('schemes')}
                  className={`p-2 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                    layers.schemes
                      ? 'border-teal-300 bg-teal-50/60 text-teal-950 font-bold'
                      : 'border-slate-200 text-slate-400 opacity-60'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-teal-500" /> Command Areas
                  </span>
                  {layers.schemes ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
              </div>

              {/* Uploaded Server Vector Layers Sub-Panel */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between pb-1.5">
                  <span className="text-[11px] font-bold text-slate-700">
                    Uploaded GIS Layers ({serverLayers.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(true)}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer"
                  >
                    <UploadCloud className="w-3 h-3" /> Add Layer
                  </button>
                </div>

                {serverLayers.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic py-1">
                    No custom spatial layers uploaded yet.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {serverLayers.map((layer) => {
                      const isVisible = customLayersVisibility[layer.id] ?? true;
                      return (
                        <div
                          key={layer.id}
                          onClick={() => toggleCustomLayer(layer.id)}
                          className={`p-2 rounded-xl border text-[11px] flex items-center justify-between cursor-pointer transition-all ${
                            isVisible
                              ? 'border-purple-200 bg-purple-50/60 text-purple-950 font-semibold'
                              : 'border-slate-200 text-slate-400 opacity-60'
                          }`}
                        >
                          <div className="truncate pr-1">
                            <div className="truncate">{layer.name}</div>
                            <div className="text-[10px] text-slate-400 font-normal">
                              {layer.featureCount ?? 0} features · {layer.type || 'Vector'}
                            </div>
                          </div>
                          {isVisible ? (
                            <Eye className="h-3 w-3 shrink-0 text-purple-700" />
                          ) : (
                            <EyeOff className="h-3 w-3 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Feature Records List Browser */}
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {isDataLoading && liveFeatures.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  Loading spatial records...
                </div>
              ) : filteredFeatures.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No matching spatial records found.
                </div>
              ) : (
                filteredFeatures.map((f) => {
                  const isSelected = selectedFeature?.id === f.id;
                  return (
                    <div
                      key={f.id}
                      onClick={() => setSelectedFeature(f)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-teal-600 bg-teal-50/40 shadow-sm ring-1 ring-teal-600/30'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`h-2 w-2 rounded-full shrink-0 ${
                                f.type === 'dam'
                                  ? f.status === 'active'
                                    ? 'bg-emerald-500'
                                    : f.status === 'fair'
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  : f.type === 'station'
                                    ? f.status === 'active'
                                      ? 'bg-emerald-500'
                                      : 'bg-amber-500'
                                    : 'bg-blue-500'
                              }`}
                            />
                            <span className="font-mono font-bold text-xs text-slate-900 truncate">
                              {f.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {f.basinName}
                          </p>
                          {f.latestReading && (
                            <p className="text-[10px] text-teal-700 font-mono mt-1 font-semibold">
                              Latest: {f.latestReading.value}
                            </p>
                          )}
                          {f.latestInspectionDate && (
                            <p className="text-[10px] text-amber-800 font-medium mt-0.5">
                              Inspected: {f.latestInspectionDate}
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono">
                            {f.code}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Right Column: Interactive Map Canvas Workspace */}
        <div className={isFullscreen ? 'col-span-1' : 'lg:col-span-8'}>
          <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm bg-white h-[680px] flex flex-col">
            <CardHeader className="py-2.5 px-4 border-b border-slate-100 flex flex-row items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-teal-700" />
                <CardTitle className="text-xs font-bold text-slate-800">
                  Vector-Tile Basin GIS Canvas
                </CardTitle>
                <Badge
                  variant="outline"
                  className="text-[10px] bg-white border-slate-200 text-slate-600 font-mono"
                >
                  Scale: 1:{(1000000 / zoomLevel).toFixed(0)} · Zoom {zoomLevel}x
                </Badge>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setZoomLevel((z) => Math.min(z + 1, 14))}
                  className="h-7 w-7 p-0 cursor-pointer"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setZoomLevel((z) => Math.max(z - 1, 4))}
                  className="h-7 w-7 p-0 cursor-pointer"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setZoomLevel(8);
                    if (liveFeatures.length > 0) {
                      setSelectedFeature(liveFeatures[0]!);
                    }
                  }}
                  className="h-7 w-7 p-0 cursor-pointer"
                  aria-label="Reset map"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 ml-1 cursor-pointer"
                  onClick={() => setIsFullscreen((p) => !p)}
                  aria-label="Toggle map size"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </CardHeader>

            {/* Interactive GIS Canvas Area */}
            <div className="flex-1 relative bg-slate-950 overflow-hidden flex items-center justify-center">
              {/* Geodesic Grid Vector Grid Background */}
              <div className="absolute inset-0 opacity-30 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />

              {/* Waterway Vector Polyline graphic simulation */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40">
                <path
                  d="M 50 150 Q 180 200, 320 280 T 600 360 T 900 420"
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="3.5"
                  strokeDasharray="4 2"
                />
                <path
                  d="M 120 40 Q 250 140, 420 220 T 700 310"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                />
              </svg>

              {/* Interactive On-Canvas Spatial Markers */}
              <div className="relative z-10 w-full h-full p-8 flex items-center justify-center">
                {/* Floating Map Feature Nodes Container */}
                <div className="relative w-[500px] h-[380px] border border-sky-500/20 rounded-3xl bg-sky-950/20 backdrop-blur-xs flex items-center justify-center overflow-hidden">
                  {filteredFeatures.length === 0 ? (
                    <div className="text-center text-xs text-sky-300">
                      <Compass className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No active features to display on canvas.
                    </div>
                  ) : (
                    filteredFeatures.slice(0, 8).map((feat, idx) => {
                      // Project lat/lng or distribute on canvas
                      const total = Math.min(filteredFeatures.length, 8);
                      const angle = (idx / total) * 2 * Math.PI;
                      const radiusX = 160;
                      const radiusY = 120;
                      const leftPos = 250 + Math.cos(angle) * radiusX;
                      const topPos = 190 + Math.sin(angle) * radiusY;

                      const isSelected = selectedFeature?.id === feat.id;

                      return (
                        <button
                          key={feat.id}
                          type="button"
                          style={{ left: `${leftPos}px`, top: `${topPos}px` }}
                          onClick={() => setSelectedFeature(feat)}
                          className={`absolute transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer transition-transform ${
                            isSelected ? 'scale-110 z-20' : 'hover:scale-105 z-10'
                          }`}
                        >
                          <div className="relative flex items-center justify-center">
                            {isSelected && (
                              <span className="absolute h-9 w-9 rounded-full bg-teal-400/30 animate-ping" />
                            )}
                            <div
                              className={`h-8 w-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold ${
                                feat.type === 'dam'
                                  ? feat.status === 'active'
                                    ? 'bg-emerald-600'
                                    : feat.status === 'fair'
                                      ? 'bg-amber-600'
                                      : 'bg-rose-600'
                                  : feat.type === 'station'
                                    ? feat.status === 'active'
                                      ? 'bg-teal-500'
                                      : 'bg-amber-600'
                                    : feat.type === 'scheme'
                                      ? 'bg-cyan-600'
                                      : 'bg-blue-600'
                              }`}
                            >
                              {feat.type === 'dam' ? (
                                <Waves className="h-4 w-4" />
                              ) : feat.type === 'station' ? (
                                <Activity className="h-3.5 w-3.5" />
                              ) : feat.type === 'scheme' ? (
                                <Layers className="h-3.5 w-3.5" />
                              ) : (
                                <Compass className="h-3.5 w-3.5" />
                              )}
                            </div>
                          </div>
                          <span className="mt-1 px-2 py-0.5 rounded-md bg-slate-900/90 text-[10px] font-bold text-white border border-slate-700 block whitespace-nowrap shadow-md max-w-[130px] truncate">
                            {feat.name}
                          </span>
                        </button>
                      );
                    })
                  )}

                  {/* Active Vector Layers HUD watermark */}
                  {serverLayers.length > 0 && (
                    <div className="absolute bottom-4 right-4 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-left pointer-events-none">
                      <span className="text-[10px] font-mono text-purple-300 font-bold block">
                        {serverLayers.length} Vector Layer(s) Active
                      </span>
                      <span className="text-[9px] text-slate-400">
                        {serverLayers.reduce((acc, l) => acc + (l.featureCount ?? 0), 0)} server
                        features loaded
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Floating Spatial HUD Overlay */}
              <div className="absolute top-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md p-3.5 rounded-2xl border border-slate-800 text-white text-xs space-y-1.5 shadow-xl max-w-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-teal-400 text-xs">Spatial Canvas HUD</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <div className="text-[11px] text-slate-300">
                  Active Basin:{' '}
                  <span className="font-bold text-white">
                    {selectedFeature?.basinName || 'All Basins'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-2 pt-0.5">
                  <span>Lat: {selectedFeature?.coordinates.lat.toFixed(4) ?? '11.5000'}°N</span>
                  <span>Lng: {selectedFeature?.coordinates.lng.toFixed(4) ?? '8.5000'}°E</span>
                </div>
              </div>

              {/* Map Scale & Projection Legend */}
              <div className="absolute bottom-4 left-4 z-20 bg-slate-900/80 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400">
                Projection: EPSG:4326 (WGS84) · Scale bar: 10 km
              </div>
            </div>

            {/* Bottom Details Drawer for Selected Feature */}
            {selectedFeature && (
              <div className="p-4 border-t border-slate-200 bg-white grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Feature Name & Type
                  </span>
                  <span className="font-black text-slate-900 text-sm block truncate">
                    {selectedFeature.name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 font-bold uppercase">
                    {selectedFeature.type} · {selectedFeature.code}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Catchment / Basin
                  </span>
                  <span className="font-bold text-slate-800 block truncate">
                    {selectedFeature.basinName}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {selectedFeature.schemeName || 'Regional Catchment'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Condition / Telemetry
                  </span>
                  {selectedFeature.latestReading ? (
                    <div>
                      <span className="font-mono font-bold text-teal-800 block">
                        {selectedFeature.latestReading.value}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {selectedFeature.latestReading.timestamp}
                      </span>
                    </div>
                  ) : selectedFeature.latestInspectionDate ? (
                    <div>
                      <span
                        className={`font-bold block ${
                          selectedFeature.status === 'active'
                            ? 'text-emerald-700'
                            : selectedFeature.status === 'fair'
                              ? 'text-amber-800'
                              : 'text-rose-700'
                        }`}
                      >
                        Status: {selectedFeature.status.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Inspected: {selectedFeature.latestInspectionDate}
                      </span>
                    </div>
                  ) : (
                    <span className="font-bold text-slate-700">Operational</span>
                  )}
                </div>

                <div className="flex items-center justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      info(
                        `${selectedFeature.name} Specifications`,
                        `Basin: ${selectedFeature.basinName} · Code: ${selectedFeature.code} · Status: ${selectedFeature.status}`,
                      );
                    }}
                    className="text-xs font-bold gap-1 text-teal-800 border-teal-200 bg-teal-50/50 hover:bg-teal-100/60 cursor-pointer"
                  >
                    <Info className="h-3.5 w-3.5" /> Full Asset Specs
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Layer Upload Modal */}
      <BlisLayerUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onLayerSaved={(newLayer: MapLayer) => {
          setCustomLayersVisibility((prev) => ({ ...prev, [newLayer.id]: true }));
        }}
      />
    </div>
  );
}
