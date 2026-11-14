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
import { CreateFeeCollectionInputSchema, type CreateFeeCollectionInput } from '@idmis/contracts';
import { generateUuidV7, localDb, LocalStore } from '@idmis/sync';
import { getApiClient } from '@idmis/api-client';
import { useScope } from '../../shell/ScopeContext';
import { useEffectiveSchemeId, useWuas } from '../core/hooks';
import { useFarmers, useFeeBillings } from '../slis/hooks';
import { getOrCreateDeviceInfo } from '../../sync/device';

export function FeeCollectionFieldForm() {
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

  // Live Billings for scheme & season
  const { billings = [] } = useFeeBillings({ schemeId, limit: 100 });

  const [level, setLevel] = React.useState<'farmer' | 'wua'>('farmer');
  const [farmerId, setFarmerId] = React.useState('');
  const [wuaId, setWuaId] = React.useState('');
  const [amountNgn, setAmountNgn] = React.useState<number>(15000);
  const [paidOn, setPaidOn] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [fieldReceiptRef, setFieldReceiptRef] = React.useState(
    () => `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
  );
  const [seasonId] = React.useState('018f3a5e-0040-7000-8000-000000000001'); // 2026 Dry Season in DB
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Auto-select farmers/wuas that have active billings first if available
  React.useEffect(() => {
    if (billings.length > 0) {
      const farmerBilling = billings.find((b) => b.farmerId);
      if (farmerBilling?.farmerId && !farmerId) {
        setFarmerId(farmerBilling.farmerId);
        setAmountNgn(Math.min(15000, parseFloat(farmerBilling.amountNgn) || 15000));
      }
      const wuaBilling = billings.find((b) => b.wuaId);
      if (wuaBilling?.wuaId && !wuaId) {
        setWuaId(wuaBilling.wuaId);
      }
    }
  }, [billings, farmerId, wuaId]);

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
      const collectionId = generateUuidV7();
      const { deviceId } = getOrCreateDeviceInfo();

      // Format amount strictly as 2-decimal string matching MoneySchema
      const formattedAmount = Number(amountNgn).toFixed(2);

      // Check if there is a matching billing in DB
      const matchingBilling = billings.find((b) =>
        level === 'farmer' ? b.farmerId === farmerId : b.wuaId === wuaId,
      );

      const payload: CreateFeeCollectionInput = {
        id: collectionId,
        schemeId,
        seasonId,
        billingId: matchingBilling?.id,
        farmerId: level === 'farmer' ? farmerId : undefined,
        wuaId: level === 'wua' ? wuaId : undefined,
        amountNgn: formattedAmount,
        paidOn,
        deviceId,
        fieldReceiptRef,
      };

      // Strict contract validation
      CreateFeeCollectionInputSchema.parse(payload);

      let syncedOnline = false;

      // Online attempt first
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const client = getApiClient();
          await client.createFeeCollection(payload);
          syncedOnline = true;
        } catch (serverErr) {
          console.warn('Direct fee collection creation failed; falling back to offline outbox:', serverErr);
        }
      }

      if (syncedOnline) {
        // Cache cleanly in local storage (zero pending outbox ops)
        await store.cacheCleanRecord(
          'fee_collection',
          collectionId,
          payload as unknown as Record<string, unknown>,
          { schemeId },
        );
        success(
          'Fee Collection Recorded & Synced',
          `Payment of ₦${Number(amountNgn).toLocaleString()} (${fieldReceiptRef}) recorded directly on server.`,
        );
      } else {
        // Commit to Dexie outbox for offline sync
        await store.commitInsert(
          'fee_collection',
          collectionId,
          payload as unknown as Record<string, unknown>,
          { schemeId },
        );
        warning(
          'Payment Saved Offline',
          `Payment of ₦${Number(amountNgn).toLocaleString()} (${fieldReceiptRef}) queued for synchronization.`,
        );
      }

      navigate({ to: '/field/records' });
    } catch (err) {
      console.error('Fee collection error:', err);
      toastError('Collection Failed', String(err));
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
              <h2 className="text-base font-extrabold text-slate-900">Field Water Fee Collection</h2>
              <p className="text-xs text-slate-500">
                Issue manual paper receipt reference and log offline water charge payments.
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
                <label className="text-xs font-semibold text-slate-700">Billing Level</label>
                <Select value={level} onValueChange={(val) => setLevel(val as 'farmer' | 'wua')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="farmer">Individual Farmer</SelectItem>
                    <SelectItem value="wua">Apex / Unit WUA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {level === 'farmer' ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Payer Farmer *</label>
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
                <label className="text-xs font-semibold text-slate-700">Target WUA *</label>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Amount Collected (₦) *</label>
                <Input
                  type="number"
                  min={100}
                  step={500}
                  value={amountNgn}
                  onChange={(e) => setAmountNgn(Number(e.target.value))}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Payment Date *</label>
                <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Physical Receipt Reference *</label>
              <Input
                placeholder="REC-2026-XXXX"
                value={fieldReceiptRef}
                onChange={(e) => setFieldReceiptRef(e.target.value)}
              />
            </div>

            {isOnline ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
                <span className="font-bold">Online Connection: </span>
                Clicking submit will credit the billing ledger on the server and generate a confirmed audit record.
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <span className="font-bold">Offline Storage Guarantee: </span>
                Saved locally to device outbox with automatic reconciliation on reconnect.
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
              {isSubmitting ? 'Recording...' : isOnline ? 'Submit & Sync Payment' : 'Save Payment Offline'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
