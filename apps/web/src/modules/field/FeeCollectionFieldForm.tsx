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
  const { billings = [], isLoading: loadingBillings } = useFeeBillings({ schemeId, limit: 100 });

  const [billingId, setBillingId] = React.useState('');
  const [level, setLevel] = React.useState<'farmer' | 'wua'>('farmer');
  const [farmerId, setFarmerId] = React.useState('');
  const [wuaId, setWuaId] = React.useState('');
  const [amountNgn, setAmountNgn] = React.useState<number>(15000);
  const [paidOn, setPaidOn] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [fieldReceiptRef, setFieldReceiptRef] = React.useState(
    () => `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
  );
  const [seasonId, setSeasonId] = React.useState('018f3a5e-0040-7000-8000-000000000001'); // 2026 Dry Season
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const farmerMap = React.useMemo(() => new Map(farmers.map((f) => [f.id, f])), [farmers]);
  const wuaMap = React.useMemo(() => new Map(wuas.map((w) => [w.id, w])), [wuas]);

  // Auto-select the first payable billing on load
  React.useEffect(() => {
    if (billings.length > 0 && !billingId) {
      const first = billings[0]!;
      setBillingId(first.id);
      if (first.seasonId) setSeasonId(first.seasonId);
      if (first.farmerId) {
        setLevel('farmer');
        setFarmerId(first.farmerId);
        setWuaId('');
      } else if (first.wuaId) {
        setLevel('wua');
        setWuaId(first.wuaId);
        setFarmerId('');
      }
      setAmountNgn(parseFloat(first.amountNgn) || 15000);
    }
  }, [billings, billingId]);

  const selectedBilling = React.useMemo(
    () => billings.find((b) => b.id === billingId),
    [billings, billingId],
  );

  const maxBilledAmount = selectedBilling ? parseFloat(selectedBilling.amountNgn) : null;
  const isAmountExceeded = maxBilledAmount !== null && amountNgn > maxBilledAmount;
  const isAmountInvalid = !amountNgn || amountNgn <= 0 || isAmountExceeded;

  const handleBillingSelect = (id: string) => {
    setBillingId(id);
    const b = billings.find((item) => item.id === id);
    if (b) {
      if (b.seasonId) setSeasonId(b.seasonId);
      if (b.farmerId) {
        setLevel('farmer');
        setFarmerId(b.farmerId);
        setWuaId('');
      } else if (b.wuaId) {
        setLevel('wua');
        setWuaId(b.wuaId);
        setFarmerId('');
      }
      setAmountNgn(parseFloat(b.amountNgn) || 1000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingId || !selectedBilling) {
      toastError('Billing Required', 'Please select an active payable billing invoice.');
      return;
    }

    if (isAmountInvalid) {
      toastError(
        'Invalid Amount',
        isAmountExceeded
          ? `Amount cannot exceed the billed invoice amount of ₦${maxBilledAmount?.toLocaleString()}`
          : 'Collection amount must be greater than 0',
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const collectionId = generateUuidV7();
      const { deviceId } = getOrCreateDeviceInfo();

      // Format amount strictly as 2-decimal string matching MoneySchema
      const formattedAmount = Number(amountNgn).toFixed(2);

      const payload: CreateFeeCollectionInput = {
        id: collectionId,
        schemeId,
        seasonId: selectedBilling.seasonId || seasonId,
        billingId: selectedBilling.id,
        farmerId: selectedBilling.farmerId ?? undefined,
        wuaId: selectedBilling.wuaId ?? undefined,
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

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Scheme</label>
              {schemes.length > 1 ? (
                <Select
                  value={schemeId}
                  onValueChange={(val) => {
                    setSchemeId(val);
                    setBillingId('');
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

            {/* Payable Water Fee Invoices Selector */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Payable Water Fee Bill (Outstanding Invoices) *
                </label>
                <span className="text-[11px] font-semibold text-teal-700">
                  {billings.length} Active Bills
                </span>
              </div>

              {loadingBillings ? (
                <div className="text-xs text-slate-500 py-2">Loading payable billings...</div>
              ) : billings.length === 0 ? (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                  <p className="font-bold">⚠️ No Unpaid Water Fee Invoices Found</p>
                  <p className="text-slate-600">
                    There are no open fee billings recorded for this scheme and season. Fee collection
                    requires an issued billing invoice before payments can be received.
                  </p>
                </div>
              ) : (
                <Select value={billingId} onValueChange={handleBillingSelect}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder="Select an outstanding water fee bill" />
                  </SelectTrigger>
                  <SelectContent>
                    {billings.map((b) => {
                      const payerName = b.farmerId
                        ? farmerMap.get(b.farmerId)
                          ? `${farmerMap.get(b.farmerId)!.firstName} ${farmerMap.get(b.farmerId)!.lastName} (${farmerMap.get(b.farmerId)!.farmerCode})`
                          : `Farmer (${b.farmerId.slice(0, 8)})`
                        : wuaMap.get(b.wuaId!)
                          ? wuaMap.get(b.wuaId!)!.name
                          : `WUA (${b.wuaId?.slice(0, 8)})`;
                      return (
                        <SelectItem key={b.id} value={b.id}>
                          {payerName} — Bill: ₦{Number(b.amountNgn).toLocaleString()} (Due: {b.dueDate})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedBilling && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>Selected Invoice Details</span>
                  <Badge variant="outline" className="bg-teal-50 text-teal-800 border-teal-300 text-[10px]">
                    {selectedBilling.farmerId ? 'Individual Farmer' : 'WUA Apex'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-600 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Payer:</span>
                    <span className="font-semibold text-slate-900">
                      {selectedBilling.farmerId
                        ? farmerMap.get(selectedBilling.farmerId)
                          ? `${farmerMap.get(selectedBilling.farmerId)!.firstName} ${farmerMap.get(selectedBilling.farmerId)!.lastName}`
                          : selectedBilling.farmerId.slice(0, 8)
                        : wuaMap.get(selectedBilling.wuaId!)?.name || selectedBilling.wuaId?.slice(0, 8)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Total Billed:</span>
                    <span className="font-bold text-slate-900">
                      ₦{Number(selectedBilling.amountNgn).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Due Date:</span>
                    <span className="font-medium text-slate-700">{selectedBilling.dueDate}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Invoice ID:</span>
                    <span className="font-mono text-slate-500">{selectedBilling.id.slice(0, 13)}...</span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Amount Collected (₦) *</label>
                <Input
                  type="number"
                  min={1}
                  step={500}
                  value={amountNgn}
                  onChange={(e) => setAmountNgn(Number(e.target.value))}
                />
                {isAmountExceeded ? (
                  <p className="text-[11px] text-red-600 font-semibold mt-0.5">
                    Amount cannot exceed the total invoice amount of ₦
                    {maxBilledAmount?.toLocaleString()}.
                  </p>
                ) : maxBilledAmount !== null ? (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Max payable: ₦{maxBilledAmount.toLocaleString()} (Full or partial payment).
                  </p>
                ) : null}
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
              disabled={isSubmitting || isAmountInvalid || !selectedBilling}
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
