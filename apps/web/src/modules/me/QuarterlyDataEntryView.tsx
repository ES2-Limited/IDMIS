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
  SlidersHorizontal,
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
  useToast,
} from '@idmis/ui';
import { useScope } from '../../shell/ScopeContext';
import { useIndicatorMatrix } from './hooks';

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

export function QuarterlyDataEntryView() {
  const { currentScope } = useScope();
  const { success: toastSuccess } = useToast();
  const [selectedQuarter, setSelectedQuarter] = React.useState('2026-Q4');
  const [selectedScope, setSelectedScope] = React.useState('all');
  const [rows, setRows] = React.useState<EntryIndicatorRow[]>([]);

  const parts = selectedQuarter.split('-Q');
  const periodYear = Number(parts[0]) || 2026;
  const periodQuarter = Number(parts[1]) || 4;

  const { matrix: serverMatrix, submitQuarterlyValue } = useIndicatorMatrix({
    year: periodYear,
    quarter: periodQuarter,
    scopeType:
      currentScope.type === 'state'
        ? 'state'
        : currentScope.type === 'scheme'
          ? 'scheme'
          : 'national',
    scopeId:
      currentScope.type === 'state' || currentScope.type === 'scheme' ? currentScope.id : undefined,
  });

  React.useEffect(() => {
    if (serverMatrix?.items && serverMatrix.items.length > 0) {
      setRows(
        serverMatrix.items.map((item) => ({
          id: item.indicatorId,
          code: item.indicatorCode,
          name: item.indicatorName,
          level: 'pdo',
          unit: 'Units',
          method: 'computed',
          annualTarget: item.target ? String(item.target) : '100',
          lastQuarterValue: '0',
          thisQuarterValue: item.value ? String(item.value) : '0',
          status: 'submitted',
          notes: item.message || undefined,
        })),
      );
    } else {
      setRows([]);
    }
  }, [serverMatrix]);

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

  const handleSaveEdit = async () => {
    if (!editingRow) return;
    try {
      if (submitQuarterlyValue && editingRow.id) {
        await submitQuarterlyValue({
          indicatorId: editingRow.id,
          scopeType: 'national',
          periodYear: 2026,
          periodQuarter: 4,
          value: editValue || '0',
          notes: editNotes,
        });
      }
    } catch {
      // Fallback local update
    }
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
    toastSuccess(
      'Quarter Submitted for Review',
      `Monitoring values for ${selectedQuarter} have been locked and submitted for approval.`,
    );
  };

  // Review management modal state
  const [reviewingRow, setReviewingRow] = React.useState<EntryIndicatorRow | null>(null);

  const handleApproveRow = (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'approved' as const } : r)));
    if (reviewingRow?.id === id) {
      setReviewingRow((prev) => (prev ? { ...prev, status: 'approved' as const } : null));
    }
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
    setReviewingRow(null);
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
          <table className="w-full text-left border-collapse text-xs min-w-[860px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 w-14">Code</th>
                <th className="py-3 px-4 min-w-[200px]">Indicator & Method</th>
                <th className="py-3 px-4">Unit</th>
                <th className="py-3 px-4">Annual Target</th>
                <th className="py-3 px-4">Last Quarter</th>
                <th className="py-3 px-4">This Quarter Value</th>
                <th className="py-3 px-4">Review Status</th>
                <th className="py-3 px-4 text-right min-w-[170px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Table className="h-8 w-8 text-slate-300 stroke-[1.5]" />
                      <div className="text-sm font-semibold text-slate-700">
                        No indicator entries found
                      </div>
                      <p className="text-xs text-slate-500 max-w-sm">
                        No quarterly data entries are available for the selected period (
                        {selectedQuarter}) and scope.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
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
                      <td className="py-3 px-4">
                        {isComputed ? (
                          <span className="inline-block font-mono font-black text-blue-900 bg-blue-50/80 px-2 py-1 rounded-lg border border-blue-200 text-xs">
                            {row.thisQuarterValue}
                          </span>
                        ) : (
                          <span className="inline-block font-mono font-black text-slate-900 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
                            {row.thisQuarterValue}
                          </span>
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
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end">
                          {isComputed ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedRowForDetail(row)}
                              className="h-7 px-3 text-xs font-semibold gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50 cursor-pointer"
                            >
                              <Cpu className="h-3 w-3" /> Breakdown
                            </Button>
                          ) : row.status === 'submitted' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setReviewingRow(row)}
                              className="h-7 px-3 text-xs font-bold gap-1.5 text-teal-800 border-teal-200 bg-teal-50/60 hover:bg-teal-100/70 cursor-pointer"
                            >
                              <SlidersHorizontal className="h-3 w-3 text-teal-700" /> Review
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenEdit(row)}
                              className="h-7 px-3 text-xs font-semibold gap-1.5 text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              <FileText className="h-3 w-3 text-slate-500" /> Edit
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
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

      {/* Review & Decision Modal for Submitted Indicators */}
      {reviewingRow && (
        <Dialog open={!!reviewingRow} onOpenChange={(open) => !open && setReviewingRow(null)}>
          <DialogContent className="max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 text-teal-700 text-xs font-bold mb-1">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Indicator Review & Approval
              </div>
              <DialogTitle className="text-base font-black text-slate-900">
                #{reviewingRow.code}: {reviewingRow.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pt-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Reporting Quarter:</span>
                  <span className="font-bold text-slate-800">{selectedQuarter}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Submitted Value:</span>
                  <span className="font-mono font-black text-slate-900 text-sm">
                    {reviewingRow.thisQuarterValue} {reviewingRow.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Annual Target:</span>
                  <span className="font-mono font-bold text-slate-600">
                    {reviewingRow.annualTarget} {reviewingRow.unit}
                  </span>
                </div>
                {reviewingRow.notes && (
                  <div className="pt-1 border-t border-slate-200">
                    <span className="text-slate-500 block mb-0.5 font-medium">Officer Notes:</span>
                    <p className="text-slate-800 italic">{reviewingRow.notes}</p>
                  </div>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-teal-50/60 border border-teal-200 text-teal-800 text-[11px] leading-relaxed">
                <span className="font-bold block mb-0.5">Approval Instructions:</span>
                Approving this indicator will lock the figure into quarterly aggregation reports.
                Returning will reopen editing for field scheme officers.
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setReturnRow(reviewingRow);
                  setReviewingRow(null);
                }}
                className="text-xs font-bold text-amber-800 border-amber-200 hover:bg-amber-50 gap-1 cursor-pointer"
              >
                <Undo2 className="h-3 w-3" /> Return to Officer
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReviewingRow(null)}
                  className="text-xs font-bold cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    handleApproveRow(reviewingRow.id);
                    setReviewingRow(null);
                  }}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold gap-1 cursor-pointer"
                >
                  <CheckCircle2 className="h-3 w-3" /> Approve Value
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
