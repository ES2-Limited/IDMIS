import * as React from 'react';
import { Search, Plus, ArrowUpRight } from 'lucide-react';
import {
  Button,
  Input,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@idmis/ui';
import { Link } from '@tanstack/react-router';
import { useCan } from '../../auth';
import { useScope } from '../../shell/ScopeContext';

export interface DamSafetyInspectionRecord {
  id: string;
  damName: string;
  damCode: string;
  basinName: string;
  inspectedOn: string;
  nextDueOn: string;
  hazardClass: 'high' | 'significant' | 'low';
  overallCondition: 'good' | 'fair' | 'poor' | 'critical';
  leadEngineer: string;
  staffOnSite: number;
  safetyBudgetNgn: number;
  meetsStandard: boolean;
  specificHazards: string;
  components: {
    dam_body: 'good' | 'fair' | 'poor' | 'critical';
    spillway_1: 'good' | 'fair' | 'poor' | 'critical';
    spillway_2: 'good' | 'fair' | 'poor' | 'critical';
    inlet: 'good' | 'fair' | 'poor' | 'critical';
    outlet: 'good' | 'fair' | 'poor' | 'critical';
    electrical: 'good' | 'fair' | 'poor' | 'critical';
    mechanical: 'good' | 'fair' | 'poor' | 'critical';
  };
  photoCount: number;
  status: 'submitted' | 'approved' | 'returned';
}

export const mockInspections: DamSafetyInspectionRecord[] = [
  {
    id: 'insp-001',
    damName: 'Tiga Dam',
    damCode: 'DAM-HJB-001',
    basinName: "Hadejia-Jama'are River Basin",
    inspectedOn: '2026-10-14',
    nextDueOn: '2027-05-15',
    hazardClass: 'high',
    overallCondition: 'good',
    leadEngineer: 'Engr. Ibrahim Lawan (HJRBDA)',
    staffOnSite: 14,
    safetyBudgetNgn: 15000000,
    meetsStandard: true,
    specificHazards:
      'Upstream riprap minor wave displacement near chainage 2+400; downstream toe drain discharge clear.',
    components: {
      dam_body: 'good',
      spillway_1: 'good',
      spillway_2: 'good',
      inlet: 'fair',
      outlet: 'good',
      electrical: 'good',
      mechanical: 'good',
    },
    photoCount: 6,
    status: 'approved',
  },
  {
    id: 'insp-002',
    damName: 'Bakolori Dam',
    damCode: 'DAM-SRB-001',
    basinName: 'Sokoto-Rima River Basin',
    inspectedOn: '2026-09-22',
    nextDueOn: '2027-04-10',
    hazardClass: 'high',
    overallCondition: 'good',
    leadEngineer: 'Engr. Shehu Aliyu (SRRBDA)',
    staffOnSite: 18,
    safetyBudgetNgn: 22000000,
    meetsStandard: true,
    specificHazards:
      'Stilling basin clean; radial gates tested under partial load without cavitation.',
    components: {
      dam_body: 'good',
      spillway_1: 'good',
      spillway_2: 'fair',
      inlet: 'good',
      outlet: 'good',
      electrical: 'good',
      mechanical: 'good',
    },
    photoCount: 8,
    status: 'approved',
  },
  {
    id: 'insp-003',
    damName: 'Goronyo Dam',
    damCode: 'DAM-SRB-002',
    basinName: 'Sokoto-Rima River Basin',
    inspectedOn: '2026-08-30',
    nextDueOn: '2027-03-01',
    hazardClass: 'high',
    overallCondition: 'fair',
    leadEngineer: 'Engr. Aminu Bello',
    staffOnSite: 11,
    safetyBudgetNgn: 18000000,
    meetsStandard: true,
    specificHazards:
      'Vegetation growth along secondary saddle dyke requires immediate clearance before rainy season cresting.',
    components: {
      dam_body: 'fair',
      spillway_1: 'good',
      spillway_2: 'fair',
      inlet: 'fair',
      outlet: 'fair',
      electrical: 'fair',
      mechanical: 'good',
    },
    photoCount: 5,
    status: 'approved',
  },
  {
    id: 'insp-004',
    damName: 'Challawa Gorge Dam',
    damCode: 'DAM-HJB-002',
    basinName: "Hadejia-Jama'are River Basin",
    inspectedOn: '2026-11-02',
    nextDueOn: '2027-06-15',
    hazardClass: 'high',
    overallCondition: 'fair',
    leadEngineer: 'Engr. Fatima Garba',
    staffOnSite: 12,
    safetyBudgetNgn: 14000000,
    meetsStandard: true,
    specificHazards:
      'Intake trash rack clearing scheduled for next quarter; morning glory spillway crest intact.',
    components: {
      dam_body: 'good',
      spillway_1: 'fair',
      spillway_2: 'fair',
      inlet: 'fair',
      outlet: 'good',
      electrical: 'fair',
      mechanical: 'fair',
    },
    photoCount: 4,
    status: 'submitted',
  },
  {
    id: 'insp-005',
    damName: 'Hadejia Barrage & Weir',
    damCode: 'DAM-HJB-003',
    basinName: "Hadejia-Jama'are River Basin",
    inspectedOn: '2026-10-05',
    nextDueOn: '2027-01-15',
    hazardClass: 'significant',
    overallCondition: 'poor',
    leadEngineer: 'Engr. Kabir Sanusi',
    staffOnSite: 6,
    safetyBudgetNgn: 8500000,
    meetsStandard: false,
    specificHazards:
      'Sluice gate hoist #3 jammed due to silt accumulation; emergency desilting and motor overhaul required.',
    components: {
      dam_body: 'fair',
      spillway_1: 'poor',
      spillway_2: 'poor',
      inlet: 'poor',
      outlet: 'poor',
      electrical: 'poor',
      mechanical: 'critical',
    },
    photoCount: 7,
    status: 'returned',
  },
];

export function DamInspectionsListView() {
  const { currentScope } = useScope();
  const canInspect = useCan('blis.irrigation.write');
  const [search, setSearch] = React.useState('');
  const [conditionFilter, setConditionFilter] = React.useState<string>('all');
  const [inspections] = React.useState<DamSafetyInspectionRecord[]>(mockInspections);
  const [selectedInspection, setSelectedInspection] =
    React.useState<DamSafetyInspectionRecord | null>(null);

  const filtered = React.useMemo(() => {
    return inspections.filter((item) => {
      const matchSearch =
        item.damName.toLowerCase().includes(search.toLowerCase()) ||
        item.damCode.toLowerCase().includes(search.toLowerCase()) ||
        item.leadEngineer.toLowerCase().includes(search.toLowerCase()) ||
        item.basinName.toLowerCase().includes(search.toLowerCase());
      const matchCond = conditionFilter === 'all' || item.overallCondition === conditionFilter;
      return matchSearch && matchCond;
    });
  }, [inspections, search, conditionFilter]);

  const getConditionBadge = (c: DamSafetyInspectionRecord['overallCondition']) => {
    switch (c) {
      case 'good':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
            Good Condition
          </Badge>
        );
      case 'fair':
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300">Fair Condition</Badge>
        );
      case 'poor':
        return (
          <Badge className="bg-orange-100 text-orange-800 border-orange-300">
            Poor (Action Req.)
          </Badge>
        );
      case 'critical':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-300">Critical Alert</Badge>;
    }
  };

  const getStatusBadge = (s: DamSafetyInspectionRecord['status']) => {
    switch (s) {
      case 'approved':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Approved</Badge>
        );
      case 'submitted':
        return <Badge className="bg-sky-100 text-sky-800 border-sky-300">Under Review</Badge>;
      case 'returned':
        return (
          <Badge className="bg-rose-100 text-rose-800 border-rose-300">Returned for Action</Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Dam Safety Surveillance & Inspections
            </h1>
            <Badge className="bg-teal-100 text-teal-800 border-teal-200 font-mono text-xs">
              {currentScope.name || 'National Basin Scoped'}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Engineering surveillance registry, multi-component ratings, safety budgets, and
            statutory compliance audits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canInspect && (
            <Link
              to="/field/capture/dam-inspection"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-sm min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              Capture Dam Inspection
            </Link>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search inspections by dam, engineer, code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Select value={conditionFilter} onValueChange={setConditionFilter}>
            <SelectTrigger className="h-11 min-w-[150px] text-xs">
              <SelectValue placeholder="Condition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Conditions</SelectItem>
              <SelectItem value="good">Good</SelectItem>
              <SelectItem value="fair">Fair</SelectItem>
              <SelectItem value="poor">Poor</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Dam Asset & Code</th>
                <th className="py-3 px-4">Basin</th>
                <th className="py-3 px-4">Inspection Date</th>
                <th className="py-3 px-4">Next Due Date</th>
                <th className="py-3 px-4">Condition Assessment</th>
                <th className="py-3 px-4">Lead Safety Engineer</th>
                <th className="py-3 px-4">Audit Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No inspection audits found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 text-sm">{item.damName}</div>
                      <div className="text-slate-400 font-mono text-[11px]">{item.damCode}</div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700">{item.basinName}</td>
                    <td className="py-3.5 px-4 font-mono">{item.inspectedOn}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">{item.nextDueOn}</td>
                    <td className="py-3.5 px-4">{getConditionBadge(item.overallCondition)}</td>
                    <td className="py-3.5 px-4 text-slate-800 font-medium">{item.leadEngineer}</td>
                    <td className="py-3.5 px-4">{getStatusBadge(item.status)}</td>
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedInspection(item)}
                        className="min-h-[38px] text-xs gap-1 hover:text-teal-700"
                      >
                        Inspect
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspection Detail Modal */}
      {selectedInspection && (
        <Dialog
          open={!!selectedInspection}
          onOpenChange={(open) => !open && setSelectedInspection(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge className="bg-teal-100 text-teal-800 font-mono text-xs">
                  {selectedInspection.damCode}
                </Badge>
                {getConditionBadge(selectedInspection.overallCondition)}
                {getStatusBadge(selectedInspection.status)}
              </div>
              <DialogTitle className="text-xl font-bold text-slate-900 mt-2">
                {selectedInspection.damName} — Safety Surveillance Audit
              </DialogTitle>
              <p className="text-xs text-slate-500">
                Inspected on {selectedInspection.inspectedOn} by {selectedInspection.leadEngineer}
              </p>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              {/* Component breakdown grid */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-3.5 py-2 font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                  Component Condition Evaluation
                </div>
                <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-[11px] text-slate-400 block">Dam Embankment</span>
                    <span className="font-bold text-slate-800 capitalize">
                      {selectedInspection.components.dam_body}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-[11px] text-slate-400 block">Primary Spillway</span>
                    <span className="font-bold text-slate-800 capitalize">
                      {selectedInspection.components.spillway_1}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-[11px] text-slate-400 block">Emergency Spillway</span>
                    <span className="font-bold text-slate-800 capitalize">
                      {selectedInspection.components.spillway_2}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-[11px] text-slate-400 block">Inlet Works</span>
                    <span className="font-bold text-slate-800 capitalize">
                      {selectedInspection.components.inlet}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-[11px] text-slate-400 block">Outlet & Sluices</span>
                    <span className="font-bold text-slate-800 capitalize">
                      {selectedInspection.components.outlet}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-[11px] text-slate-400 block">Electrical Controls</span>
                    <span className="font-bold text-slate-800 capitalize">
                      {selectedInspection.components.electrical}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-[11px] text-slate-400 block">Mechanical Hoists</span>
                    <span className="font-bold text-slate-800 capitalize">
                      {selectedInspection.components.mechanical}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                    <span className="text-[11px] text-slate-400 block">Geo-Tagged Photos</span>
                    <span className="font-bold text-teal-800">
                      {selectedInspection.photoCount} attached
                    </span>
                  </div>
                </div>
              </div>

              {/* Specific Hazards & Budget */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                <div className="font-bold text-slate-800 text-[12px]">
                  Specific Hazard Observations:
                </div>
                <p className="text-slate-600 leading-relaxed">
                  {selectedInspection.specificHazards}
                </p>

                <div className="pt-2 grid grid-cols-2 gap-2 border-t border-slate-200">
                  <div>
                    <span className="text-slate-400">On-Site Surveillance Crew:</span>{' '}
                    <span className="font-bold text-slate-800">
                      {selectedInspection.staffOnSite} personnel
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Annual Safety Budget:</span>{' '}
                    <span className="font-bold text-teal-800 font-mono">
                      NGN {selectedInspection.safetyBudgetNgn.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSelectedInspection(null)}
                className="min-h-[44px] text-xs"
              >
                Close Audit Record
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
