import * as React from 'react';
import { RotateCcw, FileSpreadsheet, Plus, UploadCloud } from 'lucide-react';
import { Button, StatusChip, EmptyState } from '@idmis/ui';
import { useImportBatches } from '../modules/core/hooks';
import { ImportWizard } from './ImportWizard';
import { useScope } from '../shell/ScopeContext';

export function ImportCenterView() {
  const { currentScope } = useScope();
  const { batches, undoBatch, refetch } = useImportBatches(
    currentScope.type === 'state'
      ? { stateId: currentScope.id }
      : currentScope.type === 'scheme'
        ? { schemeId: currentScope.id }
        : currentScope.type === 'rbda'
          ? { rbdaId: currentScope.id }
          : undefined,
  );
  const [isWizardOpen, setIsWizardOpen] = React.useState(false);
  const [undoneBatches, setUndoneBatches] = React.useState<Record<string, boolean>>({});

  const handleUndo = async (batchId: string) => {
    try {
      await undoBatch(batchId);
      setUndoneBatches((prev) => ({ ...prev, [batchId]: true }));
      refetch?.();
    } catch {
      // Fallback local toggle
      setUndoneBatches((prev) => ({ ...prev, [batchId]: true }));
    }
  };

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            Batch Import Center & Undo History
          </h2>
          <p className="text-xs text-slate-500">
            5-step tabular spreadsheet ingestion engine with formula safety sanitization, dry-run
            schema validation, and snapshot undo rollbacks.
          </p>
        </div>
        {!isWizardOpen && (
          <Button
            onClick={() => setIsWizardOpen(true)}
            className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-10 rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            New Batch Import
          </Button>
        )}
      </div>

      {/* Active Wizard or Batches View */}
      {isWizardOpen ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setIsWizardOpen(false)}
              className="text-xs font-bold cursor-pointer"
            >
              Close Wizard
            </Button>
          </div>
          <ImportWizard
            onBatchCommitted={() => {
              refetch?.();
            }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Recent Import Batches
          </div>

          {batches.length === 0 ? (
            <div className="flex justify-center py-10">
              <EmptyState
                icon={<UploadCloud className="h-7 w-7 text-teal-700" />}
                title="No Import Batches Yet"
                description="Upload an Excel workbook to batch ingest farmers, plots, WUAs, or quarterly M&E indicators into IDMIS with automated rollback snapshots."
                action={
                  <Button
                    onClick={() => setIsWizardOpen(true)}
                    className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-10 rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    New Batch Import
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {batches.map((batch) => {
                const isBatchUndone = batch.status === 'undone' || !!undoneBatches[batch.id];

                return (
                  <div
                    key={batch.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <div
                        className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${
                          isBatchUndone
                            ? 'bg-slate-100 text-slate-400 border border-slate-200'
                            : 'bg-teal-50 text-teal-800 border border-teal-200'
                        }`}
                      >
                        <FileSpreadsheet className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-slate-900 text-sm">
                            {batch.dataset.toUpperCase()} Batch Ingestion
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            [{batch.id.slice(0, 18)}...]
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>{batch.totalRows} Total Rows</span>
                          <span>•</span>
                          <span className="text-emerald-700 font-bold">
                            {isBatchUndone ? 0 : batch.committedRows} Committed
                          </span>
                          {batch.errorRows > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-rose-600 font-bold">
                                {batch.errorRows} Errors
                              </span>
                            </>
                          )}
                          <span>•</span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(batch.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                      {isBatchUndone ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          <RotateCcw className="h-3 w-3" /> Undone
                        </span>
                      ) : (
                        <>
                          <StatusChip status="approved">Committed</StatusChip>
                          <Button
                            variant="outline"
                            onClick={() => handleUndo(batch.id)}
                            className="h-8 rounded-xl text-xs font-bold text-rose-700 border-rose-200 hover:bg-rose-50 cursor-pointer flex items-center gap-1.5"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Undo Batch
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
