import * as React from 'react';
import {
  Table,
  CheckCircle2,
  Clock,
  Undo2,
  Lock,
  Cpu,
  PenTool,
  UploadCloud,
  FileText,
  CheckCheck,
} from 'lucide-react';
import {
  Button,
  Input,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@idmis/ui';
import { useScope } from '../../shell/ScopeContext';

export interface EntryIndicatorRow {
  id: string;
  code: string;
  name: string;
  level: 'pdo' | 'intermediate';
  unit: string;
  method: 'computed' | 'manual' | 'survey';
  computeKey?: string | null;
  annualTarget: string;
  lastQuarterValue: string;
  thisQuarterValue: string;
  status: 'draft' | 'submitted' | 'approved' | 'returned';
  notes?: string;
  evidenceFiles?: string[];
  computationSource?: {
    scheme: string;
    sourceTable: string;
    recordCount: number;
    lastComputedAt: string;
  };
}

export const mockEntryRows: EntryIndicatorRow[] = [
  {
    id: '018f3a70-0061-7000-8000-000000000001',
    code: '1a',
    name: 'Direct project beneficiaries',
    level: 'pdo',
    unit: 'Number',
    method: 'computed',
    computeKey: 'slis.beneficiaries',
    annualTarget: '10,000,000',
    lastQuarterValue: '8,150,000',
    thisQuarterValue: '8,420,500',
    status: 'submitted',
    notes: 'Rollup calculated from verified SLIS active farmer registry and household rosters.',
    computationSource: {
      scheme: 'All Active Schemes (HVIP, KRIP, Bakolori)',
      sourceTable: 'slis.farmers + slis.farmer_households',
      recordCount: 28490,
      lastComputedAt: 'Today, 06:00 AM',
    },
  },
  {
    id: '018f3a70-0061-7000-8000-000000000002',
    code: '1b',
    name: 'Female beneficiaries (%)',
    level: 'pdo',
    unit: '%',
    method: 'computed',
    computeKey: 'slis.beneficiaries_female_pct',
    annualTarget: '50.0',
    lastQuarterValue: '46.8',
    thisQuarterValue: '48.2',
    status: 'submitted',
    computationSource: {
      scheme: 'National Project Rollup',
      sourceTable: 'slis.farmers (gender breakdown)',
      recordCount: 28490,
      lastComputedAt: 'Today, 06:00 AM',
    },
  },
  {
    id: '018f3a70-0061-7000-8000-000000000003',
    code: '2a',
    name: 'Area provided with irrigation and drainage services',
    level: 'pdo',
    unit: 'ha',
    method: 'computed',
    computeKey: 'slis.area_serviced',
    annualTarget: '50,000',
    lastQuarterValue: '44,200',
    thisQuarterValue: '46,120',
    status: 'submitted',
    computationSource: {
      scheme: 'HVIP + KRIP + Bakolori Sectors',
      sourceTable: 'slis.farms (geodesic polygon compute)',
      recordCount: 34210,
      lastComputedAt: 'Today, 06:00 AM',
    },
  },
  {
    id: '018f3a70-0061-7000-8000-000000000004',
    code: '11',
    name: 'Matching grants disbursed to farmer interest groups',
    level: 'intermediate',
    unit: 'Number',
    method: 'manual',
    annualTarget: '450',
    lastQuarterValue: '390',
    thisQuarterValue: '412',
    status: 'submitted',
    notes: '22 new matching grants disbursed across Hadejia Valley Unit WUAs.',
    evidenceFiles: ['Matching_Grants_Tranche4_Approval.pdf'],
  },
  {
    id: '018f3a70-0061-7000-8000-000000000005',
    code: '12',
    name: 'Dams with upgraded instrumentation and real-time telemetry',
    level: 'intermediate',
    unit: 'Number',
    method: 'manual',
    annualTarget: '8',
    lastQuarterValue: '6',
    thisQuarterValue: '7',
    status: 'draft',
    notes: 'Tiga Dam piezometer telemetry installation successfully completed.',
    evidenceFiles: ['Tiga_Dam_Telemetry_Commissioning_Report.pdf'],
  },
  {
    id: '018f3a70-0061-7000-8000-000000000006',
    code: '14a',
    name: 'Yield of main product – Tomato (t/ha)',
    level: 'intermediate',
    unit: 't/ha',
    method: 'computed',
    computeKey: 'slis.yield.tomato',
    annualTarget: '30.0',
    lastQuarterValue: '26.8',
    thisQuarterValue: '28.4',
    status: 'submitted',
    computationSource: {
      scheme: 'Kano River Irrigation Project',
      sourceTable: 'slis.crop_production',
      recordCount: 840,
      lastComputedAt: 'Today, 06:00 AM',
    },
  },
  {
    id: '018f3a70-0061-7000-8000-000000000007',
    code: '15',
    name: 'Commercial partnerships with off-takers',
    level: 'intermediate',
    unit: 'Number',
    method: 'manual',
    annualTarget: '7',
    lastQuarterValue: '5',
    thisQuarterValue: '6',
    status: 'returned',
    notes: 'Please attach official signed MoU between Dangote Tomato Processing and Apex WUA.',
  },
];

export function QuarterlyDataEntryView() {
  const { currentScope } = useScope();
  const [selectedQuarter, setSelectedQuarter] = React.useState('2026-Q4');
  const [selectedScope, setSelectedScope] = React.useState('all');
  const [rows, setRows] = React.useState<EntryIndicatorRow[]>(mockEntryRows);

  // Modals & Drawers
  const [selectedRowForDetail, setSelectedRowForDetail] = React.useState<EntryIndicatorRow | null>(
    null,
  );
  const [editingRow, setEditingRow] = React.useState<EntryIndicatorRow | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const [editNotes, setEditNotes] = React.useState('');
  const [returnRow, setReturnRow] = React.useState<EntryIndicatorRow | null>(null);
  const [returnComment, setReturnComment] = React.useState('');

  const handleOpenEdit = (row: EntryIndicatorRow) => {
    setEditingRow(row);
    setEditValue(row.thisQuarterValue);
    setEditNotes(row.notes || '');
  };

  const handleSaveEdit = () => {
    if (!editingRow) return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === editingRow.id
          ? {
              ...r,
              thisQuarterValue: editValue,
              notes: editNotes,
              status: 'draft' as const,
            }
          : r,
      ),
    );
    setEditingRow(null);
  };

  const handleSubmitQuarter = () => {
    setRows((prev) =>
      prev.map((r) => (r.status === 'draft' ? { ...r, status: 'submitted' as const } : r)),
    );
  };

  const handleApproveRow = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'approved' as const } : r)));
  };

  const handleConfirmReturn = () => {
    if (!returnRow || !returnComment.trim()) return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === returnRow.id ? { ...r, status: 'returned' as const, notes: returnComment } : r,
      ),
    );
    setReturnRow(null);
    setReturnComment('');
  };

  return (
    <div className="space-y-4 animate-in fade-in-50">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Table className="h-3 w-3 text-teal-700" /> Quarterly Data Entry Matrix
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-bold text-slate-600">
              {currentScope.name || 'All Schemes'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Quarterly Monitoring Entry Grid
          </h2>
          <p className="text-xs text-slate-500">
            Submit seasonal indicator values, review formula-computed progress, upload evidence
            files, and approve scheme reports.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSubmitQuarter}
            className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold gap-1.5 shadow-xs cursor-pointer"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Submit Quarter for Review
          </Button>
        </div>
      </div>

      {/* Quarter & Scope Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700">Quarter:</span>
            <div className="w-36">
              <Select
                value={selectedQuarter}
                onValueChange={(val: string) => setSelectedQuarter(val)}
              >
                <SelectTrigger
                  aria-label="Select reporting quarter"
                  className="h-8.5 min-h-[34px] w-full bg-slate-50 border-slate-200 text-xs font-semibold rounded-lg hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
                >
                  <SelectValue placeholder="Quarter" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl border-slate-200">
                  <SelectItem value="2026-Q4" className="text-xs font-medium py-2">
                    2026 - Quarter 4 (Current)
                  </SelectItem>
                  <SelectItem value="2026-Q3" className="text-xs font-medium py-2">
                    2026 - Quarter 3
                  </SelectItem>
                  <SelectItem value="2026-Q2" className="text-xs font-medium py-2">
                    2026 - Quarter 2
                  </SelectItem>
                  <SelectItem value="2026-Q1" className="text-xs font-medium py-2">
                    2026 - Quarter 1
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700">Scope:</span>
            <div className="w-44">
              <Select value={selectedScope} onValueChange={(val: string) => setSelectedScope(val)}>
                <SelectTrigger
                  aria-label="Select scope filter"
                  className="h-8.5 min-h-[34px] w-full bg-slate-50 border-slate-200 text-xs font-semibold rounded-lg hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
                >
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl border-slate-200">
                  <SelectItem value="all" className="text-xs font-medium py-2">
                    National (All Schemes)
                  </SelectItem>
                  <SelectItem value="hvip" className="text-xs font-medium py-2">
                    Hadejia Valley (HVIP)
                  </SelectItem>
                  <SelectItem value="krip" className="text-xs font-medium py-2">
                    Kano River (KRIP)
                  </SelectItem>
                  <SelectItem value="bakolori" className="text-xs font-medium py-2">
                    Bakolori Irrigation Scheme
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className="text-slate-600 border-slate-300">
            {rows.filter((r) => r.status === 'approved').length} of {rows.length} Approved
          </Badge>
          <span className="text-slate-300">|</span>
          <span className="text-emerald-700 font-bold">Submission Cycle Open</span>
        </div>
      </div>

      {/* Quarterly Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 w-14">Code</th>
                <th className="py-3 px-4">Indicator & Method</th>
                <th className="py-3 px-4">Unit</th>
                <th className="py-3 px-4">Annual Target</th>
                <th className="py-3 px-4">Last Quarter</th>
                <th className="py-3 px-4">This Quarter Value</th>
                <th className="py-3 px-4">Review Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const isComputed = row.method === 'computed';
                return (
                  <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px]">
                        {row.code}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-bold text-slate-900 leading-snug">{row.name}</div>
                      <div className="mt-1 flex items-center gap-2">
                        {isComputed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            <Lock className="h-2.5 w-2.5" /> Computed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            <PenTool className="h-2.5 w-2.5" /> Manual Entry
                          </span>
                        )}
                        {row.notes && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[160px]">
                            {row.notes}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-700">{row.unit}</td>
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-500">
                      {row.annualTarget}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-500">
                      {row.lastQuarterValue}
                    </td>
                    <td className="py-3.5 px-4">
                      {isComputed ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-blue-900 bg-blue-50/80 px-2 py-1 rounded-lg border border-blue-200 text-xs">
                            {row.thisQuarterValue}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedRowForDetail(row)}
                            className="text-blue-600 hover:text-blue-800 text-[11px] underline font-bold cursor-pointer"
                          >
                            Breakdown
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-slate-900 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
                            {row.thisQuarterValue}
                          </span>
                          {row.status !== 'approved' && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(row)}
                              className="text-amber-700 hover:text-amber-900 text-[11px] underline font-bold cursor-pointer"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {row.status === 'approved' ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-300 text-emerald-800 bg-emerald-50 text-[10px] font-bold gap-1"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </Badge>
                      ) : row.status === 'submitted' ? (
                        <Badge
                          variant="outline"
                          className="border-teal-300 text-teal-800 bg-teal-50 text-[10px] font-bold gap-1"
                        >
                          <Clock className="h-3 w-3" /> Under Review
                        </Badge>
                      ) : row.status === 'returned' ? (
                        <Badge variant="destructive" className="text-[10px] font-bold gap-1">
                          <Undo2 className="h-3 w-3" /> Returned
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-slate-300 text-slate-600 text-[10px] font-bold"
                        >
                          Draft
                        </Badge>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {isComputed ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedRowForDetail(row)}
                          className="text-xs font-semibold gap-1 text-blue-700 border-blue-200 hover:bg-blue-50 cursor-pointer"
                        >
                          <Cpu className="h-3 w-3" /> Source
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenEdit(row)}
                            className="text-xs font-semibold gap-1 text-slate-700 cursor-pointer"
                          >
                            <FileText className="h-3 w-3" /> Value & Note
                          </Button>
                          {row.status === 'submitted' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReturnRow(row)}
                                className="text-xs font-semibold text-amber-800 border-amber-200 hover:bg-amber-50 cursor-pointer gap-1"
                              >
                                <Undo2 className="h-3 w-3" /> Return
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleApproveRow(row.id)}
                                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold gap-1 cursor-pointer"
                              >
                                <CheckCircle2 className="h-3 w-3" /> Approve
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Computed Value Source Breakdown Modal */}
      {selectedRowForDetail && (
        <Dialog
          open={!!selectedRowForDetail}
          onOpenChange={(open) => !open && setSelectedRowForDetail(null)}
        >
          <DialogContent className="max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200 px-2 py-0.5 rounded-full">
                  #{selectedRowForDetail.code} Computed Breakdown
                </span>
                <span className="text-xs font-bold text-slate-400">Locked System Calculation</span>
              </div>
              <DialogTitle className="text-lg font-black text-slate-900">
                {selectedRowForDetail.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-2">
                <div className="flex justify-between border-b border-blue-200/60 pb-1.5">
                  <span className="text-blue-900 font-bold">Computed Metric Value:</span>
                  <span className="font-mono font-black text-blue-950 text-sm">
                    {selectedRowForDetail.thisQuarterValue} {selectedRowForDetail.unit}
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Computation Key:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedRowForDetail.computeKey}
                  </span>
                </div>
                {selectedRowForDetail.computationSource && (
                  <>
                    <div className="flex justify-between py-0.5">
                      <span className="text-slate-500">Source Tables:</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {selectedRowForDetail.computationSource.sourceTable}
                      </span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-slate-500">Source Record Count:</span>
                      <span className="font-bold text-slate-900">
                        {selectedRowForDetail.computationSource.recordCount.toLocaleString()}{' '}
                        Verified Records
                      </span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-slate-500">Coverage Scope:</span>
                      <span className="font-bold text-slate-900">
                        {selectedRowForDetail.computationSource.scheme}
                      </span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-slate-500">Last Computation:</span>
                      <span className="font-bold text-slate-700">
                        {selectedRowForDetail.computationSource.lastComputedAt}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-500 leading-relaxed text-[11px]">
                <span className="font-bold text-slate-700 block mb-0.5">Audit Note:</span>
                Computed values are generated directly from authoritative SLIS spatial and
                demographic tables to ensure absolute reproducibility. They cannot be edited
                manually.
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedRowForDetail(null)}
                className="text-xs font-bold"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Manual Value Entry & Evidence Attachment Modal */}
      {editingRow && (
        <Dialog open={!!editingRow} onOpenChange={(open) => !open && setEditingRow(null)}>
          <DialogContent className="max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 text-amber-700 text-xs font-bold mb-1">
                <PenTool className="h-3.5 w-3.5" /> Manual Indicator Entry
              </div>
              <DialogTitle className="text-base font-black text-slate-900">
                #{editingRow.code}: {editingRow.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pt-2 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">
                  Quarter Value ({editingRow.unit}) *
                </label>
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Enter numeric value..."
                  className="text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Reporting & Evidence Notes</label>
                <Input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Explain source of value or field sampling..."
                  className="text-xs"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center space-y-1.5">
                <UploadCloud className="h-5 w-5 text-slate-400 mx-auto" />
                <span className="font-bold text-slate-700 block text-xs">
                  Supporting Evidence Upload
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Attach signed verification reports or laboratory results (PDF / JPG up to 10MB)
                </span>
                <Button size="sm" variant="outline" className="text-xs mt-1">
                  Choose File
                </Button>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingRow(null)}
                className="text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold"
              >
                Save Draft Value
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Return to Scheme Coordinator Modal */}
      {returnRow && (
        <Dialog open={!!returnRow} onOpenChange={(open) => !open && setReturnRow(null)}>
          <DialogContent className="max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 text-amber-700 text-xs font-bold mb-1">
                <Undo2 className="h-3.5 w-3.5" /> Return Quarterly Submission
              </div>
              <DialogTitle className="text-base font-black text-slate-900">
                Return Indicator #{returnRow.code}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pt-2 text-xs">
              <p className="text-slate-500">
                Provide instructions for the State Coordinator or Scheme M&E Officer. They will be
                required to update the value or provide requested proof documents.
              </p>
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Supervisor Return Comments *</label>
                <Input
                  placeholder="e.g. Please attach the signed off-taker agreement for validation..."
                  value={returnComment}
                  onChange={(e) => setReturnComment(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setReturnRow(null);
                  setReturnComment('');
                }}
                className="text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!returnComment.trim()}
                onClick={handleConfirmReturn}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
              >
                Confirm Return
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
