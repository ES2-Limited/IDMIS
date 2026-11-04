import * as React from 'react';
import {
  FolderCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  User,
  MapPin,
} from 'lucide-react';
import { Card, CardContent, Input, Badge, Button, Tabs, TabsList, TabsTrigger } from '@idmis/ui';
import { useSync } from '../../sync';

interface RecordItem {
  id: string;
  entityType: 'farmer' | 'plot' | 'water' | 'fee';
  title: string;
  subtitle: string;
  status: 'queued' | 'synced' | 'conflict' | 'rejected';
  createdAt: string;
  comment?: string;
}

const mockFieldRecords: RecordItem[] = [
  {
    id: 'rec-001',
    entityType: 'farmer',
    title: 'Musa Ibrahim Danbatta',
    subtitle: 'NIN: ••••••••1234 · Sector B4 (HVIP)',
    status: 'queued',
    createdAt: 'Today, 10:15 AM',
  },
  {
    id: 'rec-002',
    entityType: 'plot',
    title: 'Plot B4-082 (1.45 ha)',
    subtitle: 'KRIS Western Branch · Maize (Dry)',
    status: 'queued',
    createdAt: 'Today, 09:30 AM',
  },
  {
    id: 'rec-003',
    entityType: 'farmer',
    title: 'Amina Bello Galadima',
    subtitle: 'Voter Card: ••••••••8901 · HVIP Sector A',
    status: 'synced',
    createdAt: 'Yesterday, 04:20 PM',
  },
  {
    id: 'rec-004',
    entityType: 'fee',
    title: 'Water Fee: ₦ 12,500',
    subtitle: 'Receipt #KRIS-2026-9041 · WUA Galadima',
    status: 'synced',
    createdAt: 'Yesterday, 02:15 PM',
  },
  {
    id: 'rec-005',
    entityType: 'plot',
    title: 'Plot C1-019 (0.80 ha)',
    subtitle: 'Boundary overlap detected with adjacent scheme',
    status: 'conflict',
    createdAt: '2 days ago',
    comment: 'Overlaps with existing verified parcel #C1-018 by 12%. Please walk boundary again.',
  },
];

export function FieldRecordsView() {
  const [activeTab, setActiveTab] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const { pendingOpsCount } = useSync();

  const filtered = mockFieldRecords.filter((rec) => {
    if (activeTab !== 'all' && rec.status !== activeTab) return false;
    if (!search) return true;
    const query = search.toLowerCase();
    return rec.title.toLowerCase().includes(query) || rec.subtitle.toLowerCase().includes(query);
  });

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">My Field Records</h2>
          <p className="text-xs text-slate-500">
            {mockFieldRecords.length} records cached locally on this device.
          </p>
        </div>
        {pendingOpsCount > 0 && (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-xs">
            {pendingOpsCount} Pending Sync
          </Badge>
        )}
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search records or identifiers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-white rounded-xl text-xs h-10 border-slate-200"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="all" className="text-xs rounded-lg">
            All ({mockFieldRecords.length})
          </TabsTrigger>
          <TabsTrigger value="queued" className="text-xs rounded-lg">
            Queued (2)
          </TabsTrigger>
          <TabsTrigger value="synced" className="text-xs rounded-lg">
            Synced (2)
          </TabsTrigger>
          <TabsTrigger value="conflict" className="text-xs rounded-lg">
            Returned (1)
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* List */}
      <div className="space-y-2.5">
        {filtered.map((item) => (
          <Card
            key={item.id}
            className={`rounded-2xl border transition-all ${
              item.status === 'conflict'
                ? 'border-rose-300 bg-rose-50/30'
                : item.status === 'queued'
                  ? 'border-amber-200 bg-amber-50/20'
                  : 'border-slate-200 bg-white'
            }`}
          >
            <CardContent className="p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-slate-100 text-slate-600">
                    {item.entityType === 'farmer' ? (
                      <User className="h-4 w-4 text-teal-700" />
                    ) : item.entityType === 'plot' ? (
                      <MapPin className="h-4 w-4 text-emerald-700" />
                    ) : (
                      <FolderCheck className="h-4 w-4 text-blue-700" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
                    <p className="text-[11px] text-slate-500">{item.subtitle}</p>
                  </div>
                </div>

                {item.status === 'queued' && (
                  <Badge
                    variant="outline"
                    className="border-amber-400 text-amber-700 bg-amber-50 text-[10px] flex items-center gap-1"
                  >
                    <Clock className="h-3 w-3" /> Queued
                  </Badge>
                )}
                {item.status === 'synced' && (
                  <Badge
                    variant="outline"
                    className="border-emerald-300 text-emerald-700 bg-emerald-50 text-[10px] flex items-center gap-1"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Synced
                  </Badge>
                )}
                {item.status === 'conflict' && (
                  <Badge variant="destructive" className="text-[10px] flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Action Needed
                  </Badge>
                )}
              </div>

              {item.comment && (
                <div className="p-2.5 rounded-xl bg-rose-100/70 border border-rose-200 text-rose-900 text-xs">
                  <span className="font-semibold">Reviewer note:</span> {item.comment}
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-400">
                <span>Recorded: {item.createdAt}</span>
                {item.status === 'conflict' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 px-2 border-rose-300 text-rose-700 hover:bg-rose-50"
                  >
                    Fix & Resubmit
                  </Button>
                ) : (
                  <span className="text-slate-500 font-medium">Saved offline</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
