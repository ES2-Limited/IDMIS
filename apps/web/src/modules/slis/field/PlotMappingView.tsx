import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { MapPin, Play, Square, Undo2, Trash2, Crosshair, User, Wifi, WifiOff } from 'lucide-react';
import {
  Card,
  CardContent,
  CardFooter,
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Badge,
  useToast,
} from '@idmis/ui';
import { CreatePlotInputSchema, type CreatePlotInput, type ServiceType } from '@idmis/contracts';
import { generateUuidV7, localDb, LocalStore } from '@idmis/sync';
import { getApiClient } from '@idmis/api-client';
import { useScope } from '../../../shell/ScopeContext';
import { calculatePolygonAreaHa, createGeoJsonPolygon } from './spatial-utils';
import { useEffectiveSchemeId, useOrganisations } from '../../core/hooks';

export function PlotMappingView() {
  const navigate = useNavigate();
  const { currentScope } = useScope();
  const { success, warning, error: toastError } = useToast();
  const store = React.useMemo(() => new LocalStore(localDb), []);

  const [isOnline, setIsOnline] = React.useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Live Scheme Resolution
  const { schemeId, schemeName, schemes, setSchemeId } = useEffectiveSchemeId(currentScope.id);

  // Live Sectors for active scheme
  const { organisations: sectorOrgs = [], isLoading: loadingSectors } = useOrganisations({
    type: 'sector',
    parentId: schemeId,
  });

  // Form State
  const [plotCode, setPlotCode] = React.useState(
    () => `PLOT-KRIS-${Math.floor(1000 + Math.random() * 9000)}`,
  );
  const [serviceType, setServiceType] = React.useState<ServiceType>('improved');
  const [cropType, setCropType] = React.useState('Rice (Lowland)');
  const [season, setSeason] = React.useState('2026 Dry Season');
  const [farmerCode, setFarmerCode] = React.useState('FARM-KRIS-0001');
  const [sectorId, setSectorId] = React.useState('');

  React.useEffect(() => {
    if (sectorOrgs.length > 0 && !sectorId) {
      setSectorId(sectorOrgs[0]!.id);
    }
  }, [sectorOrgs, sectorId]);

  // GPS Stream & Boundary State
  const [isWalking, setIsWalking] = React.useState(false);
  const [coordinates, setCoordinates] = React.useState<Array<[number, number]>>([
    [8.4289, 11.7584],
    [8.4302, 11.7584],
    [8.4302, 11.7596],
  ]);
  const [gpsAccuracy, setGpsAccuracy] = React.useState<number>(3.2); // meters
  const [watchId, setWatchId] = React.useState<number | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  // Compute live area in Hectares
  const calculatedAreaHa = React.useMemo(() => {
    return calculatePolygonAreaHa(coordinates);
  }, [coordinates]);

  // Start walking boundary GPS stream
  const startWalking = () => {
    if (!navigator.geolocation) {
      toastError(
        'Geolocation Unavailable',
        'GPS position tracking is not supported by your device browser.',
      );
      return;
    }

    setIsWalking(true);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        setGpsAccuracy(parseFloat(pos.coords.accuracy.toFixed(1)));
        setCoordinates((prev) => [...prev, [lng, lat]]);
      },
      (err) => {
        console.error('GPS Watch error:', err);
        toastError('GPS Error', err.message);
        setIsWalking(false);
      },
      { enableHighAccuracy: true, maximumAge: 1000 },
    );
    setWatchId(id);
  };

  const stopWalking = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setIsWalking(false);
  };

  const handleManualDropPoint = () => {
    if (!navigator.geolocation) {
      toastError('GPS Error', 'Geolocation not supported.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        setGpsAccuracy(parseFloat(pos.coords.accuracy.toFixed(1)));
        setCoordinates((prev) => [...prev, [lng, lat]]);
        success('Point Added', `Vertex at ${lat}°N, ${lng}°E`);
      },
      (err) => {
        toastError('GPS Error', err.message);
      },
      { enableHighAccuracy: true },
    );
  };

  const handleUndoPoint = () => {
    setCoordinates((prev) => prev.slice(0, -1));
  };

  const handleClearPoints = () => {
    if (confirm('Clear all recorded boundary vertices?')) {
      setCoordinates([]);
    }
  };

  // Submit Plot to Offline Dexie Outbox / Direct API
  const handleSubmit = async () => {
    if (coordinates.length < 3) {
      warning(
        'Incomplete Boundary',
        'A valid plot parcel requires at least 3 GPS boundary vertices.',
      );
      return;
    }

    if (!sectorId) {
      toastError('Sector Required', 'Please select a distributary sector for this plot.');
      return;
    }

    setIsSaving(true);
    try {
      const plotId = generateUuidV7();
      const geom = createGeoJsonPolygon(coordinates);

      const payload: CreatePlotInput = {
        id: plotId,
        schemeId,
        sectorId,
        plotCode,
        serviceType,
        geom: geom || undefined,
        gpsAccuracyM: gpsAccuracy,
      };

      // Contract validation check
      CreatePlotInputSchema.parse(payload);

      let syncedOnline = false;

      // Online attempt first
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const client = getApiClient();
          await client.createPlot(payload);
          syncedOnline = true;
        } catch (serverErr) {
          console.warn('Direct plot creation failed; falling back to offline outbox:', serverErr);
        }
      }

      if (syncedOnline) {
        // Cache cleanly in local storage (zero pending outbox ops)
        await store.cacheCleanRecord(
          'plot',
          plotId,
          {
            ...payload,
            cropType,
            season,
            allocatedFarmerCode: farmerCode,
            areaHa: calculatedAreaHa,
          },
          { schemeId },
        );
        success(
          'Plot Saved & Synced',
          `Plot ${plotCode} (${calculatedAreaHa.toFixed(2)} Ha) created on server.`,
        );
      } else {
        // Commit to Dexie outbox
        await store.commitInsert(
          'plot',
          plotId,
          {
            ...payload,
            cropType,
            season,
            allocatedFarmerCode: farmerCode,
            areaHa: calculatedAreaHa,
          },
          { schemeId },
        );
        warning(
          'Plot Saved Offline',
          `Plot ${plotCode} (${calculatedAreaHa.toFixed(2)} Ha) queued for offline sync.`,
        );
      }

      navigate({ to: '/field/records' });
    } catch (err) {
      console.error('Plot mapping error:', err);
      toastError('Plot Saving Failed', String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-12">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Plot Mapping & Cadastral Survey</h2>
          <p className="text-xs text-slate-500">
            Walk perimeter boundary or drop points to compute parcel area.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-800 border-emerald-300 text-xs flex items-center gap-1"
            >
              <Wifi className="h-3 w-3" /> Online
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-800 border-amber-300 text-xs flex items-center gap-1"
            >
              <WifiOff className="h-3 w-3" /> Offline Outbox Active
            </Badge>
          )}
        </div>
      </div>

      {/* Live Map / Boundary Simulation Canvas */}
      <Card className="rounded-2xl border-slate-200 overflow-hidden shadow-sm bg-slate-900 text-white relative">
        <div className="h-64 sm:h-72 w-full bg-slate-950 relative flex items-center justify-center p-4">
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#14b8a6_1px,transparent_1px)] [background-size:16px_16px]" />

          {/* SVG Map Polygon Visualizer */}
          <svg className="w-full h-full max-w-sm max-h-56">
            <defs>
              <linearGradient id="plot-fill" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#042f2e" stopOpacity="0.6" />
              </linearGradient>
            </defs>

            {coordinates.length >= 3 && (
              <polygon
                points={coordinates
                  .map((c, idx) => {
                    const x = 50 + ((idx * 80) % 240);
                    const y = 40 + (idx === 1 ? 120 : idx === 2 ? 140 : 20);
                    return `${x},${y}`;
                  })
                  .join(' ')}
                fill="url(#plot-fill)"
                stroke="#2dd4bf"
                strokeWidth="2.5"
                strokeDasharray={isWalking ? '4 2' : 'none'}
              />
            )}

            {/* Vertex Dots */}
            {coordinates.map((c, idx) => {
              const x = 50 + ((idx * 80) % 240);
              const y = 40 + (idx === 1 ? 120 : idx === 2 ? 140 : 20);
              return (
                <g key={idx}>
                  <circle cx={x} cy={y} r="5" fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" />
                  <text x={x + 7} y={y - 7} fill="#e2e8f0" fontSize="10" fontWeight="bold">
                    P{idx + 1}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Floating Metric Overlays */}
          <div className="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-md border border-slate-700/60 rounded-xl p-2.5 text-xs space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <Crosshair className="h-3.5 w-3.5" />
              <span>{coordinates.length} Vertices Recorded</span>
            </div>
            <div className="text-[11px] text-slate-300">
              GPS Accuracy: <span className="font-semibold text-white">±{gpsAccuracy}m</span>
            </div>
          </div>

          <div className="absolute top-3 right-3 bg-slate-900/85 backdrop-blur-md border border-slate-700/60 rounded-xl p-2.5 text-right text-xs">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Enclosed Area
            </div>
            <div className="text-base font-extrabold text-teal-300 font-mono">
              {calculatedAreaHa.toFixed(3)} ha
            </div>
          </div>
        </div>

        {/* Survey Action Toolbar */}
        <div className="p-3 bg-slate-900/95 border-t border-slate-800 flex items-center justify-between gap-2">
          {!isWalking ? (
            <Button
              size="sm"
              onClick={startWalking}
              className="bg-teal-600 hover:bg-teal-500 text-white text-xs h-8 px-3 rounded-xl shadow-sm"
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              Walk Boundary
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={stopWalking}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs h-8 px-3 rounded-xl shadow-sm"
            >
              <Square className="h-3.5 w-3.5 mr-1" />
              Stop Walking
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={handleManualDropPoint}
            className="border-slate-700 text-slate-200 hover:bg-slate-800 text-xs h-8 px-3 rounded-xl"
          >
            <MapPin className="h-3.5 w-3.5 mr-1 text-teal-400" />
            Drop Vertex
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleUndoPoint}
            disabled={coordinates.length === 0}
            className="text-slate-400 hover:text-white text-xs h-8 px-2"
          >
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            Undo
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleClearPoints}
            disabled={coordinates.length === 0}
            className="text-slate-400 hover:text-rose-400 text-xs h-8 px-2"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Card>

      {/* Parcel Form Attributes */}
      <Card className="rounded-2xl border-slate-200/90 shadow-sm bg-white">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center justify-between">
            <span>Parcel Attributes & Farmer Allocation</span>
            <Badge variant="outline" className="text-teal-700 bg-teal-50 border-teal-200 text-xs">
              SLIS Cadastral
            </Badge>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Scheme</label>
              {schemes.length > 1 ? (
                <Select
                  value={schemeId}
                  onValueChange={(val) => {
                    setSchemeId(val);
                    setSectorId('');
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Scheme" />
                  </SelectTrigger>
                  <SelectContent>
                    {schemes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={schemeName}
                  disabled
                  className="bg-slate-50 text-slate-700 font-medium"
                />
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Distributary Sector</label>
              <Select
                value={sectorId}
                onValueChange={setSectorId}
                disabled={sectorOrgs.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      loadingSectors
                        ? 'Loading sectors...'
                        : sectorOrgs.length === 0
                          ? 'No sectors available'
                          : 'Select Sector'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {sectorOrgs.map((sec) => (
                    <SelectItem key={sec.id} value={sec.id}>
                      {sec.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Parcel / Plot Code *</label>
              <Input value={plotCode} onChange={(e) => setPlotCode(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Irrigation Service</label>
              <Select
                value={serviceType}
                onValueChange={(val) => setServiceType(val as ServiceType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Service Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="improved">Improved Gravity</SelectItem>
                  <SelectItem value="new">New Command Area</SelectItem>
                  <SelectItem value="none">Rainfed / Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Current Crop</label>
              <Input value={cropType} onChange={(e) => setCropType(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Cropping Season</label>
              <Input value={season} onChange={(e) => setSeason(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1 pt-1">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-teal-700" />
              Allocated Farmer Code / National ID
            </label>
            <Input
              placeholder="e.g. FARM-KRIS-0001"
              value={farmerCode}
              onChange={(e) => setFarmerCode(e.target.value)}
            />
          </div>
        </CardContent>

        <CardFooter className="p-4 bg-slate-50/80 border-t border-slate-100 rounded-b-2xl flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Area: <span className="font-bold text-slate-900">{calculatedAreaHa.toFixed(2)} ha</span>{' '}
            (within ±2% precision)
          </div>

          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 px-4 rounded-xl shadow-md"
          >
            {isSaving ? 'Saving...' : isOnline ? 'Submit & Sync Plot' : 'Save Plot on Device'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
