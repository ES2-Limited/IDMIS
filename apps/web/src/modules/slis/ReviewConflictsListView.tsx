import * as React from 'react';
import { CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import {
  Card,
  CardContent,
  Button,
  Input,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@idmis/ui';
import { useScope } from '../../shell/ScopeContext';

export interface ConflictRecord {
  id: string;
  entityType: 'farmer' | 'plot' | 'water_request';
  recordCode: string;
  title: string;
  collectorName: string;
  schemeName: string;
  detectedAt: string;
  conflictType: 'concurrent_version' | 'boundary_overlap' | 'duplicate_identity';
  details: string;
  deviceVersion: Record<string, string>;
  serverVersion: Record<string, string>;
}

export const mockConflicts: ConflictRecord[] = [
  {
    id: '018f3a70-0031-7000-8000-000000000001',
    entityType: 'plot',
    recordCode: 'PLT-C1-019',
    title: 'Plot Boundary Overlap (0.80 ha)',
    collectorName: 'Aliyu Garba (Enumerator)',
    schemeName: 'Hadejia Valley Irrigation Project (HVIP)',
    detectedAt: 'Yesterday, 11:30 AM',
    conflictType: 'boundary_overlap',
    details:
      'Uploaded GeoJSON boundary polygon overlaps by 12.4% with verified adjacent parcel #C1-018.',
    deviceVersion: {
      plotCode: 'PLT-C1-019',
      areaHa: '0.8000',
      serviceType: 'conjunctive',
      farmer: 'Haruna Yusuf Sani',
      vertices: '7 points',
    },
    serverVersion: {
      plotCode: 'PLT-C1-018',
      areaHa: '1.1500',
      serviceType: 'gravity',
      farmer: 'Bello Galadima',
      vertices: '9 points',
    },
  },
  {
    id: '018f3a70-0032-7000-8000-000000000002',
    entityType: 'farmer',
    recordCode: 'NG-HVIP-00820',
    title: 'Farmer Profile Concurrent Edit (409 Conflict)',
    collectorName: 'Ibrahim Sani (Data Collector)',
    schemeName: 'Hadejia Valley Irrigation Project (HVIP)',
    detectedAt: 'Today, 08:45 AM',
    conflictType: 'concurrent_version',
    details:
      'Offline device submitted baseVersion: 1 while server was updated to version 2 by Scheme Office.',
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
];

export function ReviewConflictsListView() {
  const { currentScope } = useScope();
  const [conflicts, setConflicts] = React.useState<ConflictRecord[]>(mockConflicts);
  const [selectedConflict, setSelectedConflict] = React.useState<ConflictRecord | null>(null);
  const [resolutionComment, setResolutionComment] = React.useState('');

  const handleResolve = (action?: 'accept_device' | 'keep_server' | 'request_walk') => {
    if (!selectedConflict) return;
    void action;
    setConflicts((prev) => prev.filter((c) => c.id !== selectedConflict.id));
    setSelectedConflict(null);
    setResolutionComment('');
  };

  return (
    <div className="space-y-4 animate-in fade-in-50">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              {currentScope.name || 'All Schemes'}
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">Supervisor Queue</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
            Review Queue & Held Conflicts
          </h2>
        </div>
      </div>

      {/* Info Card */}
      <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 text-xs text-rose-950 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold">Supervisory Conflict Resolution: </span>
          Records held in conflict require scheme data officer intervention. Field collectors
          receive your notes and resolution decisions on their next offline sync cycle.
        </div>
      </div>

      {/* Conflicts List */}
      <div className="space-y-3">
        {conflicts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 p-8">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <h4 className="font-bold text-slate-900 text-sm">Review Queue Clear</h4>
            <p className="text-xs text-slate-400 mt-1">
              No held conflicts or pending supervisory disputes.
            </p>
          </div>
        ) : (
          conflicts.map((conflict) => (
            <Card
              key={conflict.id}
              className="rounded-2xl border-rose-200/90 bg-white shadow-2xs hover:shadow-sm transition-all"
            >
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-rose-900 bg-rose-100/70 px-2 py-0.5 rounded-full">
                        {conflict.recordCode}
                      </span>
                      <Badge
                        variant="destructive"
                        className="text-[10px] uppercase font-bold tracking-wider"
                      >
                        {conflict.conflictType.replace('_', ' ')}
                      </Badge>
                    </div>
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 mt-1.5">
                      {conflict.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Reported by{' '}
                      <span className="font-semibold text-slate-700">{conflict.collectorName}</span>{' '}
                      · {conflict.schemeName}
                    </p>
                  </div>

                  <span className="text-[11px] text-slate-400 font-medium shrink-0">
                    {conflict.detectedAt}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 leading-relaxed">
                  <span className="font-bold text-slate-900">Conflict Details: </span>
                  {conflict.details}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-400 font-medium">
                    Resolution required before sync commit
                  </span>
                  <Button
                    size="sm"
                    onClick={() => setSelectedConflict(conflict)}
                    className="bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs h-8 px-3.5 rounded-xl shadow-xs"
                  >
                    Resolve Dispute
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Conflict Resolution Comparison Dialog */}
      {selectedConflict && (
        <Dialog open={Boolean(selectedConflict)} onOpenChange={() => setSelectedConflict(null)}>
          <DialogContent className="max-w-2xl p-6 rounded-3xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="destructive" className="text-[10px]">
                  Conflict Resolution
                </Badge>
                <span className="font-mono text-xs font-bold text-slate-700">
                  {selectedConflict.recordCode}
                </span>
              </div>
              <DialogTitle className="text-lg font-black text-slate-900">
                {selectedConflict.title}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-4">
                {/* Device Version */}
                <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-2">
                  <span className="text-xs font-bold text-amber-900 block border-b border-amber-200/60 pb-1.5">
                    Field Device Version (Collector)
                  </span>
                  {Object.entries(selectedConflict.deviceVersion).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-0.5">
                      <span className="text-slate-500 capitalize">{k}:</span>
                      <span className="font-bold text-slate-900">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Server Version */}
                <div className="p-3.5 rounded-2xl bg-teal-50/60 border border-teal-200 space-y-2">
                  <span className="text-xs font-bold text-teal-900 block border-b border-teal-200/60 pb-1.5">
                    Central Server Version (Authoritative)
                  </span>
                  {Object.entries(selectedConflict.serverVersion).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-0.5">
                      <span className="text-slate-500 capitalize">{k}:</span>
                      <span className="font-bold text-slate-900">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Supervisor Decision Notes *
                </label>
                <Input
                  placeholder="Explain resolution (e.g. Verified with village elder, re-walk required...)"
                  value={resolutionComment}
                  onChange={(e) => setResolutionComment(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResolve('keep_server')}
                className="text-xs font-bold"
              >
                Keep Server Version
              </Button>
              <Button
                size="sm"
                onClick={() => handleResolve('accept_device')}
                className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold"
              >
                Accept Device Updates
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
