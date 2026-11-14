import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Camera, CheckCircle2, Send, Wifi, WifiOff } from 'lucide-react';
import {
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
  CreateDamSafetyInspectionInputSchema,
  type CreateDamSafetyInspectionInput,
} from '@idmis/contracts';
import { generateUuidV7, localDb, LocalStore } from '@idmis/sync';
import { getApiClient } from '@idmis/api-client';
import { useScope } from '../../shell/ScopeContext';
import { useDams } from '../blis/hooks';
import { useLookupValues } from '../core/hooks';

export type ComponentRating = 'good' | 'fair' | 'poor' | 'critical';

export type DamComponentKey =
  'dam_body' | 'spillway_1' | 'spillway_2' | 'inlet' | 'outlet' | 'electrical' | 'mechanical';

export interface DamComponentEvaluation {
  component: DamComponentKey;
  name: string;
  rating: ComponentRating;
  defectSummary: string;
}

const DAM_COMPONENTS: Array<{ component: DamComponentKey; name: string }> = [
  { component: 'dam_body', name: 'Main Embankment & Dam Crest' },
  { component: 'spillway_1', name: 'Primary Spillway Structure' },
  { component: 'spillway_2', name: 'Emergency Spillway & Chute' },
  { component: 'inlet', name: 'Reservoir Inlet & Intake Tower' },
  { component: 'outlet', name: 'Bottom Outlet & Low-Flow Sluices' },
  { component: 'electrical', name: 'Electrical Controls & Standby Genset' },
  { component: 'mechanical', name: 'Mechanical Gates, Hoists & Valves' },
];

