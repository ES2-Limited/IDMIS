import * as React from 'react';
import { Link } from '@tanstack/react-router';
import {
  UserPlus,
  MapPin,
  FileSpreadsheet,
  Droplets,
  FolderCheck,
  RefreshCw,
  CheckCircle2,
  Clock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@idmis/ui';
import { useSync } from '../../sync';
import { useFieldMode } from '../../shell/FieldModeContext';
import { useScope } from '../../shell/ScopeContext';
import { useEffectiveSchemeId } from '../core/hooks';

export function FieldHomeView() {
  const { pendingOpsCount, syncState, triggerSync, lastSyncedAt, store } = useSync();
  const { toggleFieldModeOverride } = useFieldMode();
  const { currentScope } = useScope();
  const { schemeName } = useEffectiveSchemeId(currentScope.id);
  const [allowanceDays, setAllowanceDays] = React.useState<number>(14);

  const [isOnline, setIsOnline] = React.useState(
    typeof window !== 'undefined' ? window.navigator.onLine : true,
  );

  React.useEffect(() => {
    store.getOfflineGrant().then((grant) => {
      if (grant) {
        const days = Math.max(
          0,
          Math.ceil((new Date(grant).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        );
        setAllowanceDays(days);
      } else {
        setAllowanceDays(14);
      }
    });
  }, [store]);

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
    <div className="space-y-5 max-w-lg mx-auto pb-6">
      {/* Field Mode Status Header */}
      <div className="bg-gradient-to-br from-teal-900 via-slate-900 to-slate-950 text-white rounded-3xl p-5 shadow-xl border border-teal-500/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-44 h-44 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isOnline ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${
                  isOnline ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-200">
              {isOnline ? 'Field Signal Online' : 'Airplane / Offline Mode'}
            </span>
          </div>

          <Badge
            variant="outline"
            className="border-teal-500/40 text-teal-300 bg-teal-950/40 text-[11px] px-2 py-0.5"
          >
            Field Collector Mode
          </Badge>
        </div>

        <h2 className="text-xl font-extrabold tracking-tight">TRIMING Field Station</h2>
        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
          Records created here autosave instantly to device storage and sync automatically once
          connectivity is restored.
        </p>

        {/* Sync Summary Pill Bar */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            {pendingOpsCount > 0 ? (
              <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                <Clock className="h-4 w-4" />
                {pendingOpsCount} records queued
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                All records synced
              </span>
            )}
            <span className="text-slate-600">•</span>
            <span className="text-slate-400 text-[11px]">
              {lastSyncedAt
                ? `Last: ${lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Not synced yet'}
            </span>
          </div>

          <Button
            size="sm"
            onClick={() => triggerSync()}
            disabled={!isOnline || isSyncing}
            className="bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs h-8 px-3 rounded-xl shadow-sm flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            Sync Now
          </Button>
        </div>
      </div>

      {/* Quick Action Capture Tiles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Fast Data Capture
          </h3>
          {isOnline ? (
            <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
              <Wifi className="h-3 w-3" /> Online Connected
            </span>
          ) : (
            <span className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
              <WifiOff className="h-3 w-3" /> Offline Outbox Ready
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/field/capture/farmer"
            className="group p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-teal-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[120px]"
          >
            <div className="p-2.5 rounded-xl bg-teal-50 text-teal-700 w-fit group-hover:scale-105 transition-transform">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                Farmer Reg.
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">7-step survey & identity</p>
            </div>
          </Link>

          <Link
            to="/field/capture/plot"
            className="group p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-emerald-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[120px]"
          >
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 w-fit group-hover:scale-105 transition-transform">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                Plot Mapping
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">GPS walk & boundary</p>
            </div>
          </Link>

          <Link
            to="/field/capture/water"
            className="group p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-blue-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[120px]"
          >
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 w-fit group-hover:scale-105 transition-transform">
              <Droplets className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                Water Request
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Canal supply schedule</p>
            </div>
          </Link>

          <Link
            to="/field/capture/fee"
            className="group p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-amber-500 shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[120px]"
          >
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 w-fit group-hover:scale-105 transition-transform">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                Fee Receipt
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Paper / offline ref</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Collector Overview & Switch to Standard Layout */}
      <Card className="rounded-2xl border-slate-200/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Device Storage & Synced Batches</span>
            <FolderCheck className="h-4 w-4 text-slate-400" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100">
            <span className="text-slate-500">Offline Storage Allowance</span>
            <span className="font-semibold text-slate-800">{allowanceDays} Days Remaining</span>
          </div>
          <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100">
            <span className="text-slate-500">Active Scheme Scope</span>
            <span className="font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md">
              {schemeName || currentScope.name || 'General Scope'}
            </span>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFieldModeOverride}
              className="text-xs text-slate-600 border-slate-200 hover:bg-slate-100 w-full"
            >
              Toggle Desktop / Standard Workspace View
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
