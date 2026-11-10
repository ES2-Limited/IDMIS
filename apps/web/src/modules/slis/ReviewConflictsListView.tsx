import * as React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  Eye,
  CheckCheck,
  Undo2,
  FileText,
  MapPin,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';
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
import { useReviewQueue } from './hooks';

export interface PendingRecord {
  id: string;
  entityType: 'farmer' | 'plot' | 'water_request' | 'crop_production' | 'fee_collection';
  recordCode: string;
  title: string;
  collectorName: string;
  schemeName: string;
  sectorName: string;
  submittedAt: string;
  status: 'pending_review' | 'conflict' | 'needs_fixing';
  conflictType?: 'concurrent_version' | 'boundary_overlap' | 'duplicate_identity';
  summaryData: Record<string, string>;
  changesSinceLastVersion?: Array<{ field: string; from: string; to: string }>;
  photos?: string[];
  coordinates?: { lat: number; lng: number };
  deviceVersion?: Record<string, string>;
  serverVersion?: Record<string, string>;
}

export const mockPendingRecords: PendingRecord[] = [
  {
    id: '018f3a70-0041-7000-8000-000000000001',
    entityType: 'plot',
    recordCode: 'PLT-C1-019',
    title: 'Plot Boundary Overlap (0.80 ha)',
    collectorName: 'Aliyu Garba',
    schemeName: 'Hadejia Valley Irrigation Project (HVIP)',
    sectorName: 'Sector 1 - North Canal',
    submittedAt: 'Today, 08:30 AM',
    status: 'conflict',
    conflictType: 'boundary_overlap',
    summaryData: {
      'Area (ha)': '0.8000',
      'Service Type': 'Conjunctive',
      Farmer: 'Haruna Yusuf Sani',
      Crop: 'Paddy Rice',
    },
    changesSinceLastVersion: [
      { field: 'Area (ha)', from: '0.7200', to: '0.8000' },
      { field: 'Service Type', from: 'Gravity', to: 'Conjunctive' },
    ],
    coordinates: { lat: 12.4512, lng: 10.0418 },
    deviceVersion: {
      plotCode: 'PLT-C1-019',
      areaHa: '0.8000',
      serviceType: 'Conjunctive',
      farmer: 'Haruna Yusuf Sani',
      vertices: '7 points',
    },
    serverVersion: {
      plotCode: 'PLT-C1-018',
      areaHa: '1.1500',
      serviceType: 'Gravity',
      farmer: 'Bello Galadima',
      vertices: '9 points',
    },
  },
  {
    id: '018f3a70-0042-7000-8000-000000000002',
    entityType: 'farmer',
    recordCode: 'NG-HVIP-00820',
    title: 'Farmer Profile Concurrent Edit (409 Conflict)',
    collectorName: 'Ibrahim Sani',
    schemeName: 'Hadejia Valley Irrigation Project (HVIP)',
    sectorName: 'Sector 2 - East Branch',
    submittedAt: 'Today, 09:15 AM',
    status: 'conflict',
    conflictType: 'concurrent_version',
    summaryData: {
      Village: 'Auyo South',
      Phone: '+234 809 333 2211',
      'Household Size': '5 members',
      NIN: '***-***-8821',
    },
    changesSinceLastVersion: [
      { field: 'Village', from: 'Auyo Central', to: 'Auyo South' },
      { field: 'Household Size', from: '6', to: '5' },
    ],
    deviceVersion: {
      village: 'Auyo South',
      phone: '+234 809 333 2211',
      householdSize: '5',
      maritalStatus: 'married',
    },
    serverVersion: {
      village: 'Auyo Central',
      phone: '+234 809 333 2211',
      householdSize: '6',
      maritalStatus: 'married',
    },
  },
  {
    id: '018f3a70-0043-7000-8000-000000000003',
    entityType: 'water_request',
    recordCode: 'WR-HVIP-2026-004',
    title: 'Seasonal Water Request (8,500 m³)',
    collectorName: 'Fatima Mohammed',
    schemeName: 'Hadejia Valley Irrigation Project (HVIP)',
    sectorName: 'Sector 1 - North Canal',
    submittedAt: 'Yesterday, 04:20 PM',
    status: 'pending_review',
    summaryData: {
      Requester: 'Bello Galadima',
      'Volume (m³)': '8,500',
      Level: 'Sector WUA',
      Discharge: '0.45 m³/s',
    },
    changesSinceLastVersion: [
      { field: 'Volume (m³)', from: '0', to: '8,500' },
      { field: 'Season', from: 'None', to: '2026 Dry Season' },
    ],
    coordinates: { lat: 12.4589, lng: 10.0491 },
  },
  {
    id: '018f3a70-0044-7000-8000-000000000004',
    entityType: 'crop_production',
    recordCode: 'CRP-2026-0182',
    title: 'Paddy Rice Yield Assessment (3.4 t/ha)',
    collectorName: 'Aliyu Garba',
    schemeName: 'Hadejia Valley Irrigation Project (HVIP)',
    sectorName: 'Sector 3 - South Branch',
    submittedAt: 'Yesterday, 02:10 PM',
    status: 'pending_review',
    summaryData: {
      Parcel: 'PLT-C3-004',
      Crop: 'NERICA Rice',
      Yield: '3.40 tonnes/ha',
      HarvestDate: '2026-10-28',
    },
    changesSinceLastVersion: [
      { field: 'Harvest Status', from: 'Growing', to: 'Harvested' },
      { field: 'Yield (t/ha)', from: '0.00', to: '3.40' },
    ],
  },
  {
    id: '018f3a70-0045-7000-8000-000000000005',
    entityType: 'fee_collection',
    recordCode: 'FEE-2026-0091',
    title: 'WUA Water Fee Collection (₦45,000)',
    collectorName: 'Ibrahim Sani',
    schemeName: 'Hadejia Valley Irrigation Project (HVIP)',
    sectorName: 'Sector 2 - East Branch',
    submittedAt: 'Nov 03, 11:45 AM',
    status: 'pending_review',
    summaryData: {
      Payer: 'Haruna Yusuf Sani',
      Amount: '₦45,000.00',
      ReceiptNumber: 'RC-HVIP-98102',
      Method: 'Bank Transfer',
    },
    changesSinceLastVersion: [{ field: 'Payment Status', from: 'Outstanding', to: 'Collected' }],
  },
];

