import * as React from 'react';
import {
  Search,
  Eye,
  EyeOff,
  UploadCloud,
  ChevronRight,
  ShieldCheck,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import {
  Button,
  Input,
  StatusChip,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@idmis/ui';
import { useCan } from '../../auth';
import { useScope } from '../../shell/ScopeContext';
import { ImportWizard } from '../../imports/ImportWizard';
import { useFarmers } from './hooks';

export interface FarmerRecord {
  id: string;
  farmerCode: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  gender: 'male' | 'female';
  birthYear: number;
  phone: string;
  village: string;
  sectorName: string;
  wuaName: string;
  status: 'approved' | 'awaiting_review' | 'conflict' | 'draft';
  householdCount: number;
  nin: string;
  bvn: string;
  allocatedPlots: string[];
}

export function FarmersListView() {
  const { currentScope } = useScope();
  const canViewUnmasked = useCan('slis.farmer.identity.read_unmasked');
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [genderFilter, setGenderFilter] = React.useState('all');
  const [showUnmasked, setShowUnmasked] = React.useState(false);
  const [selectedFarmer, setSelectedFarmer] = React.useState<FarmerRecord | null>(null);
  const [isImportOpen, setIsImportOpen] = React.useState(false);

  const serverStatus =
    statusFilter === 'all'
      ? undefined
      : statusFilter === 'conflict'
        ? ('returned' as const)
        : statusFilter === 'awaiting_review'
          ? ('submitted' as const)
          : (statusFilter as 'draft' | 'submitted' | 'approved' | 'returned');

  // Modular custom hook for Farmers
  const {
    farmers: serverFarmers,
    isLoading,
    isFetching: isRefetching,
    refetch,
  } = useFarmers({
    limit: 50,
    schemeId: currentScope.type === 'scheme' ? currentScope.id : undefined,
    status: serverStatus,
    gender: genderFilter === 'all' ? undefined : (genderFilter as 'male' | 'female'),
  });

  // Map server response to UI record
  const activeFarmers: FarmerRecord[] = React.useMemo(() => {
    if (!serverFarmers) return [];
    return serverFarmers.map((f) => ({
      id: f.id,
      farmerCode: f.farmerCode,
      firstName: f.firstName,
      lastName: f.lastName,
      otherNames: f.otherNames || undefined,
      gender: (f.gender as 'male' | 'female') || 'male',
      birthYear: f.birthYear || 1980,
      phone: f.phone || '—',
      village: f.village || '—',
      sectorName: f.sectorId ? `Sector ${f.sectorId.slice(-4)}` : 'Main Sector',
      wuaName: f.unitWuaId ? `WUA ${f.unitWuaId.slice(-4)}` : 'Apex WUA',
      status:
        f.status === 'submitted'
          ? 'awaiting_review'
          : f.status === 'returned'
            ? 'conflict'
            : (f.status as FarmerRecord['status']) || 'approved',
      householdCount: 1,
      nin:
        f.identities?.find((i: { documentTypeId?: string; numberLast4?: string }) =>
          i.documentTypeId?.includes('nin'),
        )?.numberLast4 || '—',
      bvn:
        f.identities?.find((i: { documentTypeId?: string; numberLast4?: string }) =>
          i.documentTypeId?.includes('bvn'),
        )?.numberLast4 || '—',
      allocatedPlots: [],
    }));
  }, [serverFarmers]);

  const maskIdentity = (val: string) => {
    if (!val || val === '—') return '—';
    if (showUnmasked && canViewUnmasked) return val;
    return `••••••••${val.slice(-4)}`;
  };

  const filtered = activeFarmers.filter((f) => {
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;
    if (genderFilter !== 'all' && f.gender !== genderFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.firstName.toLowerCase().includes(q) ||
      f.lastName.toLowerCase().includes(q) ||
      f.farmerCode.toLowerCase().includes(q) ||
      f.village.toLowerCase().includes(q) ||
      f.wuaName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5 animate-in fade-in-50">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
              {currentScope.name || 'All Schemes'}
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">SLIS Farmer Registry</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            Farmers & Households
            {isLoading && (
              <RefreshCw className="h-4 w-4 animate-spin text-teal-600" aria-label="Loading..." />
            )}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="text-xs h-9 font-semibold text-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canViewUnmasked && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUnmasked((p) => !p)}
              className="text-xs h-9 font-semibold text-slate-700 hover:text-teal-800"
            >
              {showUnmasked ? (
                <EyeOff className="h-4 w-4 mr-1.5" />
              ) : (
                <Eye className="h-4 w-4 mr-1.5" />
              )}
              {showUnmasked ? 'Mask Identity Numbers' : 'Reveal Unmasked Identity'}
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => setIsImportOpen(true)}
            className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-9 px-3.5 shadow-sm"
          >
            <UploadCloud className="h-4 w-4 mr-1.5" />
            Import Farmers
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by code, farmer name, village..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs border-slate-200"
          />
        </div>

        <div className="w-full sm:w-52">
          <Select value={statusFilter} onValueChange={(val: string) => setStatusFilter(val)}>
            <SelectTrigger
              aria-label="Filter by approval status"
              className="h-9 min-h-[36px] w-full bg-slate-50 border-slate-200 text-xs font-semibold rounded-xl hover:bg-white hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
            >
              <SelectValue placeholder="All Approval Statuses" />
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-xl border-slate-200">
              <SelectItem value="all" className="text-xs font-medium py-2">
                All Approval Statuses
              </SelectItem>
              <SelectItem value="approved" className="text-xs font-medium py-2">
                Approved
              </SelectItem>
              <SelectItem value="awaiting_review" className="text-xs font-medium py-2">
                Awaiting Review
              </SelectItem>
              <SelectItem value="conflict" className="text-xs font-medium py-2">
                Action Needed / Conflict
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-40">
          <Select value={genderFilter} onValueChange={(val: string) => setGenderFilter(val)}>
            <SelectTrigger
              aria-label="Filter by gender"
              className="h-9 min-h-[36px] w-full bg-slate-50 border-slate-200 text-xs font-semibold rounded-xl hover:bg-white hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
            >
              <SelectValue placeholder="All Genders" />
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-xl border-slate-200">
              <SelectItem value="all" className="text-xs font-medium py-2">
                All Genders
              </SelectItem>
              <SelectItem value="male" className="text-xs font-medium py-2">
                Male
              </SelectItem>
              <SelectItem value="female" className="text-xs font-medium py-2">
                Female
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table Data */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <table className="w-full text-left text-xs text-slate-600 min-w-[760px]">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="py-3.5 px-4">Farmer Details</th>
              <th className="py-3.5 px-4">Location & Sector</th>
              <th className="py-3.5 px-4">National Identity</th>
              <th className="py-3.5 px-4">WUA & Plots</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((farmer) => (
              <tr key={farmer.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-teal-50 border border-teal-200/80 text-teal-800 flex items-center justify-center font-bold text-xs shrink-0">
                      {farmer.firstName.charAt(0)}
                      {farmer.lastName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">
                        {farmer.firstName} {farmer.otherNames ? `${farmer.otherNames} ` : ''}
                        {farmer.lastName}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {farmer.farmerCode}
                      </div>
                    </div>
                  </div>
                </td>

                <td className="py-3.5 px-4">
                  <div className="font-semibold text-slate-800">{farmer.village}</div>
                  <div className="text-[11px] text-slate-400">{farmer.sectorName}</div>
                </td>

                <td className="py-3.5 px-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="text-slate-400 font-bold">NIN:</span>
                      <span className="font-semibold text-slate-700">
                        {maskIdentity(farmer.nin)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="text-slate-400 font-bold">BVN:</span>
                      <span className="font-semibold text-slate-700">
                        {maskIdentity(farmer.bvn)}
                      </span>
                    </div>
                  </div>
                </td>

                <td className="py-3.5 px-4">
                  <div className="font-semibold text-slate-800 truncate max-w-xs">
                    {farmer.wuaName}
                  </div>
                  <div className="text-[11px] text-teal-700 font-medium">
                    {farmer.allocatedPlots.length} parcel(s) assigned
                  </div>
                </td>

                <td className="py-3.5 px-4">
                  <StatusChip status={farmer.status}>
                    {farmer.status === 'approved'
                      ? 'Approved'
                      : farmer.status === 'awaiting_review'
                        ? 'Awaiting Review'
                        : farmer.status === 'conflict'
                          ? 'Held Conflict'
                          : 'Draft'}
                  </StatusChip>
                </td>

                <td className="py-3.5 px-4 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFarmer(farmer)}
                    className="h-8 px-2.5 text-xs text-teal-700 hover:text-teal-800 hover:bg-teal-50 font-bold"
                  >
                    View Details
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Farmer Detail Drawer / Dialog */}
      {selectedFarmer && (
        <Dialog open={Boolean(selectedFarmer)} onOpenChange={() => setSelectedFarmer(null)}>
          <DialogContent className="max-w-xl p-6 rounded-3xl">
            <DialogHeader className="border-b border-slate-100 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full">
                      {selectedFarmer.farmerCode}
                    </span>
                    <StatusChip status={selectedFarmer.status}>{selectedFarmer.status}</StatusChip>
                  </div>
                  <DialogTitle className="text-xl font-black text-slate-900 mt-1">
                    {selectedFarmer.firstName} {selectedFarmer.otherNames} {selectedFarmer.lastName}
                  </DialogTitle>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Gender & Age
                  </span>
                  <span className="font-semibold text-slate-900 capitalize">
                    {selectedFarmer.gender} · Born {selectedFarmer.birthYear}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Telephone
                  </span>
                  <span className="font-semibold text-slate-900">{selectedFarmer.phone}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Village & Ward
                  </span>
                  <span className="font-semibold text-slate-900">{selectedFarmer.village}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Household Members
                  </span>
                  <span className="font-semibold text-slate-900">
                    {selectedFarmer.householdCount} Dependents
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2">
                <span className="text-xs font-bold text-slate-900 block flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-teal-700" />
                  National Identity Documents
                </span>
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">National Identity Number (NIN)</span>
                  <span className="font-mono font-bold text-slate-900">
                    {maskIdentity(selectedFarmer.nin)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500 font-medium">Bank Verification Number (BVN)</span>
                  <span className="font-mono font-bold text-slate-900">
                    {maskIdentity(selectedFarmer.bvn)}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2">
                <span className="text-xs font-bold text-slate-900 block flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-emerald-700" />
                  Allocated Farmland Parcels
                </span>
                <div className="space-y-1">
                  {selectedFarmer.allocatedPlots.map((plot, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/50 border border-emerald-100 text-emerald-950 font-medium"
                    >
                      <span>{plot}</span>
                      <span className="text-[10px] font-bold text-emerald-700">Irrigated</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 5-step Reusable Import Wizard */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="max-w-4xl p-6 rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <DialogTitle className="text-lg font-bold text-slate-900">
              Import Farmers Spreadsheet
            </DialogTitle>
          </DialogHeader>
          <ImportWizard
            initialDatasetId="slis.farmer"
            onCancel={() => setIsImportOpen(false)}
            onBatchCommitted={() => setIsImportOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
