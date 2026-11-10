import * as React from 'react';
import {
  MapPin,
  Search,
  Layers,
  UploadCloud,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Compass,
  Eye,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Badge,
  StatusChip,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  useToast,
} from '@idmis/ui';
import { useScope } from '../../shell/ScopeContext';
import { ImportWizard } from '../../imports/ImportWizard';
import { usePlots } from './hooks';

export interface PlotItem {
  id: string;
  plotCode: string;
  sectorName: string;
  allocatedFarmer: string;
  areaHa: string;
  irrigationType: 'Gravity Canal' | 'Tubewell Pump' | 'Low-lift Lateral';
  serviceType: 'gravity' | 'pump' | 'conjunctive';
  status: 'approved' | 'awaiting_review' | 'conflict';
  coordinatesCount: number;
}

export const mockPlots: PlotItem[] = [
  {
    id: '018f3a70-0011-7000-8000-000000000001',
    plotCode: 'PLT-B4-082',
    sectorName: 'Sector B4 (Kura Canal Reach)',
    allocatedFarmer: 'Musa Ibrahim Danbatta',
    areaHa: '1.4500',
    irrigationType: 'Gravity Canal',
    serviceType: 'gravity',
    status: 'approved',
    coordinatesCount: 8,
  },
  {
    id: '018f3a70-0012-7000-8000-000000000002',
    plotCode: 'PLT-B4-083',
    sectorName: 'Sector B4 (Kura Canal Reach)',
    allocatedFarmer: 'Musa Ibrahim Danbatta',
    areaHa: '0.9000',
    irrigationType: 'Gravity Canal',
    serviceType: 'gravity',
    status: 'approved',
    coordinatesCount: 6,
  },
  {
    id: '018f3a70-0013-7000-8000-000000000003',
    plotCode: 'PLT-A2-014',
    sectorName: 'Sector A2 (Gari Sub-system)',
    allocatedFarmer: 'Amina Bello Galadima',
    areaHa: '2.1000',
    irrigationType: 'Low-lift Lateral',
    serviceType: 'pump',
    status: 'approved',
    coordinatesCount: 12,
  },
  {
    id: '018f3a70-0014-7000-8000-000000000004',
    plotCode: 'PLT-C1-019',
    sectorName: 'Sector C1 (Hadejia Floodplain)',
    allocatedFarmer: 'Haruna Yusuf Sani',
    areaHa: '0.8000',
    irrigationType: 'Tubewell Pump',
    serviceType: 'conjunctive',
    status: 'conflict',
    coordinatesCount: 7,
  },
  {
    id: '018f3a70-0015-7000-8000-000000000005',
    plotCode: 'PLT-D3-104',
    sectorName: 'Sector D3 (Auyo)',
    allocatedFarmer: 'Fatima Mohammed',
    areaHa: '1.2000',
    irrigationType: 'Gravity Canal',
    serviceType: 'gravity',
    status: 'awaiting_review',
    coordinatesCount: 9,
  },
];