export function ReviewConflictsListView() {
  const { currentScope } = useScope();
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [activeTab, setActiveTab] = React.useState<'all' | 'pending' | 'conflicts'>('all');
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [collectorFilter, setCollectorFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');

  // Modals
  const [inspectRecord, setInspectRecord] = React.useState<PendingRecord | null>(null);
  const [conflictModalRecord, setConflictModalRecord] = React.useState<PendingRecord | null>(null);
  const [returnModalRecord, setReturnModalRecord] = React.useState<PendingRecord | null>(null);
  const [returnComment, setReturnComment] = React.useState('');
  const [conflictPicks, setConflictPicks] = React.useState<Record<string, 'device' | 'server'>>({});

  // Modular custom hook for Review Queue
  const {
    items: serverQueue,
    approveRecord,
    returnRecord,
    bulkApprove,
  } = useReviewQueue({
    limit: 50,
    status: 'submitted',
    schemeId: currentScope.type === 'scheme' ? currentScope.id : undefined,
  });

  const records: PendingRecord[] = React.useMemo(() => {
    if (serverQueue && serverQueue.length > 0) {
      return serverQueue.map((item) => ({
        id: item.id,
        entityType: (item.entity as PendingRecord['entityType']) || 'farmer',
        recordCode: `${item.entity.toUpperCase().slice(0, 3)}-${item.id.slice(0, 5)}`,
        title: item.summary,
        collectorName: item.submittedByName || 'Field Officer',
        schemeName: currentScope.name || 'KRIS Scheme',
        sectorName: 'Sector 01',
        submittedAt: item.submittedAt ? new Date(item.submittedAt).toLocaleTimeString() : 'Recent',
        status: 'pending_review' as const,
        summaryData: { Status: item.status, Entity: item.entity },
      }));
    }
    return [];
  }, [serverQueue, currentScope.name]);

  const filteredRecords = React.useMemo(() => {
    return records.filter((rec) => {
      if (activeTab === 'pending' && rec.status !== 'pending_review') return false;
      if (activeTab === 'conflicts' && rec.status !== 'conflict') return false;
      if (typeFilter !== 'all' && rec.entityType !== typeFilter) return false;
      if (collectorFilter !== 'all' && rec.collectorName !== collectorFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = rec.recordCode.toLowerCase().includes(q);
        const matchTitle = rec.title.toLowerCase().includes(q);
        const matchCollector = rec.collectorName.toLowerCase().includes(q);
        if (!matchCode && !matchTitle && !matchCollector) return false;
      }
      return true;
    });
  }, [records, activeTab, typeFilter, collectorFilter, searchQuery]);

  // Bulk actions
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredRecords.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleBulkApprove = async () => {
    try {
      const itemsToApprove = filteredRecords
        .filter((r) => selectedIds.includes(r.id))
        .map((r) => ({
          entity: r.entityType as
            | 'farmer'
            | 'plot'
            | 'fee_collection'
            | 'water_request'
            | 'crop_production'
            | 'household'
            | 'stream_flow_reading',
          id: r.id,
        }));
      if (itemsToApprove.length > 0) {
        await bulkApprove({ items: itemsToApprove });
      }
      setSelectedIds([]);
    } catch {
      setSelectedIds([]);
    }
  };

  // Single Approve
  const handleApproveSingle = async (id: string) => {
    const rec = records.find((r) => r.id === id);
    if (rec) {
      try {
        await approveRecord({ entity: rec.entityType, id: rec.id });
      } catch {
        // fallback
      }
    }
    if (inspectRecord?.id === id) setInspectRecord(null);
  };

  // Return with Comment
  const handleConfirmReturn = async () => {
    if (!returnModalRecord || !returnComment.trim()) return;
    try {
      await returnRecord({
        entity: returnModalRecord.entityType,
        id: returnModalRecord.id,
        payload: { comment: returnComment.trim() },
      });
    } catch {
      // fallback
    }
    setReturnModalRecord(null);
    setReturnComment('');
    if (inspectRecord?.id === returnModalRecord.id) setInspectRecord(null);
  };

  // Conflict Pick Per Field & Resolve
  const handlePickField = (field: string, source: 'device' | 'server') => {
    setConflictPicks((prev) => ({ ...prev, [field]: source }));
  };

  const handleResolveConflict = () => {
    if (!conflictModalRecord) return;
    setConflictModalRecord(null);
    setConflictPicks({});
  };

  return (
    <div className="space-y-4 animate-in fade-in-50">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
              Supervisory Quality Gate
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-bold text-slate-600">
              {currentScope.name || 'HVIP & All Schemes'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Review Queue & Conflict Resolution
          </h2>
          <p className="text-xs text-slate-500">
            Review incoming offline synchronisations, verify spatial and demographic changes, and
            resolve concurrent version collisions.
          </p>
        </div>

        {/* Bulk Action Controls */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl shadow-xs">
            <span className="text-xs font-bold text-emerald-900">
              {selectedIds.length} Selected
            </span>
            <Button
              size="sm"
              onClick={handleBulkApprove}
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold gap-1.5"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Bulk Approve
            </Button>
          </div>
        )}
      </div>

      {/* Tabs and Filters Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 border border-slate-200 p-1 rounded-xl bg-slate-50 text-xs font-bold">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/50'
            }`}
          >
            All Incoming ({records.length})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/50'
            }`}
          >
            Pending ({records.filter((r) => r.status === 'pending_review').length})
          </button>
          <button
            onClick={() => setActiveTab('conflicts')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'conflicts'
                ? 'bg-white text-rose-700 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/50'
            }`}
          >
            Conflicts ({records.filter((r) => r.status === 'conflict').length})
          </button>
        </div>

        {/* Filter Selects & Search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-48 sm:w-60">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search code, title, collector..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-xs h-8 bg-slate-50/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <div className="w-32 sm:w-36">
              <Select value={typeFilter} onValueChange={(val: string) => setTypeFilter(val)}>
                <SelectTrigger
                  aria-label="Filter by type"
                  className="h-8 min-h-[32px] w-full bg-slate-50 border-slate-200 text-xs font-semibold rounded-lg hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
                >
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl border-slate-200">
                  <SelectItem value="all" className="text-xs font-medium py-2">
                    All Types
                  </SelectItem>
                  <SelectItem value="plot" className="text-xs font-medium py-2">
                    Plots
                  </SelectItem>
                  <SelectItem value="farmer" className="text-xs font-medium py-2">
                    Farmers
                  </SelectItem>
                  <SelectItem value="water_request" className="text-xs font-medium py-2">
                    Water Requests
                  </SelectItem>
                  <SelectItem value="crop_production" className="text-xs font-medium py-2">
                    Crop Production
                  </SelectItem>
                  <SelectItem value="fee_collection" className="text-xs font-medium py-2">
                    Fee Collections
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-36 sm:w-40">
              <Select
                value={collectorFilter}
                onValueChange={(val: string) => setCollectorFilter(val)}
              >
                <SelectTrigger
                  aria-label="Filter by collector"
                  className="h-8 min-h-[32px] w-full bg-slate-50 border-slate-200 text-xs font-semibold rounded-lg hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
                >
                  <SelectValue placeholder="All Collectors" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl border-slate-200">
                  <SelectItem value="all" className="text-xs font-medium py-2">
                    All Collectors
                  </SelectItem>
                  <SelectItem value="Aliyu Garba" className="text-xs font-medium py-2">
                    Aliyu Garba
                  </SelectItem>
                  <SelectItem value="Ibrahim Sani" className="text-xs font-medium py-2">
                    Ibrahim Sani
                  </SelectItem>
                  <SelectItem value="Fatima Mohammed" className="text-xs font-medium py-2">
                    Fatima Mohammed
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Review Records Table / List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={
                      filteredRecords.length > 0 && selectedIds.length === filteredRecords.length
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">Record Identifier</th>
                <th className="py-3 px-4">Entity Type</th>
                <th className="py-3 px-4">Collector & Sector</th>
                <th className="py-3 px-4">Submission Time</th>
                <th className="py-3 px-4">Status & Conflict</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <span className="font-bold text-slate-700 block">Queue Clear</span>
                    No records match current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => {
                  const isSelected = selectedIds.includes(rec.id);
                  return (
                    <tr
                      key={rec.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isSelected ? 'bg-teal-50/30' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(rec.id)}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {rec.recordCode}
                        </span>
                        <div className="font-bold text-slate-800 mt-1">{rec.title}</div>
                      </td>
                      <td className="py-3.5 px-4 capitalize font-semibold text-slate-600">
                        {rec.entityType.replace('_', ' ')}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{rec.collectorName}</div>
                        <div className="text-[11px] text-slate-400">{rec.sectorName}</div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-500">{rec.submittedAt}</td>
                      <td className="py-3.5 px-4">
                        {rec.status === 'conflict' ? (
                          <Badge
                            variant="destructive"
                            className="text-[10px] font-bold uppercase tracking-wider gap-1"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {rec.conflictType?.replace('_', ' ')}
                          </Badge>
                        ) : rec.status === 'needs_fixing' ? (
                          <Badge
                            variant="outline"
                            className="border-amber-300 text-amber-800 bg-amber-50 text-[10px] font-bold gap-1"
                          >
                            <Undo2 className="h-3 w-3" /> Returned
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-teal-300 text-teal-800 bg-teal-50 text-[10px] font-bold"
                          >
                            Pending Review
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {rec.status === 'conflict' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setConflictModalRecord(rec);
                              if (rec.deviceVersion) {
                                const initial: Record<string, 'device' | 'server'> = {};
                                Object.keys(rec.deviceVersion).forEach((k) => {
                                  initial[k] = 'device';
                                });
                                setConflictPicks(initial);
                              }
                            }}
                            className="text-rose-700 border-rose-200 hover:bg-rose-50 text-xs font-bold gap-1"
                          >
                            <Layers className="h-3 w-3" /> Resolve 409
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setInspectRecord(rec)}
                              className="text-xs font-semibold gap-1 text-slate-700"
                            >
                              <Eye className="h-3 w-3" /> Inspect
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setReturnModalRecord(rec)}
                              className="text-xs font-semibold text-amber-800 border-amber-200 hover:bg-amber-50 gap-1"
                            >
                              <Undo2 className="h-3 w-3" /> Return
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleApproveSingle(rec.id)}
                              className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Approve
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Review Inspection Panel Dialog */}
      {inspectRecord && (
        <Dialog open={!!inspectRecord} onOpenChange={(open) => !open && setInspectRecord(null)}>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs font-bold bg-teal-50 text-teal-900 border border-teal-200 px-2 py-0.5 rounded-full">
                  {inspectRecord.recordCode}
                </span>
                <span className="text-xs text-slate-400 capitalize">
                  {inspectRecord.entityType.replace('_', ' ')}
                </span>
              </div>
              <DialogTitle className="text-lg font-black text-slate-900">
                {inspectRecord.title}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              {/* Collector Metadata */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Collector
                  </span>
                  <span className="font-bold text-slate-900 mt-0.5 block">
                    {inspectRecord.collectorName}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Sector
                  </span>
                  <span className="font-bold text-slate-900 mt-0.5 block">
                    {inspectRecord.sectorName}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Submission Timestamp
                  </span>
                  <span className="font-bold text-slate-900 mt-0.5 block flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-slate-400" /> {inspectRecord.submittedAt}
                  </span>
                </div>
                {inspectRecord.coordinates && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      GPS Coordinates
                    </span>
                    <span className="font-bold text-teal-800 mt-0.5 block flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-teal-600" />
                      {inspectRecord.coordinates.lat.toFixed(4)},{' '}
                      {inspectRecord.coordinates.lng.toFixed(4)}
                    </span>
                  </div>
                )}
              </div>

              {/* Changes Since Last Version Diff */}
              {inspectRecord.changesSinceLastVersion && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-teal-700" />
                    Changes Since Last Version
                  </span>
                  <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                    {inspectRecord.changesSinceLastVersion.map((diff, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 flex items-center justify-between bg-slate-50/50"
                      >
                        <span className="font-bold text-slate-700">{diff.field}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 line-through bg-rose-50 px-1.5 py-0.5 rounded text-[11px]">
                            {diff.from}
                          </span>
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                          <span className="font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
                            {diff.to}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Data Summary Grid */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-900">Record Data Payload</span>
                <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-3 rounded-xl border border-slate-200">
                  {Object.entries(inspectRecord.summaryData).map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-slate-200/60 pb-1">
                      <span className="text-slate-500">{k}:</span>
                      <span className="font-bold text-slate-900">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setReturnModalRecord(inspectRecord);
                }}
                className="text-amber-800 border-amber-200 hover:bg-amber-50 text-xs font-bold gap-1"
              >
                <Undo2 className="h-3 w-3" /> Return to Collector
              </Button>
              <Button
                size="sm"
                onClick={() => handleApproveSingle(inspectRecord.id)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold gap-1"
              >
                <CheckCircle2 className="h-3 w-3" /> Approve Record
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Return to Collector with Required Comment Modal */}
      {returnModalRecord && (
        <Dialog
          open={!!returnModalRecord}
          onOpenChange={(open) => !open && setReturnModalRecord(null)}
        >
          <DialogContent className="max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 text-amber-700 text-xs font-bold mb-1">
                <Undo2 className="h-3.5 w-3.5" /> Return Record for Correction
              </div>
              <DialogTitle className="text-base font-black text-slate-900">
                Return {returnModalRecord.recordCode}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pt-2 text-xs">
              <p className="text-slate-500">
                Provide instructions for{' '}
                <span className="font-bold text-slate-800">{returnModalRecord.collectorName}</span>.
                This comment will open directly in their mobile edit form on their next sync.
              </p>
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Supervisor Correction Notes *</label>
                <Input
                  placeholder="e.g. Please re-verify the plot polygon boundary vertices with the WUA elder..."
                  value={returnComment}
                  onChange={(e) => setReturnComment(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setReturnModalRecord(null);
                  setReturnComment('');
                }}
                className="text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!returnComment.trim()}
                onClick={handleConfirmReturn}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
              >
                Confirm Return
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Side-by-Side Conflict Pick-Per-Field Modal */}
      {conflictModalRecord &&
        conflictModalRecord.deviceVersion &&
        conflictModalRecord.serverVersion && (
          <Dialog
            open={!!conflictModalRecord}
            onOpenChange={(open) => !open && setConflictModalRecord(null)}
          >
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
              <DialogHeader className="border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="destructive" className="text-[10px]">
                    Conflict Resolution (409 Mismatch)
                  </Badge>
                  <span className="font-mono text-xs font-bold text-slate-700">
                    {conflictModalRecord.recordCode}
                  </span>
                </div>
                <DialogTitle className="text-lg font-black text-slate-900">
                  Side-by-Side Conflict Resolution: Pick Per Field
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-2 text-xs">
                <p className="text-slate-500">
                  Select whether to adopt the mobile device's field capture or preserve the
                  authoritative server version for each conflicting attribute:
                </p>

                <div className="rounded-2xl border border-slate-200 overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="py-2.5 px-3">Attribute</th>
                        <th className="py-2.5 px-3">Device (Field Collector)</th>
                        <th className="py-2.5 px-3">Server (Authoritative)</th>
                        <th className="py-2.5 px-3 text-right">Selected Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.keys(conflictModalRecord.deviceVersion).map((field) => {
                        const devVal = conflictModalRecord.deviceVersion![field];
                        const srvVal = conflictModalRecord.serverVersion![field] || '—';
                        const selectedSource = conflictPicks[field] || 'device';

                        return (
                          <tr key={field} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-bold text-slate-800 capitalize">
                              {field}
                            </td>
                            <td
                              onClick={() => handlePickField(field, 'device')}
                              className={`py-2.5 px-3 cursor-pointer transition-colors ${
                                selectedSource === 'device'
                                  ? 'bg-amber-100/50 font-bold text-amber-900'
                                  : 'text-slate-600'
                              }`}
                            >
                              {devVal}
                            </td>
                            <td
                              onClick={() => handlePickField(field, 'server')}
                              className={`py-2.5 px-3 cursor-pointer transition-colors ${
                                selectedSource === 'server'
                                  ? 'bg-teal-100/50 font-bold text-teal-900'
                                  : 'text-slate-600'
                              }`}
                            >
                              {srvVal}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  selectedSource === 'device'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-teal-100 text-teal-800'
                                }`}
                              >
                                {selectedSource}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <DialogFooter className="border-t border-slate-100 pt-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConflictModalRecord(null)}
                  className="text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleResolveConflict}
                  className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold"
                >
                  Save Resolved Record
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
    </div>
  );
}
