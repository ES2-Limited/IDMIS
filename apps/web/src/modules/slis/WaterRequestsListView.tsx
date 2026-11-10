import * as React from 'react';
import { Search, CheckCircle2, XCircle, Clock } from 'lucide-react';
import {
  Input,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@idmis/ui';
import { useScope } from '../../shell/ScopeContext';
import { useWaterRequests } from './hooks';

export interface WaterRequestItem {
  id: string;
  code: string;
  level: 'individual' | 'sector' | 'unit' | 'apex';
  requesterName: string;
  schemeName: string;
  volumeM3: string;
  deliveryPeriod: string;
  decision: 'approved' | 'rejected' | 'pending';
  submittedOn: string;
}

export function WaterRequestsListView() {
  const { currentScope } = useScope();
  const [search, setSearch] = React.useState('');
  const [decisionFilter, setDecisionFilter] = React.useState('all');

  // Modular custom hook for Water Requests
  const { requests: serverRequests } = useWaterRequests(
    currentScope.type === 'scheme' ? currentScope.id : undefined,
  );

  const requests: WaterRequestItem[] = React.useMemo(() => {
    if (serverRequests && serverRequests.length > 0) {
      return serverRequests.map((r) => ({
        id: r.id,
        code: `WR-${r.id.slice(0, 5).toUpperCase()}`,
        level: r.level,
        requesterName: r.farmerId
          ? `Farmer ${r.farmerId.slice(-4)}`
          : r.wuaId
            ? `WUA ${r.wuaId.slice(-4)}`
            : 'Irrigation Group',
        schemeName: currentScope.name || 'Scheme Network',
        volumeM3: r.volumeM3 ? Number(r.volumeM3).toLocaleString() : '1,000',
        deliveryPeriod: `${r.periodFromOn || 'TBD'} - ${r.periodToOn || 'TBD'}`,
        decision: r.decision as WaterRequestItem['decision'],
        submittedOn: new Date().toLocaleDateString(),
      }));
    }
    return [];
  }, [serverRequests, currentScope.name]);

  const filtered = requests.filter((item) => {
    if (decisionFilter !== 'all' && item.decision !== decisionFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.code.toLowerCase().includes(q) ||
      item.requesterName.toLowerCase().includes(q) ||
      item.schemeName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 animate-in fade-in-50">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              {currentScope.name || 'All Schemes'}
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">SLIS Operations</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
            Water Allocation Requests
          </h2>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Total Seasonal Volume
          </span>
          <span className="text-xl font-black text-slate-900 mt-1 block">
            {requests
              .reduce((sum, r) => sum + (Number(r.volumeM3.replace(/,/g, '')) || 0), 0)
              .toLocaleString()}{' '}
            m³
          </span>
          <span className="text-[11px] text-teal-700 font-semibold">Across active schemes</span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Pending Decisions
          </span>
          <span className="text-xl font-black text-amber-600 mt-1 block">
            {requests.filter((r) => r.decision === 'pending').length} Request
            {requests.filter((r) => r.decision === 'pending').length === 1 ? '' : 's'}
          </span>
          <span className="text-[11px] text-amber-700 font-semibold">
            Awaiting gate officer review
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Approval Rate
          </span>
          <span className="text-xl font-black text-emerald-700 mt-1 block">
            {requests.length > 0
              ? `${Math.round(
                  (requests.filter((r) => r.decision === 'approved').length / requests.length) *
                    100,
                )}%`
              : '0%'}
          </span>
          <span className="text-[11px] text-emerald-800 font-semibold">
            {requests.length > 0 ? 'Discharge capacity met' : 'No requests yet'}
          </span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search request code, requester name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs border-slate-200 bg-white"
          />
        </div>
        <div className="w-40 sm:w-48">
          <Select value={decisionFilter} onValueChange={(val: string) => setDecisionFilter(val)}>
            <SelectTrigger
              aria-label="Filter by decision"
              className="h-9 min-h-[36px] w-full bg-white border-slate-200 text-xs font-semibold rounded-xl hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
            >
              <SelectValue placeholder="All Decisions" />
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-xl border-slate-200">
              <SelectItem value="all" className="text-xs font-medium py-2">
                All Decisions
              </SelectItem>
              <SelectItem value="approved" className="text-xs font-medium py-2">
                Approved
              </SelectItem>
              <SelectItem value="pending" className="text-xs font-medium py-2">
                Pending
              </SelectItem>
              <SelectItem value="rejected" className="text-xs font-medium py-2">
                Rejected
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table Data */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <table className="w-full text-left text-xs text-slate-600 min-w-[700px]">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="py-3.5 px-4">Request Ref #</th>
              <th className="py-3.5 px-4">Requester & Scope</th>
              <th className="py-3.5 px-4">Requested Volume</th>
              <th className="py-3.5 px-4">Delivery Window</th>
              <th className="py-3.5 px-4">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400">
                  <Clock className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <span className="font-bold text-slate-700 block text-xs">
                    No Water Requests Found
                  </span>
                  <span className="text-[11px] text-slate-400">
                    No requests match the selected filters or none have been submitted yet.
                  </span>
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{item.code}</td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{item.requesterName}</div>
                    <div className="text-[11px] text-slate-400 capitalize">
                      {item.level} Level · {item.schemeName}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-mono font-black text-slate-900 bg-blue-50 text-blue-900 px-2 py-0.5 rounded-lg border border-blue-200">
                      {item.volumeM3} m³
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-700">{item.deliveryPeriod}</td>
                  <td className="py-3.5 px-4">
                    {item.decision === 'approved' ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-300 text-emerald-800 bg-emerald-50 text-[10px] flex items-center gap-1 w-max"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Approved
                      </Badge>
                    ) : item.decision === 'rejected' ? (
                      <Badge
                        variant="destructive"
                        className="text-[10px] flex items-center gap-1 w-max"
                      >
                        <XCircle className="h-3 w-3" /> Rejected
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-300 text-amber-800 bg-amber-50 text-[10px] flex items-center gap-1 w-max"
                      >
                        <Clock className="h-3 w-3" /> Under Review
                      </Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