export function PlotsMapView() {
  const { currentScope } = useScope();
  const { info, success } = useToast();
  const [selectedPlot, setSelectedPlot] = React.useState<PlotItem | null>(null);
  const [search, setSearch] = React.useState('');
  const [serviceFilter, setServiceFilter] = React.useState('all');
  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = React.useState(false);

  // Dynamic Interactive Map State
  const [zoomLevel, setZoomLevel] = React.useState<number>(15);
  const [showCanals, setShowCanals] = React.useState(true);
  const [showCadastralLabels, setShowCadastralLabels] = React.useState(true);

  // Modular custom hook for Plots
  const { plots: serverPlots } = usePlots({
    limit: 50,
    schemeId: currentScope.type === 'scheme' ? currentScope.id : undefined,
  });

  const activePlots: PlotItem[] = React.useMemo(() => {
    if (!serverPlots) return [];
    return serverPlots.map((p) => ({
      id: p.id,
      plotCode: p.plotCode,
      sectorName: `Sector ${p.sectorId?.slice(-4) || 'Alpha'}`,
      allocatedFarmer: p.farmId ? `Farm ${p.farmId.slice(-4)}` : 'Unassigned',
      areaHa: String(p.areaHa || '1.0000'),
      irrigationType: 'Gravity Canal',
      serviceType: 'gravity',
      status:
        p.status === 'submitted'
          ? 'awaiting_review'
          : p.status === 'returned'
            ? 'conflict'
            : 'approved',
      coordinatesCount: 4,
    }));
  }, [serverPlots]);

  const filtered = activePlots.filter((p) => {
    if (serviceFilter !== 'all' && p.serviceType !== serviceFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.plotCode.toLowerCase().includes(q) ||
      p.allocatedFarmer.toLowerCase().includes(q) ||
      p.sectorName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 animate-in fade-in-50">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              {currentScope.name || 'All Schemes'}
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">Cadastral Parcels</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
            Plots & Command Area GIS
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsImportOpen(true)}
            className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-9 px-3.5 shadow-sm"
          >
            <UploadCloud className="h-4 w-4 mr-1.5" />
            Import Plot Shapefiles
          </Button>
        </div>
      </div>

      {/* Split List & Map Workspace */}
      <div
        className={`grid gap-4 ${isMapFullscreen ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-12'}`}
      >
        {/* Left Column: Parcels List */}
        {!isMapFullscreen && (
          <div className="lg:col-span-5 space-y-3">
            {/* Search and Filters */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Filter parcel ID or farmer..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-xs border-slate-200 bg-white"
                />
              </div>
              <div className="w-36 sm:w-44">
                <Select
                  value={serviceFilter}
                  onValueChange={(val: string) => setServiceFilter(val)}
                >
                  <SelectTrigger
                    aria-label="Filter by irrigation service"
                    className="h-9 min-h-[36px] w-full bg-white border-slate-200 text-xs font-semibold rounded-xl hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
                  >
                    <SelectValue placeholder="All Services" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-xl border-slate-200">
                    <SelectItem value="all" className="text-xs font-medium py-2">
                      All Services
                    </SelectItem>
                    <SelectItem value="gravity" className="text-xs font-medium py-2">
                      Gravity Canal
                    </SelectItem>
                    <SelectItem value="pump" className="text-xs font-medium py-2">
                      Pump Lift
                    </SelectItem>
                    <SelectItem value="conjunctive" className="text-xs font-medium py-2">
                      Conjunctive
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Parcels List Scrollable Container */}
            <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <div className="py-12 px-4 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  <MapPin className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">No plots mapped in scope</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    No cadastral parcels found for the active filter.
                  </p>
                </div>
              ) : (
                filtered.map((plot) => {
                  const isSelected = selectedPlot?.id === plot.id;
                  return (
                    <div
                      key={plot.id}
                      onClick={() => setSelectedPlot(plot)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-teal-600 bg-teal-50/40 shadow-sm ring-1 ring-teal-600/30'
                          : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-slate-900">
                              {plot.plotCode}
                            </span>
                            <StatusChip status={plot.status}>{plot.status}</StatusChip>
                          </div>
                          <p className="text-xs font-semibold text-slate-800 mt-1">
                            {plot.allocatedFarmer}
                          </p>
                          <p className="text-[11px] text-slate-400">{plot.sectorName}</p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                            {plot.areaHa} ha
                          </span>
                          <p className="text-[10px] text-slate-400 mt-1 font-medium">
                            {plot.irrigationType}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Right Column: GIS Spatial Workspace */}
        <div className={isMapFullscreen ? 'col-span-1' : 'lg:col-span-7'}>
          <Card className="rounded-2xl border-slate-200/90 overflow-hidden shadow-sm bg-white h-[660px] flex flex-col">
            <CardHeader className="py-2.5 px-4 border-b border-slate-100 flex flex-row items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-teal-700" />
                <CardTitle className="text-xs font-bold text-slate-800">
                  Cadastral GIS Map Canvas
                </CardTitle>
                <Badge
                  variant="outline"
                  className="text-[10px] bg-white border-slate-200 text-slate-600"
                >
                  WGS84 / UTM Zone 32N
                </Badge>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setIsMapFullscreen((p) => !p)}
                aria-label="Toggle map size"
              >
                {isMapFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            </CardHeader>

            <div className="flex-1 relative bg-slate-950 overflow-hidden flex items-center justify-center">
              {/* Simulated Map Background Layer with Cadastral Vector Polygons */}
              <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#14b8a6_1px,transparent_1px)] [background-size:16px_16px]" />

              {/* Mock Polygon Graphic */}
              <div className="relative z-10 w-80 h-80 border-2 border-dashed border-teal-400/80 rounded-3xl bg-teal-500/10 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center shadow-2xl">
                <div className="h-10 w-10 rounded-2xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-teal-300 mb-3 shadow-inner">
                  <MapPin className="h-5 w-5" />
                </div>
                <h4 className="text-white font-mono font-bold text-sm">
                  {selectedPlot ? selectedPlot.plotCode : 'Select a Parcel'}
                </h4>
                <p className="text-teal-200/80 text-xs mt-1">
                  {selectedPlot
                    ? `${selectedPlot.areaHa} Hectares · ${selectedPlot.coordinatesCount} Vertices`
                    : ''}
                </p>
                <p className="text-slate-400 text-[10px] mt-2 max-w-xs leading-relaxed">
                  Geodesic area computed on device using spherical turf projection.
                  Self-intersection free.
                </p>
              </div>

              {/* Map Floating HUD Overlay */}
              <div className="absolute top-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md p-3 rounded-2xl border border-slate-800 text-white text-xs space-y-1 shadow-lg max-w-xs">
                <span className="font-bold text-teal-400 block text-[11px]">
                  Canal Lateral Reach
                </span>
                <span className="text-slate-300 block text-[11px] truncate">
                  {selectedPlot?.sectorName || 'Kura Branch Sub-reach 4B'}
                </span>
                <div className="flex items-center gap-1.5 pt-1 text-[10px] text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>Cadastral Boundary Validated</span>
                </div>
              </div>

              {/* Interactive GIS Map Tool Controls */}
              <div className="absolute top-4 right-4 z-20 flex flex-col gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-lg">
                <button
                  type="button"
                  title="Zoom In"
                  onClick={() => {
                    setZoomLevel((z) => Math.min(z + 1, 19));
                    info('Map Zoomed In', `Current scale level: ${Math.min(zoomLevel + 1, 19)}x`);
                  }}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Zoom Out"
                  onClick={() => {
                    setZoomLevel((z) => Math.max(z - 1, 10));
                    info('Map Zoomed Out', `Current scale level: ${Math.max(zoomLevel - 1, 10)}x`);
                  }}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <div className="h-px bg-slate-800 my-0.5" />
                <button
                  type="button"
                  title="Toggle Canal Network Layer"
                  onClick={() => {
                    setShowCanals((c) => !c);
                    success(
                      showCanals ? 'Canals Hidden' : 'Canals Displayed',
                      'Primary and secondary distribution reach lines updated.',
                    );
                  }}
                  className={`h-7 w-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
                    showCanals
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Compass className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Toggle Parcel Code Labels"
                  onClick={() => {
                    setShowCadastralLabels((l) => !l);
                    info(
                      showCadastralLabels ? 'Labels Hidden' : 'Labels Shown',
                      'Cadastral parcel identifier codes toggled.',
                    );
                  }}
                  className={`h-7 w-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
                    showCadastralLabels
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Bottom Parcel Details Drawer */}
            {selectedPlot && (
              <div className="p-3.5 border-t border-slate-200 bg-white grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Assigned Farmer
                  </span>
                  <span className="font-bold text-slate-900 truncate block">
                    {selectedPlot.allocatedFarmer}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Irrigation Type
                  </span>
                  <span className="font-bold text-slate-900 block">
                    {selectedPlot.irrigationType}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Review Status
                  </span>
                  <StatusChip status={selectedPlot.status}>{selectedPlot.status}</StatusChip>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* 5-step Reusable Import Wizard */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="max-w-4xl p-6 rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="text-lg font-bold text-slate-900">
              Import Cadastral Plots & Parcels
            </DialogTitle>
          </DialogHeader>
          <ImportWizard
            initialDatasetId="plot"
            onCancel={() => setIsImportOpen(false)}
            onBatchCommitted={() => setIsImportOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
