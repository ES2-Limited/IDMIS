import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronLeft, Save } from 'lucide-react';
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
} from '@idmis/ui';
import { CreateFeeCollectionInputSchema, type CreateFeeCollectionInput } from '@idmis/contracts';
import { generateUuidV7, localDb, LocalStore } from '@idmis/sync';
import { useScope } from '../../shell/ScopeContext';

export function FeeCollectionFieldForm() {
  const navigate = useNavigate();
  const { currentScope } = useScope();
  const store = React.useMemo(() => new LocalStore(localDb), []);

  const [level, setLevel] = React.useState<'farmer' | 'wua'>('farmer');
  const [farmerName, setFarmerName] = React.useState('');
  const [wuaName, setWuaName] = React.useState('HVIP Sector B4 WUA');
  const [amountNgn, setAmountNgn] = React.useState<number>(15000);
  const [paidOn, setPaidOn] = React.useState(new Date().toISOString().slice(0, 10));
  const [fieldReceiptRef, setFieldReceiptRef] = React.useState('REC-2026-0891');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    try {
      const collectionId = generateUuidV7();
      const schemeId = currentScope.id || '018f3a70-0003-7000-8000-000000000001';
      const deviceId = generateUuidV7();

      const payload: CreateFeeCollectionInput = {
        id: collectionId,
        schemeId,
        seasonId: generateUuidV7(),
        farmerId: level === 'farmer' ? generateUuidV7() : undefined,
        wuaId: level === 'wua' ? generateUuidV7() : undefined,
        amountNgn: String(amountNgn),
        paidOn,
        deviceId,
        fieldReceiptRef,
      };

      // Strict validation against contracts
      CreateFeeCollectionInputSchema.parse(payload);

      // Commit locally to outbox
      await store.commitInsert(
        'fee_collection',
        collectionId,
        {
          ...payload,
          displayName:
            level === 'farmer' ? `Farmer: ${farmerName || 'Musa Ibrahim'}` : `WUA: ${wuaName}`,
          status: 'saved_on_device',
          receiptBookNo: fieldReceiptRef,
          submittedAt: new Date().toISOString(),
        },
        {
          schemeId,
        },
      );

      navigate({ to: '/field/records' });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errors' in err) {
        const zodErrors = (err as { errors: Array<{ path: (string | number)[]; message: string }> })
          .errors;
        const mapped: Record<string, string> = {};
        for (const item of zodErrors) {
          mapped[item.path.join('.')] = item.message;
        }
        setErrors(mapped);
      } else {
        setErrors({ form: 'Validation failed. Check your inputs.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-6 animate-in fade-in-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => navigate({ to: '/field/capture' })}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Fee Collection Receipt</h2>
            <p className="text-xs text-slate-500">Record field receipt book acknowledgment</p>
          </div>
        </div>
        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-xs">
          Offline Receipt
        </Badge>
      </div>

      <Card className="rounded-2xl border-slate-200/90 shadow-sm bg-white">
        <form onSubmit={handleSubmit}>
          <CardContent className="p-5 space-y-4">
            {errors.form && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {errors.form}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Payer Type</label>
              <Select value={level} onValueChange={(val) => setLevel(val as 'farmer' | 'wua')}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Select payer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="farmer">Individual Farmer Member</SelectItem>
                  <SelectItem value="wua">WUA Aggregate Block</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {level === 'farmer' ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Farmer Name</label>
                <Input
                  placeholder="e.g. Amina Bello Galadima"
                  value={farmerName}
                  onChange={(e) => setFarmerName(e.target.value)}
                  className="text-xs"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">WUA Name</label>
                <Input
                  placeholder="e.g. HVIP Sector B4 Lateral Group"
                  value={wuaName}
                  onChange={(e) => setWuaName(e.target.value)}
                  className="text-xs"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Amount Paid (NGN ₦) *</label>
              <Input
                type="number"
                min="100"
                step="500"
                value={amountNgn}
                onChange={(e) => setAmountNgn(Number(e.target.value))}
                className="text-xs font-bold text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Payment Date</label>
                <Input
                  type="date"
                  value={paidOn}
                  onChange={(e) => setPaidOn(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Paper Receipt Ref # *
                </label>
                <Input
                  placeholder="e.g. REC-2026-0012"
                  value={fieldReceiptRef}
                  onChange={(e) => setFieldReceiptRef(e.target.value)}
                  className={`text-xs ${errors.fieldReceiptRef ? 'border-rose-500' : ''}`}
                />
                {errors.fieldReceiptRef && (
                  <p className="text-[10px] text-rose-600">{errors.fieldReceiptRef}</p>
                )}
              </div>
            </div>
          </CardContent>

          <CardFooter className="px-5 py-3 border-t border-slate-100 flex justify-between bg-slate-50/50 rounded-b-2xl">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: '/field/capture' })}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold"
            >
              <Save className="h-4 w-4 mr-1.5" />
              Save Receipt on Device
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
