import * as React from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  Activity,
  FileCode,
  Globe,
} from 'lucide-react';
import { Button, Input, StatusChip, Badge } from '@idmis/ui';
import { useAuditLogs } from './hooks/useAuditLogs';
import type { AuditLogResponse } from '@idmis/contracts';

export function AuditLogsView() {
  const { logs, total, isLoading, isFetching, refetch } = useAuditLogs();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedLog, setSelectedLog] = React.useState<AuditLogResponse | null>(null);

  const filteredLogs = React.useMemo(() => {
    if (!searchTerm.trim()) return logs;
    const term = searchTerm.toLowerCase();
    return logs.filter(
      (log) =>
        log.action?.toLowerCase().includes(term) ||
        log.entityType?.toLowerCase().includes(term) ||
        log.actorUserId?.toLowerCase().includes(term) ||
        log.requestId?.toLowerCase().includes(term),
    );
  }, [logs, searchTerm]);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create':
      case 'import':
        return 'emerald';
      case 'update':
      case 'assign':
        return 'blue';
      case 'delete':
      case 'revert':
      case 'deassign':
        return 'rose';
      case 'sign_in':
      case 'totp_verify':
        return 'teal';
      case 'sign_in_failed':
      case 'lockout':
        return 'amber';
      default:
        return 'slate';
    }
  };

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Security Audit Logs & Activity Trail
            </h1>
            {isLoading && <RefreshCw className="h-4 w-4 animate-spin text-teal-600" />}
          </div>
          <p className="text-xs text-slate-500">
            Immutable system-wide ledger recording every authentication, role assignment, and mutation (Golden Rule #5).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-10 rounded-xl text-xs font-semibold gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Entries</div>
          <div className="text-xl font-black text-slate-900 mt-1">{total || logs.length}</div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Storage Status</div>
          <div className="text-xl font-black text-emerald-700 mt-1">Immutable</div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Actor Scope</div>
          <div className="text-xl font-black text-teal-800 mt-1">Scoped Repos</div>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Atomicity</div>
          <div className="text-xl font-black text-blue-700 mt-1">100% Txn Bound</div>
        </div>
      </div>

      {/* Search & Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter by action, entity, user..."
              className="pl-9 h-9 text-xs rounded-xl"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            Showing <span className="font-bold text-slate-800">{filteredLogs.length}</span> audit records
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/75 text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity Type</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Request / IP</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    {isLoading ? 'Loading audit records...' : 'No audit records found.'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                      {new Date(log.occurredAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md font-bold uppercase text-[10px] bg-${getActionColor(log.action)}-100 text-${getActionColor(log.action)}-800`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {log.entityType}
                      {log.entityId && (
                        <span className="block text-[10px] font-mono text-slate-400 truncate max-w-[120px]">
                          {log.entityId}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-medium text-slate-700">
                        <User className="h-3 w-3 text-slate-400" />
                        <span className="truncate max-w-[140px] font-mono text-[11px]">
                          {log.actorUserId ? log.actorUserId.slice(0, 8) + '...' : log.actorType}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                      <div>{log.ip || 'local'}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[130px]">
                        {log.requestId || 'no-req-id'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                        className="h-7 px-2 text-xs font-semibold text-teal-700 hover:text-teal-800 hover:bg-teal-50"
                      >
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Diff / Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[80vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-teal-700" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Audit Entry: {selectedLog.action} on {selectedLog.entityType}
                </h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLog(null)}
                className="h-7 w-7 p-0 rounded-lg text-slate-400 hover:text-slate-700"
              >
                ✕
              </Button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Log UUID</span>
                  <span className="font-mono text-[11px] text-slate-700">{selectedLog.id}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Occurred At</span>
                  <span className="font-mono text-[11px] text-slate-700">
                    {new Date(selectedLog.occurredAt).toISOString()}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-bold block mb-1.5">Payload Changes (Before / After)</span>
                <pre className="p-3 rounded-xl bg-slate-900 text-teal-300 font-mono text-[11px] overflow-x-auto max-h-60">
                  {JSON.stringify(selectedLog.changes, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedLog(null)}
                className="h-9 text-xs rounded-xl font-bold"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

