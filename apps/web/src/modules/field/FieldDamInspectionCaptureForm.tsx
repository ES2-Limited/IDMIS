import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Camera, CheckCircle2, Send } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Badge,
} from '@idmis/ui';
import { localDb, LocalStore } from '@idmis/sync';
import { useScope } from '../../shell/ScopeContext';

export type ComponentRating = 'good' | 'fair' | 'poor' | 'critical';

export interface DamComponentEvaluation {
  component: string;
  name: string;
  rating: ComponentRating;
  defectSummary: string;
}

const DAM_COMPONENTS = [
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
  const store = React.useMemo(() => new LocalStore(localDb), []);

  const [damName, setDamName] = React.useState('Tiga Dam (DAM-HJB-001)');
  const [inspectedOn, setInspectedOn] = React.useState(new Date().toISOString().split('T')[0]);
  const [nextDueOn, setNextDueOn] = React.useState('2027-05-15');
  const [hazardClass, setHazardClass] = React.useState<'high' | 'significant' | 'low'>('high');
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

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [successId, setSuccessId] = React.useState<string | null>(null);

  const handleRatingChange = (componentKey: string, rating: ComponentRating) => {
    setEvaluations((prev) =>
      prev.map((e) => (e.component === componentKey ? { ...e, rating } : e)),
    );
  };

  const handleDefectChange = (componentKey: string, defectSummary: string) => {
    setEvaluations((prev) =>
      prev.map((e) => (e.component === componentKey ? { ...e, defectSummary } : e)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const inspectionId = `insp-${Date.now()}`;
      const payload = {
        inspectionId,
        damName,
        inspectedOn,
        nextDueOn,
        hazardClass,
        safetyOfficer,
        staffOnSite,
        safetyBudgetNgn,
        meetsStandard: overallMeetsStandard,
        specificHazards,
        evaluations,
        photoCount,
        capturedAt: new Date().toISOString(),
        schemeId: currentScope.id,
      };

      // Commit to local Dexie sync outbox
      await store.commitInsert('dam_inspection', inspectionId, {
        ...payload,
        status: 'saved_on_device',
        displayName: `Dam Inspection: ${damName}`,
      });

      setSuccessId(inspectionId);
    } catch (err) {
      console.error('Failed to commit offline inspection to outbox:', err);
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
        <h2 className="text-xl font-bold text-slate-900">Dam Inspection Captured Offline</h2>
        <p className="text-xs text-slate-500">
          Inspection record <span className="font-mono font-bold text-slate-700">{successId}</span>{' '}
          has been committed to the offline outbox. When your device reconnects, it will
          automatically sync to TRIMING backend and update the dam's condition status on the
          interactive map.
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
            View Offline Outbox Records
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900">Dam Safety Surveillance Inspection</h1>
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-mono text-[11px]">
            Offline Field Form
          </Badge>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Perform component-by-component structural inspection, hazard classification, and staff
          readiness.
        </p>
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
              <Select value={damName} onValueChange={setDamName}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tiga Dam (DAM-HJB-001)">Tiga Dam (DAM-HJB-001)</SelectItem>
                  <SelectItem value="Bakolori Dam (DAM-SRB-001)">
                    Bakolori Dam (DAM-SRB-001)
                  </SelectItem>
                  <SelectItem value="Goronyo Dam (DAM-SRB-002)">
                    Goronyo Dam (DAM-SRB-002)
                  </SelectItem>
                  <SelectItem value="Challawa Gorge Dam (DAM-HJB-002)">
                    Challawa Gorge Dam (DAM-HJB-002)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Hazard Classification *
              </label>
              <Select
                value={hazardClass}
                onValueChange={(v: 'high' | 'significant' | 'low') => setHazardClass(v)}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High Hazard Potential</SelectItem>
                  <SelectItem value="significant">Significant Hazard Potential</SelectItem>
                  <SelectItem value="low">Low Hazard Potential</SelectItem>
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
                Operating Staff on Site
              </label>
              <Input
                type="number"
                value={staffOnSite}
                onChange={(e) => setStaffOnSite(Number(e.target.value))}
                className="h-10 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Component Conditions Evaluation */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              Component-by-Component Condition Ratings
            </h3>
            <p className="text-slate-400 text-xs mt-0.5">
              Grade each structural component as Good, Fair, Poor, or Critical.
            </p>
          </div>

          <div className="space-y-3 divide-y divide-slate-100">
            {evaluations.map((item) => (
              <div key={item.component} className="pt-3 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="font-bold text-xs text-slate-900">{item.name}</div>
                  <div className="flex items-center gap-1.5">
                    {(['good', 'fair', 'poor', 'critical'] as ComponentRating[]).map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => handleRatingChange(item.component, rating)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded capitalize min-h-[36px] transition-all ${
                          item.rating === rating
                            ? rating === 'good'
                              ? 'bg-emerald-700 text-white shadow-sm'
                              : rating === 'fair'
                                ? 'bg-amber-600 text-white shadow-sm'
                                : rating === 'poor'
                                  ? 'bg-orange-600 text-white shadow-sm'
                                  : 'bg-rose-700 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                </div>

                <Input
                  placeholder="Notes or defect observations for this component..."
                  value={item.defectSummary}
                  onChange={(e) => handleDefectChange(item.component, e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Specific Hazards & Verification */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
            Risk Assessment & Compliance
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Identified Specific Hazards & Defect Narrative
            </label>
            <textarea
              rows={3}
              value={specificHazards}
              onChange={(e) => setSpecificHazards(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Annual Safety Maintenance Budget (NGN)
              </label>
              <Input
                type="number"
                value={safetyBudgetNgn}
                onChange={(e) => setSafetyBudgetNgn(e.target.value)}
                className="h-10 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Geo-Tagged Photo Attachments
              </label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPhotoCount((p) => p + 1)}
                  className="h-10 text-xs gap-1.5 flex-1"
                >
                  <Camera className="w-4 h-4 text-slate-600" />
                  Attach Site Photo ({photoCount})
                </Button>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overallMeetsStandard}
                onChange={(e) => setOverallMeetsStandard(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded"
              />
              <span className="text-xs font-semibold text-slate-700">
                Dam barrier and hydraulic appurtenances satisfy statutory safety regulatory
                standards.
              </span>
            </label>
          </div>
        </div>

        {/* Submit Action */}
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-teal-700 hover:bg-teal-800 text-white min-h-[48px] font-bold text-xs shadow-md gap-2"
        >
          <Send className="w-4 h-4" />
          {isSubmitting ? 'Saving to Sync Outbox...' : 'Commit Dam Inspection Offline'}
        </Button>
      </form>
    </div>
  );
}
