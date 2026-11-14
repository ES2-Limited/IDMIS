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
import {
  CreateWaterRequestInputSchema,
  type CreateWaterRequestInput,
  type RequestLevel,
} from '@idmis/contracts';
import { generateUuidV7, localDb, LocalStore } from '@idmis/sync';
import { getApiClient } from '@idmis/api-client';
import { useScope } from '../../shell/ScopeContext';
import { useEffectiveSchemeId, useWuas } from '../core/hooks';
import { useFarmers } from '../slis/hooks';

export function WaterRequestFieldForm() {
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

  // Live WUAs for scheme
  const { wuas = [], isLoading: loadingWuas } = useWuas({ organisationId: schemeId });

  // Live Farmers for scheme
  const { farmers = [], isLoading: loadingFarmers } = useFarmers({ schemeId, limit: 100 });

  const [level, setLevel] = React.useState<RequestLevel>('individual');
  const [farmerId, setFarmerId] = React.useState('');
  const [wuaId, setWuaId] = React.useState('');
  const [volumeM3, setVolumeM3] = React.useState<number>(1200);
  const [periodFromOn, setPeriodFromOn] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [periodToOn, setPeriodToOn] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (wuas.length > 0 && !wuaId) {
      setWuaId(wuas[0]!.id);
    }
  }, [wuas, wuaId]);

  React.useEffect(() => {
    if (farmers.length > 0 && !farmerId) {
      setFarmerId(farmers[0]!.id);
    }
  }, [farmers, farmerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const requestId = generateUuidV7();

      const payload: CreateWaterRequestInput = {
        id: requestId,
        schemeId,
        level,
        farmerId: level === 'individual' ? farmerId : undefined,
        wuaId: level !== 'individual' ? wuaId : undefined,
        volumeM3: String(volumeM3),
        periodFromOn,
        periodToOn,
      };

      // Strict contract validation
      CreateWaterRequestInputSchema.parse(payload);

      let syncedOnline = false;

      // Online attempt first
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const client = getApiClient();
          await client.createWaterRequest(payload);
          syncedOnline = true;
        } catch (serverErr) {
          console.warn('Direct water request creation failed; falling back to offline outbox:', serverErr);
        }
      }

      if (syncedOnline) {
        // Cache cleanly in local storage (zero pending outbox ops)
        await store.cacheCleanRecord(
          'water_request',
          requestId,
          payload as unknown as Record<string, unknown>,
          { schemeId },
        );
        success(
          'Water Request Created & Synced',
          `Order for ${volumeM3.toLocaleString()} m³ submitted directly to server.`,
        );
      } else {
        // Offline commit to Dexie
        await store.commitInsert(
          'water_request',
          requestId,
          payload as unknown as Record<string, unknown>,
          { schemeId },
        );
        warning(
          'Request Saved Offline',
          `Order for ${volumeM3.toLocaleString()} m³ stored in outbox. Will sync automatically when online.`,
        );
      }

      navigate({ to: '/field/records' });
    } catch (err) {
      console.error('Water request error:', err);
      toastError('Submission Failed', String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-12">
      {/* Top Header */}
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
              <h2 className="text-base font-extrabold text-slate-900">Irrigation Water Order</h2>
              <p className="text-xs text-slate-500">
                Submit seasonal or scheduled canal discharge request for farmer or WUA cluster.
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
                      setWuaId('');
                      setFarmerId('');
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
                <label className="text-xs font-semibold text-slate-700">Request Level</label>
                <Select value={level} onValueChange={(val) => setLevel(val as RequestLevel)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual Farmer</SelectItem>
                    <SelectItem value="unit">WUA Unit Cluster</SelectItem>
                    <SelectItem value="sector">Sector Distributary</SelectItem>
                    <SelectItem value="apex">Apex WUA System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {level === 'individual' ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Select Farmer *</label>
                <Select value={farmerId} onValueChange={setFarmerId} disabled={farmers.length === 0}>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        loadingFarmers
                          ? 'Loading farmers...'
                          : farmers.length === 0
                            ? 'No registered farmers'
                            : 'Select Farmer'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {farmers.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.firstName} {f.lastName} ({f.farmerCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Target WUA Unit *</label>
                <Select value={wuaId} onValueChange={setWuaId} disabled={wuas.length === 0}>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        loadingWuas
                          ? 'Loading WUAs...'
                          : wuas.length === 0
                            ? 'No WUAs available'
                            : 'Select WUA Unit'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {wuas.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Requested Volume (m³) *</label>
                <Input
                  type="number"
                  min={100}
                  step={50}
                  value={volumeM3}
                  onChange={(e) => setVolumeM3(Number(e.target.value))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Discharge From *</label>
                <Input
                  type="date"
                  value={periodFromOn}
                  onChange={(e) => setPeriodFromOn(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Discharge To *</label>
                <Input
                  type="date"
                  value={periodToOn}
                  onChange={(e) => setPeriodToOn(e.target.value)}
                />
              </div>
            </div>

            {isOnline ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
                <span className="font-bold">Online Connection: </span>
                Clicking submit will immediately dispatch this water request to the scheme canal water master.
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <span className="font-bold">Offline Storage Guarantee: </span>
                Saved locally to device outbox with optimistic sync on reconnection.
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
              {isSubmitting ? 'Saving...' : isOnline ? 'Submit & Sync Water Request' : 'Save Water Request Offline'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
