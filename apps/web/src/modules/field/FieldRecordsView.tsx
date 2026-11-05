import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  FolderCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  User,
  MapPin,
  Droplets,
  FileSpreadsheet,
  GraduationCap,
  Sprout,
  Filter,
} from 'lucide-react';
import {
  Card,
  CardContent,
  Input,
  Badge,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@idmis/ui';
import { localDb, type LocalRecord } from '@idmis/sync';
import { useSync } from '../../sync';

interface RecordDisplayItem {
  id: string;
  entityType: string;
  title: string;
  subtitle: string;
  status: 'saved_on_device' | 'synced' | 'conflict' | 'rejected' | 'queued';
  createdAt: string;
  comment?: string;
  editRoute?: string;
}

export function FieldRecordsView() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState('all');
  const [entityFilter, setEntityFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [records, setRecords] = React.useState<RecordDisplayItem[]>([]);
  const { pendingOpsCount } = useSync();

  // Load records directly from Dexie localDb
  const loadRecords = React.useCallback(async () => {
    try {
      const stored = await localDb.records.toArray();
      const outbox = await localDb.outbox.toArray();
      const outboxRecordIds = new Set(outbox.map((op) => op.recordId));

      const items: RecordDisplayItem[] = stored.map((r: LocalRecord) => {
        const d = r.data || {};
        let title = String(d.displayName || d.title || d.farmerCode || r.recordId);
        if (r.entity === 'farmer') {
          title =
            `${d.firstName || ''} ${d.lastName || ''}`.trim() || String(d.farmerCode || r.recordId);
        }

        let subtitle = `Scheme: ${r.schemeId ? 'Allocated' : 'General'}`;
        if (r.entity === 'farmer' && d.village) {
          subtitle = `Village: ${d.village} · Sector ${d.sectorId ? 'B4' : 'General'}`;
        } else if (r.entity === 'farm' && d.areaHa) {
          subtitle = `Area: ${d.areaHa} ha · Geodesic Polygon`;
        } else if (r.entity === 'water_request') {
          subtitle = `Volume: ${d.volumeM3 || 0} m³ · Season ${d.periodFromOn || ''}`;
        } else if (r.entity === 'fee_collection') {
          subtitle = `Receipt: ${d.fieldReceiptRef || d.receiptBookNo || 'Cash'} · ₦${d.amountNgn || 0}`;
        } else if (r.entity === 'crop_production') {
          subtitle = `${d.cropName || 'Crop'} · Area: ${d.areaHa || 0} ha`;
        } else if (r.entity === 'training_attendance') {
          subtitle = `${d.topic || 'PIM Training'} · Attendance`;
        }

        let editRoute = '/field/capture';
        if (r.entity === 'farmer') editRoute = '/field/capture/farmer';
        if (r.entity === 'farm') editRoute = '/field/capture/plot';
        if (r.entity === 'water_request') editRoute = '/field/capture/water';
        if (r.entity === 'fee_collection') editRoute = '/field/capture/fee';
        if (r.entity === 'training_attendance') editRoute = '/field/capture/training';
        if (r.entity === 'crop_production') editRoute = '/field/capture/crop';

        const isPending = outboxRecordIds.has(r.recordId);

        return {
          id: r.id,
          entityType: r.entity,
          title: title || 'Field Record',
          subtitle,
          status:
            r.status === 'conflict'
              ? 'conflict'
              : r.status === 'rejected'
                ? 'rejected'
                : isPending
                  ? 'queued'
                  : 'saved_on_device',
          createdAt: r.updatedAt
            ? new Date(r.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Today',
          comment:
            r.rejectionReason ||
            (r.status === 'conflict'
              ? 'Held offline conflict: Concurrent update detected on server.'
              : undefined),
          editRoute,
        };
      });

      // Include starter mock items if device store has few records
      if (items.length === 0) {
        items.push(
          {
            id: 'rec-mock-1',
            entityType: 'farmer',
            title: 'Musa Ibrahim Danbatta',
            subtitle: 'NIN: ••••••••1234 · Sector B4 (HVIP)',
            status: 'queued',
            createdAt: '10:15 AM',
            editRoute: '/field/capture/farmer',
          },
          {
            id: 'rec-mock-2',
            entityType: 'farm',
            title: 'Plot B4-082 (1.45 ha)',
            subtitle: 'KRIS Western Branch · Geodesic Walk',
            status: 'queued',
            createdAt: '09:30 AM',
            editRoute: '/field/capture/plot',
          },
          {
            id: 'rec-mock-3',
            entityType: 'farm',
            title: 'Plot C1-019 (0.80 ha)',
            subtitle: 'Boundary overlap detected with adjacent scheme',
            status: 'conflict',
            createdAt: 'Yesterday',
            comment:
              'Overlaps with existing verified parcel #C1-018 by 12%. Please walk boundary again.',
            editRoute: '/field/capture/plot',
          },
        );
      }

      setRecords(items);
    } catch {
      // Fallback
    }
  }, []);

  React.useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const filtered = records.filter((rec) => {
    if (activeTab === 'queued' && rec.status !== 'queued' && rec.status !== 'saved_on_device')
      return false;
    if (activeTab === 'conflict' && rec.status !== 'conflict' && rec.status !== 'rejected')
      return false;
    if (activeTab === 'synced' && rec.status !== 'synced') return false;

    if (entityFilter !== 'all' && rec.entityType !== entityFilter) return false;

    if (!search) return true;
    const query = search.toLowerCase();
    return rec.title.toLowerCase().includes(query) || rec.subtitle.toLowerCase().includes(query);
  });

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'farmer':
        return <User className="h-4 w-4 text-teal-700" />;
      case 'farm':
        return <MapPin className="h-4 w-4 text-emerald-700" />;
      case 'water_request':
        return <Droplets className="h-4 w-4 text-blue-700" />;
      case 'fee_collection':
        return <FileSpreadsheet className="h-4 w-4 text-amber-700" />;
      case 'training_attendance':
        return <GraduationCap className="h-4 w-4 text-purple-700" />;
      case 'crop_production':
        return <Sprout className="h-4 w-4 text-lime-700" />;
      default:
        return <FolderCheck className="h-4 w-4 text-slate-700" />;
    }
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-6 animate-in fade-in-50">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">My Field Records</h2>
          <p className="text-xs text-slate-500">
            {records.length} records cached locally on this device.
          </p>
        </div>
        {pendingOpsCount > 0 && (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-xs">
            {pendingOpsCount} Pending Sync
          </Badge>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search records or identifiers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white rounded-xl text-xs h-10 border-slate-200"
          />
        </div>
        <div className="w-36 sm:w-44">
          <Select value={entityFilter} onValueChange={(val: string) => setEntityFilter(val)}>
            <SelectTrigger
              aria-label="Filter records by type"
              className="h-10 min-h-[40px] w-full bg-white border-slate-200 text-xs font-semibold rounded-xl hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
            >
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-xl border-slate-200">
              <SelectItem value="all" className="text-xs font-medium py-2">
                All Types
              </SelectItem>
              <SelectItem value="farmer" className="text-xs font-medium py-2">
                Farmers
              </SelectItem>
              <SelectItem value="farm" className="text-xs font-medium py-2">
                Plots
              </SelectItem>
              <SelectItem value="water_request" className="text-xs font-medium py-2">
                Water
              </SelectItem>
              <SelectItem value="fee_collection" className="text-xs font-medium py-2">
                Fees
              </SelectItem>
              <SelectItem value="crop_production" className="text-xs font-medium py-2">
                Crops
              </SelectItem>
              <SelectItem value="training_attendance" className="text-xs font-medium py-2">
                Trainings
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="all" className="text-xs rounded-lg">
            All ({records.length})
          </TabsTrigger>
          <TabsTrigger value="queued" className="text-xs rounded-lg">
            Queued (
            {records.filter((r) => r.status === 'queued' || r.status === 'saved_on_device').length})
          </TabsTrigger>
          <TabsTrigger value="conflict" className="text-xs rounded-lg">
            Returned (
            {records.filter((r) => r.status === 'conflict' || r.status === 'rejected').length})
          </TabsTrigger>
          <TabsTrigger value="synced" className="text-xs rounded-lg">
            Synced ({records.filter((r) => r.status === 'synced').length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Records List */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="text-center py-8 bg-white border border-dashed border-slate-200 rounded-2xl p-6">
            <Filter className="h-6 w-6 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-600">No records found</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Try altering your search or status filter.
            </p>
          </div>
        ) : (
          filtered.map((item) => (
            <Card
              key={item.id}
              className={`rounded-2xl border transition-all ${
                item.status === 'conflict' || item.status === 'rejected'
                  ? 'border-rose-300 bg-rose-50/40'
                  : item.status === 'queued' || item.status === 'saved_on_device'
                    ? 'border-amber-200 bg-amber-50/20'
                    : 'border-slate-200 bg-white'
              }`}
            >
              <CardContent className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded-xl bg-slate-100 shrink-0">
                      {getEntityIcon(item.entityType)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 truncate">{item.subtitle}</p>
                    </div>
                  </div>

                  {(item.status === 'queued' || item.status === 'saved_on_device') && (
                    <Badge
                      variant="outline"
                      className="border-amber-400 text-amber-700 bg-amber-50 text-[10px] shrink-0 flex items-center gap-1"
                    >
                      <Clock className="h-3 w-3" /> Saved Locally
                    </Badge>
                  )}
                  {item.status === 'synced' && (
                    <Badge
                      variant="outline"
                      className="border-emerald-300 text-emerald-700 bg-emerald-50 text-[10px] shrink-0 flex items-center gap-1"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Synced
                    </Badge>
                  )}
                  {(item.status === 'conflict' || item.status === 'rejected') && (
                    <Badge
                      variant="destructive"
                      className="text-[10px] shrink-0 flex items-center gap-1"
                    >
                      <AlertTriangle className="h-3 w-3" /> Action Needed
                    </Badge>
                  )}
                </div>

                {item.comment && (
                  <div className="p-2.5 rounded-xl bg-rose-100/70 border border-rose-200 text-rose-900 text-xs">
                    <span className="font-bold">Supervisor note:</span> {item.comment}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-400">
                  <span>Recorded: {item.createdAt}</span>
                  {item.status === 'conflict' || item.status === 'rejected' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 px-2.5 border-rose-300 text-rose-700 hover:bg-rose-100/80 font-bold cursor-pointer"
                      onClick={() => item.editRoute && navigate({ to: item.editRoute })}
                    >
                      Edit & Resubmit
                    </Button>
                  ) : (
                    <span className="text-slate-500 font-medium">Device IndexedDB</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
