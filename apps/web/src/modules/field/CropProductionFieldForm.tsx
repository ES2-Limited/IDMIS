import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronLeft, Save, Wifi, WifiOff } from 'lucide-react';
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
import { CreateCropProductionInputSchema, type CreateCropProductionInput } from '@idmis/contracts';
import { generateUuidV7, localDb, LocalStore } from '@idmis/sync';
import { getApiClient } from '@idmis/api-client';
import { useScope } from '../../shell/ScopeContext';
import { useEffectiveSchemeId, useLookupValues } from '../core/hooks';
import { usePlots } from '../slis/hooks';

export function CropProductionFieldForm() {
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

  // Live Plots in scheme
  const { plots = [], isLoading: loadingPlots } = usePlots({ schemeId, limit: 100 });

  // Live Crop Types lookup
  const { data: cropTypes = [], isLoading: loadingCrops } = useLookupValues('crop_type');

  const [plotId, setPlotId] = React.useState('');
  const [cropTypeId, setCropTypeId] = React.useState('');
  const [areaHa, setAreaHa] = React.useState<number>(1.5);
  const [yieldT, setYieldT] = React.useState<number>(4.2);
  const [seasonId] = React.useState('018f3a5e-0040-7000-8000-000000000001'); // 2026 Dry Season in DB
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (plots.length > 0 && !plotId) {
      setPlotId(plots[0]!.id);
    }
  }, [plots, plotId]);

  React.useEffect(() => {
    if (cropTypes.length > 0 && !cropTypeId) {
      setCropTypeId(cropTypes[0]!.id);
    }
  }, [cropTypes, cropTypeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const productionId = generateUuidV7();

      const payload: CreateCropProductionInput = {
        id: productionId,
        schemeId,
        plotId: plotId || generateUuidV7(),
        seasonId,
        cropTypeId: cropTypeId || '018f3a5e-0003-7000-8003-000000000001',
        areaHa: String(areaHa),
        yieldT: yieldT ? String(yieldT) : undefined,
      };

      // Strict validation
      CreateCropProductionInputSchema.parse(payload);

      let syncedOnline = false;

      // Online attempt first
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const client = getApiClient();
          await client.createCropProduction(payload);
          syncedOnline = true;
        } catch (serverErr) {
          console.warn('Direct crop production creation failed; falling back to offline outbox:', serverErr);
        }
      }

      if (syncedOnline) {
        // Cache cleanly in local storage (no outbox mutation op queued)
        await store.cacheCleanRecord(
          'crop_production',
          productionId,
          payload as unknown as Record<string, unknown>,
          { schemeId },
        );
        success(
          'Crop Production Saved & Synced',
          `Logged harvest yield of ${yieldT} tons across ${areaHa} ha directly to server.`,
        );
      } else {
        // Queue in offline outbox for automatic background sync
        await store.commitInsert(
          'crop_production',
          productionId,
          payload as unknown as Record<string, unknown>,
          { schemeId },
        );
        warning(
          'Saved Offline',
          `Logged harvest yield saved to local outbox. Will sync automatically when connection returns.`,
        );
      }

      navigate({ to: '/field/records' });
    } catch (err) {
      console.error('Crop production error:', err);
      toastError('Submission Failed', String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: '/field/capture' })}
          className="text-xs h-8 text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Capture
        </Button>
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

      <Card className="rounded-2xl border-slate-200/90 shadow-sm bg-white">
        <form onSubmit={handleSubmit}>
          <CardContent className="p-5 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-extrabold text-slate-900">Crop Production Survey</h2>
              <p className="text-xs text-slate-500">
                Log seasonal agronomic yield, planted area, and harvest volume for an active parcel.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Scheme</label>
                {schemes.length > 1 ? (
                  <Select
                    value={schemeId}
                    onValueChange={(val) => {
                      setSchemeId(val);
                      setPlotId('');
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
                  <Input value={schemeName} disabled className="bg-slate-50 text-slate-700 font-medium" />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Cropping Season</label>
                <Input value="2026 Dry Season" disabled className="bg-slate-50 text-slate-600" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Parcel / Plot *</label>
                <Select value={plotId} onValueChange={setPlotId} disabled={plots.length === 0}>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        loadingPlots
                          ? 'Loading plots...'
                          : plots.length === 0
                            ? 'No plots available'
                            : 'Select Plot'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {plots.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.plotCode} ({p.serviceType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Crop Cultivated *</label>
                <Select value={cropTypeId} onValueChange={setCropTypeId} disabled={cropTypes.length === 0}>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        loadingCrops
                          ? 'Loading crops...'
                          : cropTypes.length === 0
                            ? 'No crops configured'
                            : 'Select Crop'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {cropTypes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Planted Area (ha) *</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.1"
                  value={areaHa}
                  onChange={(e) => setAreaHa(Number(e.target.value))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Harvested Yield (Metric Tons)</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={yieldT}
                  onChange={(e) => setYieldT(Number(e.target.value))}
                />
              </div>
            </div>

            {isOnline ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
                <span className="font-bold">Online Connection: </span>
                Clicking submit will upload this seasonal agronomic record directly to the national M&E database.
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <span className="font-bold">Offline Storage Guarantee: </span>
                Saved locally to device outbox with automatic sync on connection return.
              </div>
            )}
          </CardContent>

          <CardFooter className="p-4 bg-slate-50/80 border-t border-slate-100 rounded-b-2xl flex items-center justify-end">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-8 px-4 rounded-xl shadow-sm"
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              {isSubmitting ? 'Saving...' : isOnline ? 'Submit & Sync Production' : 'Save Production Offline'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
