import * as React from 'react';
import {
  Layers,
  Search,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Activity,
  AlertTriangle,
  Info,
  Waves,
  Compass,
  ZoomIn,
  ZoomOut,
  RotateCcw,
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
} from '@idmis/ui';
import { useScope } from '../../shell/ScopeContext';

export type BlisFeatureType = 'basin' | 'dam' | 'station' | 'scheme' | 'plot';

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
  plots: boolean;
}

// Seeded BLIS GeoJSON / Map features representing Nigerian River Basin Authorities
const SEEDED_FEATURES: BlisFeature[] = [
  // Basins
  {
    id: 'bsn-1',
    name: 'Hadejia-Jama’are River Basin',
    code: 'HJRB-01',
    type: 'basin',
    basinName: 'Hadejia-Jama’are River Basin',
    coordinates: { lat: 12.18, lng: 9.54 },
    status: 'normal',
    details: {
      'Catchment Area': '45,000 km²',
      'River Length': '380 km',
      'Operating Authority': 'HJRBDA Kano',
      'Major Reservoirs': 'Tiga Dam, Challawa Gorge Dam',
    },
  },
  {
    id: 'bsn-2',
    name: 'Sokoto-Rima River Basin',
    code: 'SRRB-02',
    type: 'basin',
    basinName: 'Sokoto-Rima River Basin',
    coordinates: { lat: 13.06, lng: 5.24 },
    status: 'normal',
    details: {
      'Catchment Area': '32,500 km²',
      'River Length': '320 km',
      'Operating Authority': 'SRRBDA Sokoto',
      'Major Reservoirs': 'Bakolori Dam, Goronyo Dam',
    },
  },

  // Dams (coloured by last inspection condition)
  {
    id: 'dam-1',
    name: 'Tiga Dam',
    code: 'DAM-TIG-01',
    type: 'dam',
    basinName: 'Hadejia-Jama’are River Basin',
    schemeName: 'Kano River Irrigation Scheme',
    coordinates: { lat: 11.43, lng: 8.42 },
    status: 'active', // 'good'
    latestInspectionDate: '2026-02-15',
    details: {
      'Dam Height': '48.0 m',
      'Crest Length': '6,000 m',
      'Reservoir Capacity': '1,428 MCM',
      'Hazard Classification': 'High Hazard (Downstream Communities)',
      'Last Component Rating': 'Good (Spillway cleared, rip-rap intact)',
      'Meets Dam Safety Standard': 'YES (FMWR Certified)',
    },
  },
  {
    id: 'dam-2',
    name: 'Challawa Gorge Dam',
    code: 'DAM-CHL-02',
    type: 'dam',
    basinName: 'Hadejia-Jama’are River Basin',
    schemeName: 'Kano River Irrigation Scheme',
    coordinates: { lat: 11.72, lng: 8.03 },
    status: 'fair',
    latestInspectionDate: '2026-03-05',
    details: {
      'Dam Height': '42.0 m',
      'Crest Length': '7,800 m',
      'Reservoir Capacity': '972 MCM',
      'Hazard Classification': 'High Hazard',
      'Last Component Rating': 'Fair (Hydromechanical gate seal seepage)',
      'Meets Dam Safety Standard': 'Conditional Compliance',
    },
  },
  {
    id: 'dam-3',
    name: 'Bakolori Dam',
    code: 'DAM-BAK-03',
    type: 'dam',
    basinName: 'Sokoto-Rima River Basin',
    schemeName: 'Bakolori Irrigation Scheme',
    coordinates: { lat: 12.52, lng: 5.91 },
    status: 'poor', // 'poor/critical'
    latestInspectionDate: '2026-01-28',
    details: {
      'Dam Height': '53.0 m',
      'Crest Length': '5,300 m',
      'Reservoir Capacity': '450 MCM',
      'Hazard Classification': 'High Hazard',
      'Last Component Rating': 'Poor (Left embankment crest rutting, drain clogged)',
      'Next Due Inspection': '2026-07-28 (Urgent Action Plan)',
    },
  },

  // Hydromet Stations (coloured by latest transmission / quality status)
  {
    id: 'stn-1',
    name: 'Wudil River Discharge Gauging Station',
    code: 'STN-WDL-01',
    type: 'station',
    basinName: 'Hadejia-Jama’are River Basin',
    schemeName: 'Kano River Scheme Reach',
    coordinates: { lat: 11.81, lng: 8.84 },
    status: 'active', // verified
    details: {
      'Station Type': 'Hydrological / Discharge Level',
      'Telemetry Mode': 'GPRS 15-min Automated Logger',
      'River Channel': 'Hadejia River (Mainstem)',
      'Installed Year': '2019 (Refurbished 2024)',
    },
    latestReading: {
      parameter: 'River Stage (Water Level)',
      value: '3.42 m (48.5 m³/s flow)',
      timestamp: '2026-04-02 11:45',
      quality: 'checked',
    },
  },
  {
    id: 'stn-2',
    name: 'Kadawa Agro-Meteorological Station',
    code: 'STN-KDW-02',
    type: 'station',
    basinName: 'Hadejia-Jama’are River Basin',
    schemeName: 'Kano River Scheme',
    coordinates: { lat: 11.65, lng: 8.52 },
    status: 'active',
    details: {
      'Station Type': 'Agro-Meteorological (AWS)',
      Sensors: 'Air Temp, Solar Radiation, Humidity, Soil Moisture',
      'Operating Authority': 'KRS Field Station',
    },
    latestReading: {
      parameter: 'Air Temp & Solar Radiation',
      value: '33.4°C · 840 W/m²',
      timestamp: '2026-04-02 12:00',
      quality: 'checked',
    },
  },
  {
    id: 'stn-3',
    name: 'Talata Mafara River Level Gauge',
    code: 'STN-TLM-03',
    type: 'station',
    basinName: 'Sokoto-Rima River Basin',
    schemeName: 'Bakolori Scheme',
    coordinates: { lat: 12.58, lng: 6.07 },
    status: 'suspect',
    details: {
      'Station Type': 'Water Level & Rainfall',
      'Telemetry Mode': 'Solar Satellite Logger',
      'Quality Status': 'Flagged Sensor Drift (+0.85m offset detected)',
    },
    latestReading: {
      parameter: 'River Gauge Level',
      value: '5.10 m (Suspect Reading)',
      timestamp: '2026-04-02 10:15',
      quality: 'suspect',
    },
  },

  // Irrigation Schemes & Command Areas
  {
    id: 'scm-1',
    name: 'Kano River Irrigation Scheme Command Area',
    code: 'SCM-KRIS',
    type: 'scheme',
    basinName: 'Hadejia-Jama’are River Basin',
    schemeName: 'Kano River Irrigation Scheme',
    coordinates: { lat: 11.68, lng: 8.53 },
    status: 'normal',
    details: {
      'Total Developed Area': '22,000 ha',
      'Gravity Canal Length': '142 km',
      'Beneficiary Farmers': '42,000 active smallholders',
      'Primary Crops': 'Rice, Tomato, Maize, Wheat',
    },
  },
  {
    id: 'scm-2',
    name: 'Bakolori Irrigation Scheme Command Area',
    code: 'SCM-BIS',
    type: 'scheme',
    basinName: 'Sokoto-Rima River Basin',
    schemeName: 'Bakolori Irrigation Scheme',
    coordinates: { lat: 12.54, lng: 6.02 },
    status: 'normal',
    details: {
      'Total Developed Area': '23,000 ha',
      'Distribution System': 'Sprinkler & Surface Lateral',
      'Beneficiary Farmers': '31,500 smallholders',
      'Primary Crops': 'Rice, Onion, Garlic, Pepper',
    },
  },
];

