import * as React from 'react';
import { useSync } from '../sync';
import {
  RefreshCw,
  CheckCircle2,
  Clock,
  Database,
  ArrowUpRight,
  ShieldCheck,
  X,
  Layers,
} from 'lucide-react';
import { Button, Badge, Sheet, SheetContent, useToast } from '@idmis/ui';
import type { OutboxOp } from '@idmis/sync';

export interface SyncDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SyncDrawer({ open, onOpenChange }: SyncDrawerProps) {
  const { syncState, pendingOpsCount, lastSyncedAt, triggerSync, store } = useSync();
  const { success, error: toastError, info } = useToast();

  const [pendingOps, setPendingOps] = React.useState<OutboxOp[]>([]);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const loadPendingOps = React.useCallback(async () => {
    try {
      const ops = await store.getPendingOps();
      setPendingOps(ops);
    } catch (e) {
      console.warn('Failed to load pending ops', e);
    }
  }, [store]);

  React.useEffect(() => {
    if (open) {
      loadPendingOps();
    }
  }, [open, loadPendingOps, pendingOpsCount]);

  const handleManualSync = async () => {
    setIsRefreshing(true);
    info('Synchronization Initiated', 'Connecting to TRIMING central database...');
    try {
      await triggerSync();
      await loadPendingOps();
      success('Sync Completed', 'All local mutations synchronized successfully.');
    } catch (err) {
      toastError('Sync Failed', String(err));
    } finally {
      setIsRefreshing(false);
    }
  };

  const isSyncing = syncState === 'pushing' || syncState === 'pulling' || isRefreshing;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col h-full bg-slate-50"
      >
        {/* Drawer Header */}
        <div className="p-5 bg-gradient-to-br from-slate-900 to-teal-950 text-white border-b border-teal-800/40 relative">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close sync drawer"
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/20 border border-teal-400/40 text-teal-300">
              <Database className="h-4 w-4" />
            </span>
            <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/40 text-[10px] font-bold">
              IndexedDB Storage Engine
            </Badge>
          </div>

          <h3 className="text-base font-extrabold tracking-tight">Offline Sync & Local Outbox</h3>
          <p className="text-xs text-teal-200/80 mt-1 leading-relaxed">
            Monitor client mutations queued on this device before upload to the national cloud.
          </p>

          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Clock className="h-3.5 w-3.5 text-teal-400" />
              <span>
                Last synced:{' '}
                <strong className="text-white">
                  {lastSyncedAt ? lastSyncedAt.toLocaleTimeString() : 'Not yet in session'}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-1 text-emerald-400 font-bold">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>AES-GCM Guarded</span>
            </div>
          </div>
        </div>

        {/* Sync Controls Bar */}
        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shadow-2xs">
          <div>
            <div className="text-xs font-bold text-slate-900">
              {pendingOpsCount === 0 ? 'Outbox Clean' : `${pendingOpsCount} Mutations Queued`}
            </div>
            <div className="text-[11px] text-slate-500">
              {syncState === 'idle'
                ? 'Device synchronized'
                : syncState === 'error'
                  ? 'Connection interrupted'
                  : 'Syncing in progress...'}
            </div>
          </div>

          <Button
            size="sm"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-8.5 px-3.5 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Synchronizing...' : 'Sync Now'}
          </Button>
        </div>

        {/* Queued Mutations List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
            <span>Client Mutation Queue</span>
            <span>Status</span>
          </div>

          {pendingOps.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 bg-white space-y-2 mt-4">
              <div className="h-10 w-10 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h4 className="text-xs font-bold text-slate-800">All Changes Reconciled</h4>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                No offline drafts or pending form submissions waiting on this device.
              </p>
            </div>
          ) : (
            pendingOps.map((op, idx) => (
              <div
                key={op.opId || idx}
                className="p-3 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2 transition-all hover:border-teal-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-lg bg-teal-50 border border-teal-200/80 text-teal-800 font-black text-[10px] flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="font-mono font-bold text-xs text-slate-900">
                        {op.entity.toUpperCase()} · {op.action.toUpperCase()}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        ID: {op.recordId.substring(0, 18)}...
                      </div>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className="text-[10px] bg-amber-50 text-amber-900 border-amber-300 font-bold"
                  >
                    Queued
                  </Badge>
                </div>

                <div className="bg-slate-50 p-2 rounded-xl text-[10px] font-mono text-slate-600 truncate border border-slate-100 flex items-center justify-between">
                  <span className="truncate">
                    Timestamp: {new Date(op.createdAt).toLocaleString()}
                  </span>
                  <ArrowUpRight className="h-3 w-3 text-slate-400 shrink-0 ml-1" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Drawer Footer Policy Guarantee */}
        <div className="p-4 bg-white border-t border-slate-200 text-xs text-slate-500 flex items-center gap-2">
          <Layers className="h-4 w-4 text-teal-700 shrink-0" />
          <p className="text-[11px] leading-snug">
            TRIMING Offline Protocol: Outbox mutations are replay-safe with optimistic concurrency
            tokens.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
