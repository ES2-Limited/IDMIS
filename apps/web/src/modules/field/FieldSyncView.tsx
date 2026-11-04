import * as React from 'react';
import { RefreshCw, Wifi, WifiOff, Database, HardDrive, Calendar, Lock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@idmis/ui';
import { useSync } from '../../sync';

export function FieldSyncView() {
  const { pendingOpsCount, syncState, triggerSync, lastSyncedAt } = useSync();

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

  const isSyncing = syncState === 'pushing' || syncState === 'pulling';

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Sync Centre</h2>
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
      <Card className="rounded-2xl border-teal-500/30 bg-gradient-to-br from-slate-900 to-teal-950 text-white shadow-lg">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-teal-500/20 text-teal-400">
                <RefreshCw className={`h-6 w-6 ${isSyncing ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Outbox Engine</h3>
                <p className="text-xs text-slate-300">
                  {pendingOpsCount > 0
                    ? `${pendingOpsCount} pending mutations`
                    : 'All changes up to date'}
                </p>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => triggerSync()}
              disabled={!isOnline || isSyncing}
              className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs h-9 px-4 rounded-xl shadow-md"
            >
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs text-slate-300">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                Last Successful Sync
              </span>
              <span className="font-medium text-white">
                {lastSyncedAt
                  ? lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Never'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                Connection Status
              </span>
              <span className="font-medium text-white">
                {isOnline ? 'Active Internet Gateway' : 'Cached Local SQLite/Dexie'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Offline Storage & Allowance Card */}
      <Card className="rounded-2xl border-slate-200/90 shadow-sm">
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
              14 Days Remaining
            </span>
          </div>

          <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
            <span className="flex items-center gap-2 text-slate-600">
              <HardDrive className="h-4 w-4 text-blue-600" />
              Local Storage Usage
            </span>
            <span className="font-semibold text-slate-800">4.2 MB / 500 MB</span>
          </div>

          <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
            <span className="flex items-center gap-2 text-slate-600">
              <Database className="h-4 w-4 text-purple-600" />
              Cached Entities
            </span>
            <span className="font-semibold text-slate-800">12 Schemes · 45 WUAs</span>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
            Notice: IDMIS offline tokens allow disconnected field recording for up to 14 consecutive
            days. Connect to cellular or Wi-Fi before expiration to refresh device security grants.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
