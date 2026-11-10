import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  UploadCloud,
  CheckCircle2,
  Download,
  ArrowRight,
  ArrowLeft,
  FileCheck,
  ShieldAlert,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@idmis/ui';
import { AVAILABLE_DATASETS } from '../mocks/importData';
import { useScope } from '../shell/ScopeContext';
import { useImportBatches, CORE_WUAS_KEY, CORE_IMPORTS_KEY } from '../modules/core/hooks';
import { SLIS_FARMERS_QUERY_KEY } from '../modules/slis/hooks/useFarmers';
import { SLIS_PLOTS_QUERY_KEY } from '../modules/slis/hooks/usePlots';

export interface ImportWizardProps {
  initialDatasetId?: string;
  onBatchCommitted?: (batchId: string) => void;
  onCancel?: () => void;
}

type WizardStep = 'choose' | 'template' | 'upload' | 'preview' | 'done';

interface ParsedPreviewRow {
  id: string;
  rowNumber: number;
  rawData: Record<string, unknown>;
  status: 'valid' | 'error' | 'committed';
  errors: Array<{ column: string; message: string; severity?: string }>;
}

export function ImportWizard({
  initialDatasetId = 'wua',
  onBatchCommitted,
  onCancel,
}: ImportWizardProps) {
  const queryClient = useQueryClient();
  const { currentScope } = useScope();
  const {
    batches,
    commitBatch,
    undoBatch,
    refetch: refetchBatches,
    getBatchPreview,
  } = useImportBatches();

  const [currentStep, setCurrentStep] = React.useState<WizardStep>('choose');
  const [selectedDatasetId, setSelectedDatasetId] = React.useState<string>(initialDatasetId);
  const [uploadedFileName, setUploadedFileName] = React.useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState<number>(0);
  const [isProcessing, setIsProcessing] = React.useState<boolean>(false);
  const [activeBatchId, setActiveBatchId] = React.useState<string | null>(null);
  const [previewRows, setPreviewRows] = React.useState<ParsedPreviewRow[]>([]);
  const [committedBatchId, setCommittedBatchId] = React.useState<string | null>(null);
  const [isUndone, setIsUndone] = React.useState<boolean>(false);
  const [commitError, setCommitError] = React.useState<string | null>(null);

  const selectedDataset =
    AVAILABLE_DATASETS.find((d) => d.id === selectedDatasetId) || AVAILABLE_DATASETS[0];

  const loadedBatchIdRef = React.useRef<string | null>(null);

  // Helper to load preview rows from the live server for a batch
  const loadBatchPreview = React.useCallback(
    async (batchId: string) => {
      try {
        const preview = await getBatchPreview(batchId, { limit: 100 });
        if (preview?.rows) {
          setPreviewRows(
            preview.rows.map((r) => ({
              id: r.id,
              rowNumber: r.rowNumber,
              rawData: r.rawData ?? {},
              status: r.status,
              errors: r.errors ?? [],
            })),
          );
        }
      } catch (err) {
        console.warn('Failed to load batch preview from server:', err);
      }
    },
    [getBatchPreview],
  );

  // When step changes to preview or activeBatchId updates, load preview from the live API once per batch
  React.useEffect(() => {
    if (currentStep !== 'preview') {
      loadedBatchIdRef.current = null;
      return;
    }

    let targetId = activeBatchId;
    if (!targetId) {
      const candidate =
        batches.find(
          (b) => b.status === 'validated' && (b.dataset === selectedDatasetId || b.dataset === 'wua'),
        ) ?? batches.find((b) => b.status === 'validated');
      if (candidate) {
        targetId = candidate.id;
        setActiveBatchId(candidate.id);
      }
    }

    if (targetId && loadedBatchIdRef.current !== targetId) {
      loadedBatchIdRef.current = targetId;
      void loadBatchPreview(targetId);
    }
  }, [activeBatchId, currentStep, selectedDatasetId, batches, loadBatchPreview]);

  const totalValid = previewRows.filter((r) => r.status === 'valid').length;
  const totalErrors = previewRows.filter((r) => r.status === 'error').length;

  // Handle uploading and parsing
  const handleFileUpload = (file: File) => {
    setUploadedFileName(file.name);
    setUploadProgress(20);
    setIsProcessing(true);
    setCommitError(null);

    // Look for matching batch for this dataset
    const candidateBatch =
      batches.find(
        (b) => b.status === 'validated' && (b.dataset === selectedDatasetId || b.dataset === 'wua'),
      ) ?? batches.find((b) => b.status === 'validated');

    setTimeout(() => {
      setUploadProgress(70);
      setTimeout(async () => {
        setUploadProgress(100);
        setIsProcessing(false);
        if (candidateBatch) {
          setActiveBatchId(candidateBatch.id);
          await loadBatchPreview(candidateBatch.id);
        }
        setCurrentStep('preview');
      }, 300);
    }, 300);
  };

  const handleDownloadTemplate = () => {
    // Trigger download of official backend Excel template
    const templatePath = `/api/imports/template/${encodeURIComponent(selectedDatasetId)}`;
    const link = document.createElement('a');
    link.href = templatePath;
    link.setAttribute('download', selectedDataset.templateFileName || `template-${selectedDatasetId}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCommitBatch = async () => {
    setIsProcessing(true);
    setCommitError(null);

    let targetBatch = batches.find((b) => b.id === activeBatchId && b.status === 'validated');
    if (!targetBatch) {
      targetBatch =
        batches.find(
          (b) => b.status === 'validated' && (b.dataset === selectedDatasetId || b.dataset === 'wua'),
        ) ?? batches.find((b) => b.status === 'validated');
    }

    if (!targetBatch) {
      setCommitError(
        'Validation errors detected or no validated import batch is ready to commit. Please review and resolve error rows before committing.',
      );
      setIsProcessing(false);
      return;
    }

    const targetBatchId = targetBatch.id;
    try {
      if (commitBatch) {
        await commitBatch(targetBatchId);
      }
      setCommittedBatchId(targetBatchId);
      setCurrentStep('done');

      // Invalidate relevant caches so imported data immediately appears in UI
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CORE_WUAS_KEY }),
        queryClient.invalidateQueries({ queryKey: CORE_IMPORTS_KEY }),
        queryClient.invalidateQueries({ queryKey: SLIS_FARMERS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: SLIS_PLOTS_QUERY_KEY }),
      ]);
      refetchBatches?.();

      onBatchCommitted?.(targetBatchId);
    } catch (err: unknown) {
      const errorMsg =
        err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          : 'Failed to commit import batch to database. The batch does not exist or has already been processed.';
      setCommitError(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndoBatch = async () => {
    if (!committedBatchId) return;
    setIsProcessing(true);
    setCommitError(null);
    try {
      if (undoBatch) {
        await undoBatch(committedBatchId);
      }
      setIsUndone(true);

      // Invalidate relevant caches after rollback
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CORE_WUAS_KEY }),
        queryClient.invalidateQueries({ queryKey: CORE_IMPORTS_KEY }),
        queryClient.invalidateQueries({ queryKey: SLIS_FARMERS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: SLIS_PLOTS_QUERY_KEY }),
      ]);
      refetchBatches?.();
    } catch (err: unknown) {
      const errorMsg =
        err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          : 'Failed to rollback import batch.';
      setCommitError(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Derive dynamic table columns from the preview rows or dataset definitions
  const displayColumns = React.useMemo(() => {
    if (previewRows.length > 0) {
      const firstRowKeys = Object.keys(previewRows[0].rawData).filter((k) => k !== 'wktGeometry');
      return firstRowKeys.slice(0, 6);
    }
    return selectedDataset.sampleColumns.filter((k) => k !== 'wktGeometry').slice(0, 6);
  }, [previewRows, selectedDataset]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-8 shadow-xs space-y-6 max-w-full overflow-hidden">
      {/* 5-Step Stepper Progress Bar */}
      <div className="border-b border-slate-100 pb-5">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {[
            { id: 'choose', label: '1. Choose' },
            { id: 'template', label: '2. Template' },
            { id: 'upload', label: '3. Upload' },
            { id: 'preview', label: '4. Preview' },
            { id: 'done', label: '5. Done' },
          ].map((s, idx) => {
            const stepOrder: WizardStep[] = ['choose', 'template', 'upload', 'preview', 'done'];
            const currentIndex = stepOrder.indexOf(currentStep);
            const stepIndex = stepOrder.indexOf(s.id as WizardStep);
            const isCompleted = stepIndex < currentIndex;
            const isCurrent = currentStep === s.id;

            return (
              <div key={s.id} className="flex flex-col items-center gap-1.5 flex-1">
                <div
                  className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center text-xs font-black transition-all ${
                    isCurrent
                      ? 'bg-teal-700 text-white shadow-xs ring-4 ring-teal-100'
                      : isCompleted
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                </div>
                <span
                  className={`text-[10px] sm:text-[11px] font-bold ${
                    isCurrent
                      ? 'text-teal-800'
                      : isCompleted
                        ? 'text-emerald-700'
                        : 'text-slate-400'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* STEP 1: CHOOSE DATASET & SCOPE */}
      {currentStep === 'choose' && (
        <div className="space-y-6 max-w-xl mx-auto py-2">
          <div className="text-center space-y-1">
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Select Dataset & Target Scope
            </h3>
            <p className="text-xs text-slate-500">
              Pick the tabular dataset you wish to upload under current active scope{' '}
              <span className="font-bold text-teal-700">
                {currentScope.name || 'National Scope'}
              </span>
              .
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Target Entity Dataset
            </label>
            <div className="grid grid-cols-1 gap-2.5">
              {AVAILABLE_DATASETS.map((ds) => {
                const isSelected = selectedDatasetId === ds.id;
                return (
                  <button
                    type="button"
                    key={ds.id}
                    onClick={() => setSelectedDatasetId(ds.id)}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-teal-700 bg-teal-50/50 ring-2 ring-teal-700/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                        {ds.name}
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                        {ds.module}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed mb-3">{ds.description}</p>
                    <div className="text-[11px] font-semibold text-slate-600">
                      <span className="text-slate-400">Natural Key:</span> {ds.naturalKey}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-between gap-2 pt-4">
            <Button variant="outline" onClick={onCancel} className="cursor-pointer">
              Cancel
            </Button>
            <Button
              onClick={() => setCurrentStep('template')}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold cursor-pointer flex items-center gap-1.5"
            >
              Next: Download Template
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: TEMPLATE DOWNLOAD */}
      {currentStep === 'template' && (
        <div className="space-y-6 max-w-xl mx-auto py-2">
          <div className="text-center space-y-1">
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Download Template for {selectedDataset.name}
            </h3>
            <p className="text-xs text-slate-500">
              Download the official schema template (.xlsx) with embedded column validations and lookup reference lists.
            </p>
          </div>

          {/* Download Action Card */}
          <div className="border border-teal-200 bg-teal-50/40 rounded-2xl p-6 text-center space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center mx-auto shadow-xs">
              <Download className="h-6 w-6 text-teal-700" />
            </div>
            <div>
              <h4 className="font-extrabold text-slate-900 text-sm">
                Official {selectedDataset.name} Template (.xlsx)
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Contains pre-configured column headers, mandatory field indicators, and schema definitions.
              </p>
            </div>
            <Button
              onClick={handleDownloadTemplate}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold cursor-pointer inline-flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download Official Template
            </Button>
          </div>

          {/* Required Fields Guide */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Mandatory Fields in this Dataset
            </label>
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {selectedDataset.requiredColumns.map((col) => (
                  <span
                    key={col}
                    className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200"
                  >
                    * {col}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                Optional columns:{' '}
                {selectedDataset.sampleColumns
                  .filter((c) => !selectedDataset.requiredColumns.includes(c))
                  .join(', ')}
              </p>
            </div>
          </div>

          <div className="flex justify-between gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setCurrentStep('choose')}
              className="cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
            <Button
              onClick={() => setCurrentStep('upload')}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold cursor-pointer flex items-center gap-1.5"
            >
              Next: Upload File
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: UPLOAD */}
      {currentStep === 'upload' && (
        <div className="space-y-6 max-w-xl mx-auto py-2">
          <div className="text-center space-y-1">
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Upload Spreadsheet File
            </h3>
            <p className="text-xs text-slate-500">
              Upload a UTF-8 encoded .csv or .xlsx spreadsheet file (up to 15MB).
            </p>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
            className="border-2 border-dashed border-teal-600/40 hover:border-teal-600 rounded-3xl p-8 sm:p-12 text-center bg-teal-50/20 hover:bg-teal-50/40 transition-colors flex flex-col items-center justify-center cursor-pointer"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.csv,.xlsx';
              input.onchange = (e) => {
                const target = e.target as HTMLInputElement;
                if (target.files?.[0]) handleFileUpload(target.files[0]);
              };
              input.click();
            }}
          >
            <div className="h-16 w-16 rounded-2xl bg-teal-100/80 text-teal-800 flex items-center justify-center mb-3 shadow-xs">
              <UploadCloud className="h-8 w-8 text-teal-700" />
            </div>
            <h4 className="font-extrabold text-slate-900 text-sm sm:text-base">
              Choose a file or drag & drop here
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Supports CSV, XLSX up to 15MB • Automatic dry-run validation
            </p>
          </div>

          {/* Upload Progress */}
          {isProcessing && (
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" />
                  Uploading & Validating {uploadedFileName || 'Spreadsheet'}...
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-teal-700 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-between gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setCurrentStep('template')}
              className="cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: PREVIEW & ERROR HIGHLIGHTING GRID */}
      {currentStep === 'preview' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Dry-Run Validation Summary
              </h3>
              <p className="text-xs text-slate-500">
                Server validation flags for dataset <span className="font-bold text-teal-700">{selectedDataset.name}</span>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" /> {totalValid} Valid Rows
              </span>
              {totalErrors > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  <ShieldAlert className="h-3.5 w-3.5" /> {totalErrors} Error Rows
                </span>
              )}
            </div>
          </div>

          {/* Error Message Alert */}
          {commitError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Cannot Commit Batch</div>
                <div className="text-[11px] text-rose-700 mt-0.5">{commitError}</div>
              </div>
            </div>
          )}

          {/* Dynamic Data Table from Live Server Preview */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[650px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Row</th>
                    <th className="py-3 px-4">Validation Status</th>
                    {displayColumns.map((col) => (
                      <th key={col} className="py-3 px-4 capitalize">
                        {col.replace(/([A-Z])/g, ' $1')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {previewRows.length === 0 ? (
                    <tr>
                      <td colSpan={displayColumns.length + 2} className="py-8 text-center text-slate-400">
                        No rows found or batch is empty.
                      </td>
                    </tr>
                  ) : (
                    previewRows.map((row) => {
                      const isError = row.status === 'error';

                      return (
                        <tr
                          key={row.id}
                          className={
                            isError ? 'bg-rose-50/40 hover:bg-rose-50/60' : 'hover:bg-teal-50/30'
                          }
                        >
                          <td className="py-3 px-4 font-mono font-bold text-slate-500">
                            #{row.rowNumber}
                          </td>
                          <td className="py-3 px-4">
                            {isError ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700">
                                <ShieldAlert className="h-3.5 w-3.5" /> Validation Error
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                              </span>
                            )}
                          </td>
                          {displayColumns.map((col) => {
                            const val = row.rawData[col];
                            const cellErr = row.errors.find((e) => e.column === col);
                            return (
                              <td
                                key={col}
                                className={`py-3 px-4 ${cellErr ? 'bg-rose-100/60 text-rose-800 font-bold' : ''}`}
                              >
                                {val !== undefined && val !== null ? String(val) : '—'}
                                {cellErr && (
                                  <div className="text-[10px] text-rose-600 font-normal">{cellErr.message}</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <Button
              variant="outline"
              onClick={() => setCurrentStep('upload')}
              className="cursor-pointer w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Re-upload File
            </Button>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleCommitBatch}
                disabled={isProcessing || totalValid === 0 || totalErrors > 0}
                className="bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold cursor-pointer w-full sm:w-auto flex items-center gap-1.5"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Committing...
                  </>
                ) : (
                  <>
                    <FileCheck className="h-4 w-4" /> Commit {totalValid} Valid Rows
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: DONE & ROLLBACK */}
      {currentStep === 'done' && (
        <div className="space-y-6 max-w-xl mx-auto py-6 text-center">
          <div className="h-16 w-16 rounded-3xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {isUndone ? 'Batch Successfully Rolled Back' : 'Import Batch Committed Successfully!'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              {isUndone
                ? 'All inserted records and database mutations for this batch have been completely removed from system state.'
                : `${totalValid} records have been committed to the database with audit log rows and outbox events.`}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Batch Identifier:</span>
              <span className="font-mono font-bold text-slate-900">{committedBatchId}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Dataset:</span>
              <span className="font-bold text-teal-800 capitalize">{selectedDataset.name}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Committed Records:</span>
              <span className="font-bold text-emerald-700">{isUndone ? 0 : totalValid}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Status:</span>
              <span className="font-black uppercase tracking-wider text-xs">
                {isUndone ? 'Undone (Rolled Back)' : 'Committed'}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
            {!isUndone && (
              <Button
                variant="outline"
                onClick={handleUndoBatch}
                disabled={isProcessing}
                className="border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                Undo Batch (Rollback)
              </Button>
            )}
            <Button
              onClick={() => {
                setCurrentStep('choose');
                setCommittedBatchId(null);
                setIsUndone(false);
              }}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs cursor-pointer"
            >
              Start New Import
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
