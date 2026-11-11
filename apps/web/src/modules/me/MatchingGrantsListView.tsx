import * as React from 'react';
import { Banknote, Plus, Search, CheckCircle2, Clock, Layers, Building, Coins } from 'lucide-react';
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
} from '@idmis/ui';
import { useScope } from '../../shell/ScopeContext';
import { useMatchingGrants } from './hooks';
import { useOrganisations } from '../core/hooks/useOrganisations';
import { useWuas } from '../core/hooks/usePlatformAdmin';

export interface MatchingGrantRecord {
  id: string;
  schemeId: string;
  schemeName: string;
  wuaName: string;
  wuaRegNo: string;
  purpose: string;
  approvedAmountNgn: number;
  disbursedAmountNgn: number;
  matchingContributionNgn: number;
  approvedOn: string;
  disbursedOn?: string | null;
  status: 'disbursed' | 'approved' | 'in_review';
}

export function MatchingGrantsListView() {
  const { currentScope } = useScope();
  const { organisations } = useOrganisations({ type: 'scheme' });
  const schemes = React.useMemo(() => {
    return organisations.filter((o) => o.type === 'scheme');
  }, [organisations]);

  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Dialog State
  const [isCreateOpen, setIsCreateOpen] = React.useState<boolean>(false);
  const [selectedSchemeId, setSelectedSchemeId] = React.useState<string>('');
  const [selectedWuaId, setSelectedWuaId] = React.useState<string>('');
  const [newWuaName, setNewWuaName] = React.useState<string>('');
  const [newWuaReg, setNewWuaReg] = React.useState<string>('');
  const [newPurpose, setNewPurpose] = React.useState<string>('');
  const [newAmount, setNewAmount] = React.useState<string>('12000000');

  // Scheme & WUA queries
  const targetSchemeForWua =
    selectedSchemeId || (currentScope.type === 'scheme' ? currentScope.id : schemes[0]?.id);
  const { wuas } = useWuas(targetSchemeForWua ? { organisationId: targetSchemeForWua } : undefined);

  // Sync default scheme selection when dialog opens or schemes load
  React.useEffect(() => {
    if (currentScope.type === 'scheme') {
      setSelectedSchemeId(currentScope.id);
    } else if (schemes.length > 0 && !selectedSchemeId) {
      setSelectedSchemeId(schemes[0]!.id);
    }
  }, [currentScope, schemes, selectedSchemeId]);

  // Modular custom hook for Matching Grants
  const { grants: serverGrants, createGrant } = useMatchingGrants(
    currentScope.type === 'scheme' ? currentScope.id : undefined,
  );

  const grants: MatchingGrantRecord[] = React.useMemo(() => {
    if (serverGrants && serverGrants.length > 0) {
      return serverGrants.map((g) => {
        const foundScheme = schemes.find((s) => s.id === g.schemeId);
        return {
          id: g.id,
          schemeId: g.schemeId,
          schemeName: foundScheme?.name || currentScope.name || 'KRIS Scheme',
          wuaName: g.wuaId ? `WUA ${g.wuaId.slice(-4)}` : 'Apex WUA Federation',
          wuaRegNo: g.wuaId ? `WUA-REG-${g.wuaId.slice(0, 4).toUpperCase()}` : 'WUA-REG-001',
          purpose: g.purpose || 'Canal maintenance and secondary gate rehabilitation',
          approvedAmountNgn: g.amountNgn ? Number(g.amountNgn) : 10000000,
          disbursedAmountNgn: g.disbursedOn ? (g.amountNgn ? Number(g.amountNgn) : 10000000) : 0,
          matchingContributionNgn: Math.round((g.amountNgn ? Number(g.amountNgn) : 10000000) * 0.2),
          approvedOn: g.approvedOn || '2026-01-01',
          disbursedOn: g.disbursedOn,
          status: g.disbursedOn ? 'disbursed' : 'approved',
        };
      });
    }
    return [];
  }, [serverGrants, currentScope.name, schemes]);

  const filteredGrants = React.useMemo(() => {
    return grants.filter((g) => {
      if (statusFilter !== 'all' && g.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          g.wuaName.toLowerCase().includes(q) ||
          g.wuaRegNo.toLowerCase().includes(q) ||
          g.purpose.toLowerCase().includes(q) ||
          g.schemeName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [grants, statusFilter, searchQuery]);

  const totalCommitted = grants.reduce((acc, g) => acc + g.approvedAmountNgn, 0);
  const totalDisbursed = grants.reduce((acc, g) => acc + g.disbursedAmountNgn, 0);

  const handleCreateGrant = async () => {
    if (!newPurpose.trim()) return;

    const targetSchemeId =
      selectedSchemeId ||
      (currentScope.type === 'scheme' ? currentScope.id : schemes[0]?.id) ||
      '018f3a5e-0020-7000-8000-000000000001';

    const amt = Number(newAmount) || 10000000;
    try {
      await createGrant({
        schemeId: targetSchemeId,
        wuaId: selectedWuaId || undefined,
        purpose: newPurpose,
        amountNgn: String(amt),
      });
      setIsCreateOpen(false);
      setNewWuaName('');
      setNewWuaReg('');
      setNewPurpose('');
      setSelectedWuaId('');
    } catch {
      setIsCreateOpen(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in-50">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Banknote className="h-3 w-3 text-teal-700" /> WUA Matching Grants Registry
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-bold text-slate-600">
              Scope: {currentScope.name || 'National Level'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Matching Grants & Co-Financing
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Administer matching capital grants to accredited Water User Associations for canal
            rehabilitation, equipment, and storage.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setIsCreateOpen(true)}
          className="text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white gap-1.5 cursor-pointer shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" /> New Grant Award
        </Button>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Approved Grants</span>
            <Building className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{grants.length}</span>
            <span className="text-xs text-teal-700 font-bold">WUA Awards</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-teal-200 bg-teal-50/20 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-teal-800 text-xs font-bold">
            <span>Total Committed Funding</span>
            <CheckCircle2 className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-teal-950">
              ₦{(totalCommitted / 1000000).toFixed(1)}M
            </span>
            <span className="text-xs text-teal-700 font-medium">NGN Allocated</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200 bg-emerald-50/20 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-bold">
            <span>Disbursed Tranches</span>
            <Clock className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-950">
              ₦{(totalDisbursed / 1000000).toFixed(1)}M
            </span>
            <span className="text-xs text-emerald-700 font-medium">
              {Math.round((totalDisbursed / totalCommitted) * 100)}% Disbursed
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-amber-200 bg-amber-50/20 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-amber-900 text-xs font-bold">
            <span>WUA Co-Financing</span>
            <Layers className="h-4 w-4 text-amber-700" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-950">20%</span>
            <span className="text-xs text-amber-800 font-medium">Matching Contribution</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-40">
            <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
              <SelectTrigger className="h-8.5 text-xs font-medium bg-slate-50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-white shadow-xl">
                <SelectItem value="all" className="text-xs py-2">
                  All Statuses
                </SelectItem>
                <SelectItem value="disbursed" className="text-xs py-2 text-emerald-800">
                  Fully Disbursed
                </SelectItem>
                <SelectItem value="approved" className="text-xs py-2 text-teal-800">
                  Approved
                </SelectItem>
                <SelectItem value="in_review" className="text-xs py-2 text-amber-800">
                  In Review
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="text-xs text-slate-400">{filteredGrants.length} Grants Found</span>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search WUA, reg no, purpose..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs h-8.5 bg-slate-50"
          />
        </div>
      </div>

      {/* Matching Grants Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[840px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">WUA Beneficiary</th>
                <th className="py-3 px-4 min-w-[200px]">Grant Purpose</th>
                <th className="py-3 px-4">Scheme Location</th>
                <th className="py-3 px-4 font-mono">Approved Amount (NGN)</th>
                <th className="py-3 px-4 font-mono">Disbursed (NGN)</th>
                <th className="py-3 px-4 font-mono">WUA Match (20%)</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredGrants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Coins className="h-8 w-8 text-slate-300 stroke-[1.5]" />
                      <div className="text-sm font-semibold text-slate-700">
                        No matching grants found
                      </div>
                      <p className="text-xs text-slate-500 max-w-sm">
                        {searchQuery || statusFilter !== 'all'
                          ? 'No matching grants found for your filter criteria.'
                          : 'WUA matching grants and disbursed funding records will appear here.'}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => setIsCreateOpen(true)}
                        className="bg-teal-700 hover:bg-teal-800 text-white text-xs mt-2 gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" /> Record New Grant
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredGrants.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 leading-snug">{g.wuaName}</div>
                      <span className="text-[10px] text-slate-400 font-mono font-bold">
                        {g.wuaRegNo}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 leading-relaxed">{g.purpose}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">{g.schemeName}</td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      ₦{g.approvedAmountNgn.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-black text-teal-800">
                      ₦{g.disbursedAmountNgn.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">
                      ₦{g.matchingContributionNgn.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      {g.status === 'disbursed' ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-300 text-emerald-800 bg-emerald-50 text-[10px] font-bold gap-1"
                        >
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Disbursed
                        </Badge>
                      ) : g.status === 'approved' ? (
                        <Badge
                          variant="outline"
                          className="border-teal-300 text-teal-800 bg-teal-50 text-[10px] font-bold"
                        >
                          Approved
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-300 text-amber-800 bg-amber-50 text-[10px] font-bold"
                        >
                          In Review
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

      {/* New Grant Award Dialog */}
      {isCreateOpen && (
        <Dialog open={isCreateOpen} onOpenChange={(open) => !open && setIsCreateOpen(false)}>
          <DialogContent className="max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 text-teal-800 text-xs font-bold mb-1">
                <Banknote className="h-3.5 w-3.5" /> Award Matching Grant
              </div>
              <DialogTitle className="text-base font-black text-slate-900">
                Register WUA Matching Grant
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pt-2 text-xs">
              {currentScope.type !== 'scheme' && (
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Irrigation Scheme *</label>
                  <Select
                    value={selectedSchemeId}
                    onValueChange={(val: string) => {
                      setSelectedSchemeId(val);
                      setSelectedWuaId('');
                    }}
                  >
                    <SelectTrigger className="h-8.5 text-xs bg-white">
                      <SelectValue placeholder="Select Scheme" />
                    </SelectTrigger>
                    <SelectContent className="bg-white shadow-xl">
                      {schemes.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs py-2">
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <label className="font-bold text-slate-700">
                  Beneficiary Water User Association (WUA)
                </label>
                {wuas.length > 0 ? (
                  <Select
                    value={selectedWuaId}
                    onValueChange={(val: string) => {
                      setSelectedWuaId(val);
                      const w = wuas.find((item) => item.id === val);
                      if (w) {
                        setNewWuaName(w.name);
                        setNewWuaReg(w.regNo || '');
                      }
                    }}
                  >
                    <SelectTrigger className="h-8.5 text-xs bg-white">
                      <SelectValue placeholder="Select Accredited WUA" />
                    </SelectTrigger>
                    <SelectContent className="bg-white shadow-xl">
                      {wuas.map((w) => (
                        <SelectItem key={w.id} value={w.id} className="text-xs py-2">
                          {w.name} {w.regNo ? `(${w.regNo})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="e.g. Kadawa Irrigation Water Users..."
                    value={newWuaName}
                    onChange={(e) => setNewWuaName(e.target.value)}
                    className="text-xs"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">WUA Reg Number</label>
                  <Input
                    placeholder="WUA-KRS-055"
                    value={newWuaReg}
                    onChange={(e) => setNewWuaReg(e.target.value)}
                    className="text-xs font-mono uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Grant Amount (NGN) *</label>
                  <Input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">
                  Grant Purpose & Procurement Plan *
                </label>
                <Input
                  placeholder="Explain infrastructure or equipment acquisition..."
                  value={newPurpose}
                  onChange={(e) => setNewPurpose(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="p-3 bg-teal-50/50 rounded-xl border border-teal-200 text-teal-900 leading-relaxed text-[11px]">
                <span className="font-bold block mb-0.5">Matching Contribution Policy:</span>
                WUA must provide verified proof of 20% co-financing contribution into their escrow
                account prior to second tranche disbursement.
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                className="text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateGrant}
                disabled={(!newWuaName.trim() && !selectedWuaId) || !newPurpose.trim()}
                className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold"
              >
                Award Grant
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