export function BlisMapWorkspaceView() {
  const { currentScope } = useScope();

  // Map view controls
  const [isFullscreen, setIsFullscreen] = React.useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = React.useState<number>(8);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [selectedFeature, setSelectedFeature] = React.useState<BlisFeature | null>(
    SEEDED_FEATURES[2]!,
  ); // Default: Tiga Dam
  const [selectedTypeFilter, setSelectedTypeFilter] = React.useState<string>('all');

  // Layer visibility toggles
  const [layers, setLayers] = React.useState<LayerVisibility>({
    basins: true,
    dams: true,
    stations: true,
    schemes: true,
    plots: true,
  });

  const toggleLayer = (layer: keyof LayerVisibility) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  // Filtered features matching scope, search, and layer visibility
  const filteredFeatures = React.useMemo(() => {
    return SEEDED_FEATURES.filter((f) => {
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
  }, [layers, selectedTypeFilter, searchQuery]);

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

        {/* Legend Shortcuts */}
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-[11px] font-semibold border-slate-300 gap-1.5 py-1"
          >
            <span className="h-2 w-2 rounded-full bg-blue-500" /> Basins
          </Badge>
          <Badge
            variant="outline"
            className="text-[11px] font-semibold border-slate-300 gap-1.5 py-1"
          >
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Dams (Inspected)
          </Badge>
          <Badge
            variant="outline"
            className="text-[11px] font-semibold border-slate-300 gap-1.5 py-1"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Stations (Active)
          </Badge>
          <Badge
            variant="outline"
            className="text-[11px] font-semibold border-slate-300 gap-1.5 py-1"
          >
            <span className="h-2 w-2 rounded-full bg-teal-500" /> Schemes
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
                        All Features ({SEEDED_FEATURES.length})
                      </SelectItem>
                      <SelectItem value="dam" className="text-xs py-1.5">
                        Dams & Reservoirs (3)
                      </SelectItem>
                      <SelectItem value="station" className="text-xs py-1.5">
                        Hydromet Stations (3)
                      </SelectItem>
                      <SelectItem value="basin" className="text-xs py-1.5">
                        River Basins (2)
                      </SelectItem>
                      <SelectItem value="scheme" className="text-xs py-1.5">
                        Command Areas (2)
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
            </div>

            {/* Feature Records List Browser */}
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {filteredFeatures.map((f) => {
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
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">{f.basinName}</p>
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
              })}
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
                    setSelectedFeature(SEEDED_FEATURES[2]!);
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
                {/* Floating Map Feature Nodes */}
                <div className="relative w-[500px] h-[380px] border border-sky-500/20 rounded-3xl bg-sky-950/20 backdrop-blur-xs flex items-center justify-center">
                  {/* Dam Marker 1: Tiga Dam */}
                  <button
                    type="button"
                    onClick={() => setSelectedFeature(SEEDED_FEATURES[2]!)}
                    className="absolute top-1/4 left-1/3 transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                  >
                    <div className="relative flex items-center justify-center">
                      <span className="absolute h-9 w-9 rounded-full bg-emerald-500/30 animate-ping" />
                      <div className="h-8 w-8 rounded-full bg-emerald-600 border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold">
                        <Waves className="h-4 w-4" />
                      </div>
                    </div>
                    <span className="mt-1 px-2 py-0.5 rounded-md bg-slate-900/90 text-[10px] font-bold text-white border border-slate-700 block whitespace-nowrap shadow-md">
                      Tiga Dam (Good)
                    </span>
                  </button>

                  {/* Dam Marker 2: Bakolori Dam */}
                  <button
                    type="button"
                    onClick={() => setSelectedFeature(SEEDED_FEATURES[4]!)}
                    className="absolute bottom-1/4 left-1/5 transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                  >
                    <div className="relative flex items-center justify-center">
                      <div className="h-8 w-8 rounded-full bg-amber-600 border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                    </div>
                    <span className="mt-1 px-2 py-0.5 rounded-md bg-slate-900/90 text-[10px] font-bold text-white border border-slate-700 block whitespace-nowrap shadow-md">
                      Bakolori Dam (Poor)
                    </span>
                  </button>

                  {/* Station Marker: Wudil Gauging Station */}
                  <button
                    type="button"
                    onClick={() => setSelectedFeature(SEEDED_FEATURES[5]!)}
                    className="absolute top-1/3 right-1/4 transform -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                  >
                    <div className="relative flex items-center justify-center">
                      <div className="h-7 w-7 rounded-full bg-teal-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold">
                        <Activity className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <span className="mt-1 px-2 py-0.5 rounded-md bg-slate-900/90 text-[10px] font-bold text-teal-300 border border-slate-700 block whitespace-nowrap shadow-md">
                      Wudil Stn (3.42m)
                    </span>
                  </button>

                  {/* Scheme Perimeter Polygon representation */}
                  <div className="absolute bottom-6 right-8 p-3 rounded-2xl bg-teal-500/10 border border-dashed border-teal-400/60 text-center pointer-events-none">
                    <span className="text-[10px] font-mono text-teal-300 font-bold block">
                      KRIS Command Perimeter
                    </span>
                    <span className="text-[9px] text-teal-200/60">22,000 ha Irrigable</span>
                  </div>
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
                    {selectedFeature?.basinName || 'Hadejia-Jama’are'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-2 pt-0.5">
                  <span>Lat: {selectedFeature?.coordinates.lat.toFixed(4)}°N</span>
                  <span>Lng: {selectedFeature?.coordinates.lng.toFixed(4)}°E</span>
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
                      // Open complete feature specification
                      alert(
                        `Viewing complete specification for ${selectedFeature.name}:\n\n` +
                          JSON.stringify(selectedFeature.details, null, 2),
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
    </div>
  );
}
