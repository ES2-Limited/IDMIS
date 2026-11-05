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
import { CreateCropProductionInputSchema, type CreateCropProductionInput } from '@idmis/contracts';
import { generateUuidV7, localDb, LocalStore } from '@idmis/sync';
import { useScope } from '../../shell/ScopeContext';

export function CropProductionFieldForm() {
  const navigate = useNavigate();
  const { currentScope } = useScope();
  const store = React.useMemo(() => new LocalStore(localDb), []);

  const [plotName, setPlotName] = React.useState('Plot B4-082 (1.45 ha)');
  const [cropName, setCropName] = React.useState('Maize (SAMMAZ-15)');
  const [areaHa, setAreaHa] = React.useState<number>(1.45);
  const [yieldT, setYieldT] = React.useState<number>(4.2);
  const [season, setSeason] = React.useState('2026 Dry Season');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    try {
      const productionId = generateUuidV7();
      const schemeId = currentScope.id || '018f3a70-0003-7000-8000-000000000001';

      const payload: CreateCropProductionInput = {
        id: productionId,
        schemeId,
        plotId: generateUuidV7(),
        seasonId: generateUuidV7(),
        cropTypeId: generateUuidV7(),
        areaHa: String(areaHa),
        yieldT: yieldT ? String(yieldT) : undefined,
      };

      // Strict contract validation
      CreateCropProductionInputSchema.parse(payload);

      // Commit locally to outbox
      await store.commitInsert(
        'crop_production',
        productionId,
        {
          ...payload,
          plotName,
          cropName,
          season,
          displayName: `${cropName} on ${plotName}`,
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
            <h2 className="text-lg font-extrabold text-slate-900">Crop Production Yield</h2>
            <p className="text-xs text-slate-500">Record seasonal harvest yield estimate</p>
          </div>
        </div>
        <Badge variant="outline" className="bg-lime-50 text-lime-800 border-lime-300 text-xs">
          Offline Survey
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
              <label className="text-xs font-semibold text-slate-700">
                Irrigation Plot Identifier *
              </label>
              <Input
                placeholder="e.g. Plot B4-082"
                value={plotName}
                onChange={(e) => setPlotName(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Crop Variety</label>
              <Select value={cropName} onValueChange={(val) => setCropName(val)}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Crop variety" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Maize (SAMMAZ-15)">Maize (SAMMAZ-15)</SelectItem>
                  <SelectItem value="Rice (FARO-44)">Rice (FARO-44)</SelectItem>
                  <SelectItem value="Tomato (Roma VF)">Tomato (Roma VF)</SelectItem>
                  <SelectItem value="Wheat (Atilla)">Wheat (Atilla)</SelectItem>
                  <SelectItem value="Onion (Red Creole)">Onion (Red Creole)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Area Cultivated (ha) *
                </label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={areaHa}
                  onChange={(e) => setAreaHa(Number(e.target.value))}
                  className="text-xs font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Harvest Yield (Tons)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={yieldT}
                  onChange={(e) => setYieldT(Number(e.target.value))}
                  className="text-xs font-bold"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Irrigation Season</label>
              <Input
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="e.g. 2026 Dry Season"
                className="text-xs"
              />
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
              Save Yield on Device
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
