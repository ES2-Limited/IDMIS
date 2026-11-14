import * as React from 'react';
import {
  RefreshCw,
  Wifi,
  WifiOff,
  Database,
  HardDrive,
  Calendar,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, useToast } from '@idmis/ui';
import { localDb } from '@idmis/sync';
import { useSync } from '../../sync';

export function FieldSyncView() {
  const { pendingOpsCount, syncState, triggerSync, lastSyncedAt, store } = useSync();
  const { success, info, error: toastError } = useToast();
  const [dbStats, setDbStats] = React.useState({
    recordsCount: 0,
    outboxCount: 0,
    photosCount: 0,
  });

  const [storageEstimate, setStorageEstimate] = React.useState<string>('Estimating...');
  const [cachedEntitiesSummary, setCachedEntitiesSummary] = React.useState<string>('Checking...');
  const [allowanceDays, setAllowanceDays] = React.useState<number>(14);
  const [showDiagnostics, setShowDiagnostics] = React.useState<boolean>(false);

  const [isOnline, setIsOnline] = React.useState(
    typeof window !== 'undefined' ? window.navigator.onLine : true,
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

  const refreshStorageEstimate = React.useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        const usageMb = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
        const quotaMb = ((est.quota || 0) / (1024 * 1024)).toFixed(0);
        if (Number(quotaMb) > 1024) {
          const quotaGb = (Number(quotaMb) / 1024).toFixed(1);
          setStorageEstimate(`${usageMb} MB / ${quotaGb} GB`);
        } else {
          setStorageEstimate(`${usageMb} MB / ${quotaMb} MB`);
        }
      } else {
        setStorageEstimate('Browser storage active');
      }

      const allRecords = await localDb.records.toArray();
      const entityCounts = new Map<string, number>();
      for (const r of allRecords) {
        entityCounts.set(r.entity, (entityCounts.get(r.entity) || 0) + 1);
      }
      if (entityCounts.size > 0) {
        const topEntities = Array.from(entityCounts.entries())
          .slice(0, 3)
          .map(([k, v]) => `${v} ${k}s`)
          .join(' · ');
        setCachedEntitiesSummary(`${allRecords.length} records (${topEntities})`);
      } else {
        setCachedEntitiesSummary('0 records cached');
      }

      // Read offline allowance grant
      const grant = await store.getOfflineGrant();
      if (grant) {
        const days = Math.max(
          0,
          Math.ceil((new Date(grant).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        );
        setAllowanceDays(days);
      } else {
        setAllowanceDays(14);
      }
    } catch {
      setStorageEstimate('IndexedDB offline store');
      setCachedEntitiesSummary('Local data store active');
    }
  }, [store]);

  const refreshDbStats = React.useCallback(async () => {
    try {
      const recordsCount = await localDb.records.count();
      const outboxCount = await localDb.outbox.count();
      const photosCount = await localDb.photoQueue.count();
      setDbStats({ recordsCount, outboxCount, photosCount });
      await refreshStorageEstimate();
    } catch {
      // ignore
    }
  }, [refreshStorageEstimate]);

  React.useEffect(() => {
    refreshDbStats();
  }, [refreshDbStats, pendingOpsCount, syncState]);

  const handleManualSync = async () => {
    try {
      await triggerSync();
      await refreshDbStats();
      success('Sync Complete', 'Data successfully synchronized with the central server.');
    } catch (err) {
      await refreshDbStats();
      toastError('Sync Failed', String(err));
    }
  };

  const handleClearInvalidOps = async () => {
    try {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const allOps = await localDb.outbox.toArray();
      const invalidOps = allOps.filter(
        (op) => !uuidRegex.test(op.recordId) || !uuidRegex.test(op.opId),
      );
      if (invalidOps.length > 0) {
        await Promise.all(invalidOps.map((op) => localDb.outbox.delete(op.opId)));
        success('Legacy Queue Cleaned', `Purged ${invalidOps.length} invalid legacy operations.`);
      } else {
        info('No Invalid Operations', 'The outbox queue contains no invalid legacy operations.');
      }
      await refreshDbStats();
    } catch (err) {
      toastError('Purge Failed', String(err));
    }
  };

  const handleClearAllOutbox = async () => {
    try {
      const count = await localDb.outbox.count();
      if (count > 0) {
        await localDb.outbox.clear();
        success('Outbox Reset', `Cleared ${count} pending operations from local device queue.`);
      } else {
        info('Outbox Empty', 'No pending operations were found in the queue.');
      }
      await refreshDbStats();
    } catch (err) {
      toastError('Clear Failed', String(err));
    }
  };

  const isSyncing = syncState === 'pushing' || syncState === 'pulling';

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-6 animate-in fade-in-50">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Sync Centre</h2>
          <p className="text-xs text-slate-500">
            Offline outbox queue, storage status and manual sync trigger.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {isOnline ? (
            <Badge
              variant="outline"
              className="text-emerald-700 bg-emerald-50 border-emerald-300 text-xs flex items-center gap-1"
            >
              <Wifi className="h-3 w-3" /> Online
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-amber-800 bg-amber-50 border-amber-300 text-xs flex items-center gap-1"
            >
              <WifiOff className="h-3 w-3" /> Offline
            </Badge>
          )}
        </div>
      </div>

      {/* Sync Control Card */}
      <Card className="rounded-2xl border-teal-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950 text-white shadow-lg overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 rounded-full blur-xl pointer-events-none" />
        <CardContent className="p-5 space-y-4 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-teal-500/20 text-teal-400">
                <RefreshCw className={`h-6 w-6 ${isSyncing ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Outbox Sync Engine</h3>
                <p className="text-xs text-slate-300">
                  {pendingOpsCount > 0
                    ? `${pendingOpsCount} mutations queued in IndexedDB`
                    : 'All changes synced with server'}
                </p>
              </div>
            </div>

            <Button
              size="sm"
              onClick={handleManualSync}
              disabled={!isOnline || isSyncing}
              className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs h-9 px-4 rounded-xl shadow-md cursor-pointer"
            >
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs text-slate-300">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                Last Sync Time
              </span>
              <span className="font-medium text-white flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                {lastSyncedAt
                  ? lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Today, 10:00 AM'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                Network Gateway
              </span>
              <span className="font-medium text-white flex items-center gap-1 mt-0.5">
                {isOnline ? (
                  <>
                    <Wifi className="h-3.5 w-3.5 text-teal-400" />
                    <span>Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                    <span>Offline Cache</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Outbox Metrics Details */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
            Outbox Queue
          </span>
          <span className="text-lg font-black text-slate-900 mt-1 block">
            {dbStats.outboxCount}
          </span>
          <span className="text-[10px] text-amber-700 font-semibold">Pending push</span>
        </div>
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
            Cached Records
          </span>
          <span className="text-lg font-black text-slate-900 mt-1 block">
            {dbStats.recordsCount}
          </span>
          <span className="text-[10px] text-teal-700 font-semibold">In IndexedDB</span>
        </div>
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
            Photo Queue
          </span>
          <span className="text-lg font-black text-slate-900 mt-1 block">
            {dbStats.photosCount}
          </span>
          <span className="text-[10px] text-purple-700 font-semibold">Compressed</span>
        </div>
      </div>

      {/* Offline Storage & Allowance Card (Dynamic) */}
      <Card className="rounded-2xl border-slate-200/90 shadow-sm bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Offline Security & Allowance</span>
            <Lock className="h-4 w-4 text-slate-400" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3.5">
          <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
            <span className="flex items-center gap-2 text-slate-600">
              <Calendar className="h-4 w-4 text-teal-600" />
              Offline Allowance
            </span>
            <span className="font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg">
              {allowanceDays} Days Remaining
            </span>
          </div>

          <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
            <span className="flex items-center gap-2 text-slate-600">
              <HardDrive className="h-4 w-4 text-blue-600" />
              Local Storage Usage
            </span>
            <span className="font-semibold text-slate-800">{storageEstimate}</span>
          </div>

          <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
            <span className="flex items-center gap-2 text-slate-600">
              <Database className="h-4 w-4 text-purple-600" />
              Cached Reference Records
            </span>
            <span className="font-semibold text-slate-800 text-right">{cachedEntitiesSummary}</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-[11px] text-slate-600 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              IDMIS offline grants allow disconnected recording for up to 14 consecutive days.
              Connecting to internet automatically pushes pending outbox batches in Monotonic UUIDv7
              order.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Online / Offline Direct Transmission Info */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-1.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Transmission Behavior
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          {isOnline ? (
            <>
              <strong className="text-emerald-700">Direct Online Transmission Active: </strong>
              Because you are connected to the internet, records are submitted directly to the
              server database and saved locally with clean status (not queued). The outbox is only
              used when you are disconnected or offline.
            </>
          ) : (
            <>
              <strong className="text-amber-700">Offline Outbox Storage Active: </strong>
              You are currently disconnected. All captured field records are stored safely in your
              device&apos;s IndexedDB outbox with Monotonic UUIDv7 mutations and will sync
              automatically once your connection returns.
            </>
          )}
        </p>
      </div>

      {/* Optional Advanced Diagnostics (Collapsible) */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowDiagnostics((prev) => !prev)}
          className="text-[11px] text-slate-400 hover:text-slate-600 underline font-medium cursor-pointer"
        >
          {showDiagnostics ? '▲ Hide Diagnostic Tools' : '▼ Advanced Diagnostic Tools (Troubleshooting)'}
        </button>

        {showDiagnostics && (
          <Card className="rounded-2xl border-slate-200/90 shadow-sm bg-slate-50 mt-2 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Device Outbox Queue Maintenance</span>
              <Trash2 className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-500">
              Regular users do not need to purge their outbox during normal workflows. These actions
              are for administrative troubleshooting and test data resets.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearInvalidOps}
                className="text-xs h-8 border-slate-300 text-slate-700 hover:bg-white cursor-pointer"
              >
                Purge Invalid Legacy Ops
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAllOutbox}
                className="text-xs h-8 border-red-200 text-red-700 hover:bg-red-50 cursor-pointer"
              >
                Clear All Outbox Ops
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
