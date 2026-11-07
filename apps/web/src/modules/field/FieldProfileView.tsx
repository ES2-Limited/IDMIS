import * as React from 'react';
import { useAuth } from '../../auth';
import { useSync } from '../../sync';
import { useScope } from '../../shell/ScopeContext';
import { useFieldMode } from '../../shell/FieldModeContext';
import { LanguageSwitcher } from '../../shell/LanguageSwitcher';
import {
  Shield,
  Smartphone,
  Clock,
  LogOut,
  Layers,
  Wifi,
  WifiOff,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@idmis/ui';

export function FieldProfileView() {
  const { user, signOut } = useAuth();
  const { pendingOpsCount } = useSync();
  const { currentScope } = useScope();
  const { toggleFieldModeOverride } = useFieldMode();

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

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-6 animate-in fade-in-50">
      {/* Header Profile Summary */}
      <div className="rounded-3xl bg-gradient-to-br from-teal-900 via-slate-900 to-slate-950 p-6 text-white shadow-xl border border-teal-500/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-36 h-36 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center gap-4 relative z-10">
          <div className="h-16 w-16 rounded-2xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-teal-300 font-black text-2xl shadow-inner">
            {user?.fullName ? user.fullName.charAt(0) : 'U'}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-white truncate">
                {user?.fullName ?? 'Field Enumerator'}
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <p className="text-xs text-teal-200/80 truncate">{user?.email}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <Badge
                variant="outline"
                className="bg-teal-500/20 text-teal-300 border-teal-500/40 text-[10px] uppercase font-bold tracking-wider"
              >
                {user?.roles?.[0] ?? 'Enumerator'}
              </Badge>
              <Badge
                variant="outline"
                className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]"
              >
                Authorized
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Device & Assignment Info */}
      <Card className="rounded-2xl border-slate-200/90 shadow-sm bg-white">
        <CardHeader className="pb-2 pt-4 px-4 border-b border-slate-100">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-teal-700" />
            Field Assignment Scope
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
            <span className="text-slate-500">Irrigation Scheme</span>
            <span className="font-bold text-slate-900">{currentScope.name || 'All Schemes'}</span>
          </div>

          <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
            <span className="text-slate-500">Device Connectivity</span>
            <span className="font-semibold flex items-center gap-1.5">
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Online (Connected)</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-amber-700">Offline (Local Cache)</span>
                </>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
            <span className="text-slate-500">Offline Allowance</span>
            <span className="font-bold text-emerald-700 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> 14 Days Valid
            </span>
          </div>

          <div className="flex items-center justify-between py-1.5">
            <span className="text-slate-500">Pending Outbox Ops</span>
            <span className="font-extrabold text-slate-900">{pendingOpsCount} mutations</span>
          </div>

          <div className="flex items-center justify-between py-1.5 pt-2 border-t border-slate-100">
            <span className="text-slate-500 font-medium">National Language</span>
            <LanguageSwitcher />
          </div>
        </CardContent>
      </Card>

      {/* Security & Token Info */}
      <Card className="rounded-2xl border-slate-200/90 shadow-sm bg-white">
        <CardHeader className="pb-2 pt-4 px-4 border-b border-slate-100">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Shield className="h-4 w-4 text-teal-700" />
            Offline Security & Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-2 text-xs text-slate-600 leading-relaxed">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
            <p>Identity records (NIN/BVN) are encrypted on this device prior to storage.</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
            <p>Device grant refreshes automatically whenever network connection is restored.</p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="space-y-2 pt-2">
        <Button
          variant="outline"
          className="w-full h-11 rounded-xl text-xs font-bold text-slate-700 hover:text-teal-800 border-slate-200 cursor-pointer"
          onClick={() => toggleFieldModeOverride()}
        >
          <Layers className="h-4 w-4 mr-2 text-teal-700" />
          Switch to Desktop Workspace
        </Button>

        <Button
          variant="destructive"
          className="w-full h-11 rounded-xl text-xs font-bold cursor-pointer"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out of Field Station
        </Button>
      </div>
    </div>
  );
}
