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
  ChevronDown,
  ChevronUp,
  FileText,
  ShieldAlert,
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
  data: Record<string, unknown>;
  recordId: string;
}

export function FieldRecordsView() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState('all');
  const [entityFilter, setEntityFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [records, setRecords] = React.useState<RecordDisplayItem[]>([]);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const { pendingOpsCount } = useSync();

  // Load records directly from Dexie localDb
  const loadRecords = React.useCallback(async () => {
    try {
      const stored = await localDb.records.toArray();
      const outbox = await localDb.outbox.toArray();
      const outboxRecordIds = new Set(outbox.map((op) => op.recordId));

      const items: RecordDisplayItem[] = stored.map((r: LocalRecord) => {
        const d = (r.data || {}) as Record<string, unknown>;
        let title = '';
        let subtitle = '';

        switch (r.entity) {
          case 'farmer': {
            const name = `${d.firstName || ''} ${d.lastName || ''}`.trim();
            title = name
              ? `${name} (${d.farmerCode || 'Farmer'})`
              : `Farmer ${d.farmerCode || r.recordId.slice(0, 8)}`;
            subtitle = `Village: ${d.village || 'N/A'} · Phone: ${d.phone || 'N/A'}${d.gender ? ` · ${d.gender}` : ''}`;
            break;
          }
          case 'farm':
          case 'plot': {
            title = `Plot ${d.plotCode || d.name || r.recordId.slice(0, 8)}`;
            subtitle = `Area: ${d.areaHa ? d.areaHa + ' ha' : 'N/A'} · Block: ${d.blockId || d.channelId || 'Main Canal'}`;
            break;
          }
          case 'water_request': {
            title = `Water Request: ${d.volumeM3 ? d.volumeM3 + ' m³' : 'Scheduled'}`;
            subtitle = `Requested: ${d.requestedFor || d.periodFromOn || (typeof d.createdAt === 'string' ? d.createdAt.slice(0, 10) : 'Pending')} · Canal: ${d.channelId || 'Canal 1'}`;
            break;
          }
          case 'fee_collection': {
            title = `Water Fee Receipt: ${d.fieldReceiptRef || d.receiptNo || 'CASH-REC'}`;
            subtitle = `Amount Collected: ₦${Number(d.amountNgn || 0).toLocaleString()} · Paid: ${d.paidOn || 'Confirmed'}`;
            break;
          }
          case 'fee_billing': {
            title = `Fee Billing Invoice`;
            subtitle = `Billed Amount: ₦${Number(d.amountNgn || 0).toLocaleString()} · Due: ${d.dueDate || 'N/A'}`;
            break;
          }
          case 'crop_production': {
            title = `${d.cropName || d.cropType || 'Crop Production'} (${d.season || '2026 Season'})`;
            subtitle = `Planted: ${d.areaHa || 0} ha · Yield: ${d.harvestTons || d.yieldTons || 0} tons`;
            break;
          }
          case 'survey_response': {
            const resp = d.respondentName
              ? `Respondent: ${d.respondentName}`
              : d.farmerId
                ? `Farmer: ${String(d.farmerId).slice(0, 8)}`
                : 'Beneficiary Response';
            title = `${d.surveyName || 'M&E Beneficiary Survey'}`;
            subtitle = `${resp} · ${d.collectedAt ? String(d.collectedAt).slice(0, 10) : 'Recorded'}`;
            break;
          }
          case 'dam_inspection':
          case 'dam_safety_inspection': {
            title = `Dam Safety Inspection (${d.damName || d.stationName || 'Structure ' + r.recordId.slice(0, 8)})`;
            subtitle = `Water Level: ${d.waterLevelM ? d.waterLevelM + ' m' : 'Normal'} · Status: ${d.status || d.overallCondition || 'Operational'}`;
            break;
          }
          case 'training':
          case 'training_attendance': {
            title = `${d.topic || d.courseName || 'Capacity Training Attendance'}`;
            subtitle = `Location: ${d.location || 'Scheme Office'} · Attendees: ${d.attendeeCount || 1}`;
            break;
          }
          default: {
            title = `${r.entity.replace(/_/g, ' ').toUpperCase()}: ${r.recordId.slice(0, 8)}`;
            subtitle = `Scheme: ${r.schemeId ? r.schemeId.slice(0, 8) : 'General'} · Version ${r.version}`;
          }
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
          recordId: r.recordId,
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
            ? new Date(r.updatedAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Today',
          comment:
            r.rejectionReason ||
            (r.status === 'conflict'
              ? 'Held offline conflict: Concurrent update detected on server.'
              : undefined),
          editRoute,
          data: d,
        };
      });

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
      case 'plot':
        return <MapPin className="h-4 w-4 text-emerald-700" />;
      case 'water_request':
        return <Droplets className="h-4 w-4 text-blue-700" />;
      case 'fee_collection':
      case 'fee_billing':
        return <FileSpreadsheet className="h-4 w-4 text-amber-700" />;
      case 'training_attendance':
      case 'training':
        return <GraduationCap className="h-4 w-4 text-purple-700" />;
      case 'crop_production':
        return <Sprout className="h-4 w-4 text-lime-700" />;
      case 'survey_response':
        return <FileText className="h-4 w-4 text-indigo-700" />;
      case 'dam_inspection':
      case 'dam_safety_inspection':
        return <ShieldAlert className="h-4 w-4 text-orange-700" />;
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
                Plots & Boundaries
              </SelectItem>
              <SelectItem value="water_request" className="text-xs font-medium py-2">
                Water Requests
              </SelectItem>
              <SelectItem value="fee_collection" className="text-xs font-medium py-2">
                Fee Payments
              </SelectItem>
              <SelectItem value="fee_billing" className="text-xs font-medium py-2">
                Fee Bills
              </SelectItem>
              <SelectItem value="crop_production" className="text-xs font-medium py-2">
                Crop Production
              </SelectItem>
              <SelectItem value="survey_response" className="text-xs font-medium py-2">
                M&E Surveys
              </SelectItem>
              <SelectItem value="dam_inspection" className="text-xs font-medium py-2">
                Dam Inspections
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
                  <div className="flex items-center gap-1.5">
                    {item.status === 'conflict' || item.status === 'rejected' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 px-2.5 border-rose-300 text-rose-700 hover:bg-rose-100/80 font-bold cursor-pointer"
                        onClick={() => item.editRoute && navigate({ to: item.editRoute })}
                      >
                        Edit & Resubmit
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2 text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                      onClick={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
                    >
                      {expandedId === item.id ? (
                        <>
                          <ChevronUp className="h-3 w-3" /> Hide Data
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" /> View Data Details
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {expandedId === item.id && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2 animate-in fade-in-50">
                    <div className="font-bold text-[10px] uppercase tracking-wider text-slate-500 flex items-center justify-between">
                      <span>Cached Record Attributes</span>
                      <span className="font-mono text-[10px] text-slate-400">{item.recordId}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      {Object.entries(item.data).map(([key, val]) => {
                        if (val === null || val === undefined || val === '') return null;
                        const displayVal =
                          typeof val === 'object'
                            ? Array.isArray(val)
                              ? val
                                  .map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)))
                                  .join(', ')
                              : JSON.stringify(val)
                            : String(val);
                        return (
                          <div key={key} className="bg-white p-2 rounded-lg border border-slate-100">
                            <span className="font-semibold text-slate-500 block text-[10px] uppercase tracking-wider">
                              {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                            </span>
                            <span className="text-slate-900 font-medium break-all">{displayVal}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
