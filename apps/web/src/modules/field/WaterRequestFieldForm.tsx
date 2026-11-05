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
import {
  CreateWaterRequestInputSchema,
  type CreateWaterRequestInput,
  type RequestLevel,
} from '@idmis/contracts';
import { generateUuidV7, localDb, LocalStore } from '@idmis/sync';
import { useScope } from '../../shell/ScopeContext';

export function WaterRequestFieldForm() {
  const navigate = useNavigate();
  const { currentScope } = useScope();
  const store = React.useMemo(() => new LocalStore(localDb), []);

  const [level, setLevel] = React.useState<RequestLevel>('individual');
  const [farmerName, setFarmerName] = React.useState('');
  const [wuaName, setWuaName] = React.useState('HVIP Sector B4 WUA');
  const [volumeM3, setVolumeM3] = React.useState<number>(1200);
  const [periodFromOn, setPeriodFromOn] = React.useState('2026-11-10');
  const [periodToOn, setPeriodToOn] = React.useState('2026-11-25');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    try {
      const requestId = generateUuidV7();
      const schemeId = currentScope.id || '018f3a70-0003-7000-8000-000000000001';

      const payload: CreateWaterRequestInput = {
        id: requestId,
        schemeId,
        level,
        farmerId: level === 'individual' ? generateUuidV7() : undefined,
        wuaId: level !== 'individual' ? generateUuidV7() : undefined,
        seasonId: generateUuidV7(),
        volumeM3: String(volumeM3),
        periodFromOn,
        periodToOn,
      };

      // Strict validation against contracts
      CreateWaterRequestInputSchema.parse(payload);

      // Commit locally to outbox
      await store.commitInsert(
        'water_request',
        requestId,
        {
          ...payload,
          displayName:
            level === 'individual' ? `Farmer: ${farmerName || 'Musa Ibrahim'}` : `WUA: ${wuaName}`,
          status: 'saved_on_device',
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
            <h2 className="text-lg font-extrabold text-slate-900">Water Service Request</h2>
            <p className="text-xs text-slate-500">Record seasonal canal water allocation</p>
          </div>
        </div>
        <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 text-xs">
          Offline Capture
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
              <label className="text-xs font-semibold text-slate-700">Request Level</label>
              <Select value={level} onValueChange={(val) => setLevel(val as RequestLevel)}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual Farmer</SelectItem>
                  <SelectItem value="unit">Unit WUA Block</SelectItem>
                  <SelectItem value="sector">Sector Lateral</SelectItem>
                  <SelectItem value="apex">Apex Scheme Service</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {level === 'individual' ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Farmer Identifier or Name
                </label>
                <Input
                  placeholder="e.g. Musa Ibrahim Danbatta"
                  value={farmerName}
                  onChange={(e) => setFarmerName(e.target.value)}
                  className="text-xs"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">WUA / Block Group</label>
                <Input
                  placeholder="e.g. HVIP Sector B4 Lateral Group"
                  value={wuaName}
                  onChange={(e) => setWuaName(e.target.value)}
                  className="text-xs"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Requested Volume (m³)</label>
              <Input
                type="number"
                min="10"
                step="10"
                value={volumeM3}
                onChange={(e) => setVolumeM3(Number(e.target.value))}
                className="text-xs font-medium"
              />
              <span className="text-[10px] text-slate-400">Canal discharge requirement</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Delivery From</label>
                <Input
                  type="date"
                  value={periodFromOn}
                  onChange={(e) => setPeriodFromOn(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Delivery To</label>
                <Input
                  type="date"
                  value={periodToOn}
                  onChange={(e) => setPeriodToOn(e.target.value)}
                  className={`text-xs ${errors.periodToOn ? 'border-rose-500' : ''}`}
                />
                {errors.periodToOn && (
                  <p className="text-[10px] text-rose-600">{errors.periodToOn}</p>
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
              Save to Device
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