export function FieldDamInspectionCaptureForm() {
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

  // Live Dams from DB
  const { dams = [], isLoading: loadingDams } = useDams({ limit: 50 });

  // Live Lookups
  const { data: hazardClasses = [] } = useLookupValues('hazard_class');
  const { data: ratingLookups = [] } = useLookupValues('component_rating');

  const [damId, setDamId] = React.useState('');
  const [inspectedOn, setInspectedOn] = React.useState(
    () => new Date().toISOString().split('T')[0],
  );
  const [nextDueOn, setNextDueOn] = React.useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  });
  const [hazardClassId, setHazardClassId] = React.useState('');
  const [safetyOfficer, setSafetyOfficer] = React.useState('Engr. Ibrahim Lawan');
  const [staffOnSite, setStaffOnSite] = React.useState(14);
  const [safetyBudgetNgn, setSafetyBudgetNgn] = React.useState('15000000');
  const [overallMeetsStandard, setOverallMeetsStandard] = React.useState(true);
  const [specificHazards, setSpecificHazards] = React.useState(
    'Upstream riprap minor displacement near chainage 2+400; downstream toe drainage clear.',
  );
  const [photoCount, setPhotoCount] = React.useState(3);

  const [evaluations, setEvaluations] = React.useState<DamComponentEvaluation[]>(
    DAM_COMPONENTS.map((c) => ({
      component: c.component,
      name: c.name,
      rating: 'good',
      defectSummary: 'Normal operational condition. No significant defects noted.',
    })),
  );

  React.useEffect(() => {
    if (dams.length > 0 && !damId) {
      setDamId(dams[0]!.id);
    }
  }, [dams, damId]);

  React.useEffect(() => {
    if (hazardClasses.length > 0 && !hazardClassId) {
      setHazardClassId(hazardClasses[0]!.id);
    }
  }, [hazardClasses, hazardClassId]);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [successId, setSuccessId] = React.useState<string | null>(null);

  const updateEvaluation = (index: number, field: keyof DamComponentEvaluation, value: unknown) => {
    setEvaluations((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const resolveRatingId = (code: string) => {
    const match = ratingLookups.find((r) => r.code === code);
    return match?.id || '018f3a5e-0003-7000-8010-000000000001';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!damId) {
      toastError('Dam Required', 'Please select a target dam.');
      return;
    }

    setIsSubmitting(true);
    try {
      const inspectionId = generateUuidV7();

      const payload: CreateDamSafetyInspectionInput = {
        damId,
        inspectedOn,
        nextDueOn: nextDueOn || undefined,
        hazardClassId: hazardClassId || undefined,
        safetyContact: safetyOfficer,
        staffOnSite: Number(staffOnSite) || undefined,
        safetyBudgetNgn: safetyBudgetNgn ? String(safetyBudgetNgn) : undefined,
        meetsStandard: overallMeetsStandard,
        specificHazards,
        components: evaluations.map((ev) => ({
          component: ev.component,
          ratingId: resolveRatingId(ev.rating),
          notes: ev.defectSummary,
        })),
      };

      // Strict validation
      CreateDamSafetyInspectionInputSchema.parse(payload);

      let syncedOnline = false;

      // Online attempt first
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const client = getApiClient();
          await client.createDamInspection(payload);
          syncedOnline = true;
        } catch (serverErr) {
          console.warn(
            'Direct dam inspection creation failed; falling back to offline outbox:',
            serverErr,
          );
        }
      }

      if (syncedOnline) {
        // Cache cleanly in local storage (zero pending outbox ops)
        await store.cacheCleanRecord(
          'dam_inspection',
          inspectionId,
          {
            ...payload,
            photoCount,
            status: 'synced',
            displayName: `Dam Inspection: ${dams.find((d) => d.id === damId)?.name || 'Dam'}`,
          },
          {
            schemeId: currentScope.id,
          },
        );
      } else {
        // Offline commit to Dexie
        await store.commitInsert(
          'dam_inspection',
          inspectionId,
          {
            ...payload,
            photoCount,
            status: 'saved_on_device',
            displayName: `Dam Inspection: ${dams.find((d) => d.id === damId)?.name || 'Dam'}`,
          },
          {
            schemeId: currentScope.id,
          },
        );
      }

      setSuccessId(inspectionId);
      if (syncedOnline) {
        success('Inspection Synced', 'Dam inspection uploaded directly to BLIS server.');
      } else {
        warning(
          'Saved Offline',
          'Dam inspection saved to offline outbox. Will sync when reconnected.',
        );
      }
    } catch (err) {
      console.error('Failed to commit dam inspection:', err);
      toastError('Inspection Failed', String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successId) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center max-w-lg mx-auto space-y-4">
        <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          {isOnline ? 'Dam Inspection Synced to Server' : 'Dam Inspection Captured Offline'}
        </h2>
        <p className="text-xs text-slate-500">
          Inspection record <span className="font-mono font-bold text-slate-700">{successId}</span>{' '}
          has been{' '}
          {isOnline ? 'synced to the TRIMING backend' : 'committed to the device offline outbox'}.
        </p>

        <div className="pt-2 flex flex-col gap-2">
          <Button
            className="w-full bg-teal-700 hover:bg-teal-800 text-white min-h-[44px]"
            onClick={() => {
              setSuccessId(null);
            }}
          >
            Record Another Inspection
          </Button>
          <Button
            variant="outline"
            className="w-full min-h-[44px]"
            onClick={() => navigate({ to: '/field/records' })}
          >
            View Field Records
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Dam Safety Surveillance Inspection</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Perform component-by-component structural inspection, hazard classification, and staff
            readiness.
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Dam & Schedule Details */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
            General Dam & Safety Officer Info
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Target Dam Asset *
              </label>
              <Select value={damId} onValueChange={setDamId} disabled={dams.length === 0}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue
                    placeholder={
                      loadingDams
                        ? 'Loading dams...'
                        : dams.length === 0
                          ? 'No dams registered'
                          : 'Select Dam'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {dams.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Hazard Classification *
              </label>
              <Select
                value={hazardClassId}
                onValueChange={setHazardClassId}
                disabled={hazardClasses.length === 0}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Hazard Class" />
                </SelectTrigger>
                <SelectContent>
                  {hazardClasses.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Inspection Date *
              </label>
              <Input
                type="date"
                required
                value={inspectedOn}
                onChange={(e) => setInspectedOn(e.target.value)}
                className="h-10 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Next Scheduled Due Date *
              </label>
              <Input
                type="date"
                required
                value={nextDueOn}
                onChange={(e) => setNextDueOn(e.target.value)}
                className="h-10 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Lead Dam Safety Engineer *
              </label>
              <Input
                required
                value={safetyOfficer}
                onChange={(e) => setSafetyOfficer(e.target.value)}
                className="h-10 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Dam Maintenance Staff on Site
              </label>
              <Input
                type="number"
                min={0}
                value={staffOnSite}
                onChange={(e) => setStaffOnSite(parseInt(e.target.value, 10) || 0)}
                className="h-10 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Annual Safety O&M Allocation (₦)
            </label>
            <Input
              type="number"
              value={safetyBudgetNgn}
              onChange={(e) => setSafetyBudgetNgn(e.target.value)}
              className="h-10 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="overallMeetsStandard"
              checked={overallMeetsStandard}
              onChange={(e) => setOverallMeetsStandard(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <label htmlFor="overallMeetsStandard" className="text-xs font-semibold text-slate-700">
              Facility Meets Overall Structural & Operational Safety Standards
            </label>
          </div>
        </div>

        {/* 7 Component Evaluations */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              Component Condition Evaluations (7 Critical Structures)
            </h3>
            <span className="text-[11px] text-slate-500">
              {evaluations.filter((e) => e.rating === 'good').length}/7 Good
            </span>
          </div>

          <div className="space-y-4">
            {evaluations.map((ev, index) => (
              <div
                key={ev.component}
                className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-semibold text-xs text-slate-800">{ev.name}</span>
                  <div className="flex items-center gap-1">
                    {(['good', 'fair', 'poor', 'critical'] as ComponentRating[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => updateEvaluation(index, 'rating', r)}
                        className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase transition-all ${
                          ev.rating === r
                            ? r === 'good'
                              ? 'bg-emerald-600 text-white'
                              : r === 'fair'
                                ? 'bg-amber-500 text-white'
                                : r === 'poor'
                                  ? 'bg-orange-600 text-white'
                                  : 'bg-rose-600 text-white'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <Input
                  value={ev.defectSummary}
                  onChange={(e) => updateEvaluation(index, 'defectSummary', e.target.value)}
                  placeholder="Describe observed defects, seepage, or mechanical status..."
                  className="h-8 text-xs bg-white"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Specific Hazards & Photo Attachments */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
            Observed Hazards & Photos
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Specific Hazard / Urgent Corrective Findings
            </label>
            <textarea
              rows={3}
              value={specificHazards}
              onChange={(e) => setSpecificHazards(e.target.value)}
              className="w-full text-xs rounded-md border border-slate-300 p-2 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-teal-50 border border-teal-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-teal-700" />
              <div>
                <p className="text-xs font-bold text-teal-900">Surveillance Field Photos</p>
                <p className="text-[10px] text-teal-700">{photoCount} photos captured on camera</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs border-teal-300 text-teal-800"
              onClick={() => setPhotoCount((c) => c + 1)}
            >
              Add Photo ({photoCount})
            </Button>
          </div>
        </div>

        {/* Submission actions */}
        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            className="text-xs"
            onClick={() => navigate({ to: '/field/capture' })}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-teal-700 hover:bg-teal-800 text-white min-h-[44px] px-6 text-xs font-bold"
          >
            <Send className="w-4 h-4 mr-1.5" />
            {isSubmitting
              ? 'Saving...'
              : isOnline
                ? 'Submit & Sync Inspection'
                : 'Commit Inspection Offline'}
          </Button>
        </div>
      </form>
    </div>
  );
}
