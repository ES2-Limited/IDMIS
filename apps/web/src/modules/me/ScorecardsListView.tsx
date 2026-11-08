import * as React from 'react';
import {
  Award,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Layers,
  UploadCloud,
  Download,
  Building,
} from 'lucide-react';
import {
  Button,
  Input,
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
  useToast,
} from '@idmis/ui';
import { useScope } from '../../shell/ScopeContext';

export interface ScorecardRecord {
  id: string;
  schemeId: string;
  schemeName: string;
  periodYear: number;
  overallScore: number; // 0-100
  ratingTier: 'A' | 'B' | 'C' | 'D';
  publishedOn?: string | null;
  status: 'published' | 'draft' | 'under_review';
  wuaGovernanceScore: number;
  isfCollectionRate: number;
  infrastructureStatus: string;
  storageKey?: string;
  fileName?: string;
}

const INITIAL_SCORECARDS: ScorecardRecord[] = [
  {
    id: 'sc-1',
    schemeId: 'kano',
    schemeName: 'Kano River Irrigation Scheme',
    periodYear: 2026,
    overallScore: 88,
    ratingTier: 'A',
    publishedOn: '2026-03-15',
    status: 'published',
    wuaGovernanceScore: 92,
    isfCollectionRate: 84.5,
    infrastructureStatus: 'Good (Canal Desilted)',
    fileName: 'KRIS_Annual_Scorecard_2026.pdf',
  },
  {
    id: 'sc-2',
    schemeId: 'bakolori',
    schemeName: 'Bakolori Irrigation Scheme',
    periodYear: 2026,
    overallScore: 78,
    ratingTier: 'B',
    publishedOn: '2026-03-20',
    status: 'published',
    wuaGovernanceScore: 80,
    isfCollectionRate: 76.5,
    infrastructureStatus: 'Fair (Lateral 8 Gate Repair)',
    fileName: 'BIS_Performance_Audit_2026.pdf',
  },
  {
    id: 'sc-3',
    schemeId: 'hadejia',
    schemeName: 'Hadejia Valley Scheme',
    periodYear: 2026,
    overallScore: 68,
    ratingTier: 'C',
    publishedOn: null,
    status: 'under_review',
    wuaGovernanceScore: 70,
    isfCollectionRate: 64.0,
    infrastructureStatus: 'Needs Maintenance (Drain Siltation)',
    fileName: 'Hadejia_Draft_Scorecard_2026.pdf',
  },
];

export function ScorecardsListView() {
  const { currentScope } = useScope();
  const { success, info } = useToast();

  const [scorecards, setScorecards] = React.useState<ScorecardRecord[]>(INITIAL_SCORECARDS);
  const [selectedYear, setSelectedYear] = React.useState<string>('2026');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // New Scorecard Dialog State
  const [isCreateOpen, setIsCreateOpen] = React.useState<boolean>(false);
  const [newSchemeName, setNewSchemeName] = React.useState<string>('Kano River Irrigation Scheme');
  const [newYear, setNewYear] = React.useState<string>('2026');
  const [newGovScore, setNewGovScore] = React.useState<number>(85);
  const [newIsfRate, setNewIsfRate] = React.useState<number>(80);
  const [newInfraStatus, setNewInfraStatus] = React.useState<string>('Satisfactory');
  const [newFileUploaded, setNewFileUploaded] = React.useState<string | null>(null);

  const filteredScorecards = React.useMemo(() => {
    return scorecards.filter((sc) => {
      if (selectedYear !== 'all' && String(sc.periodYear) !== selectedYear) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          sc.schemeName.toLowerCase().includes(q) ||
          sc.infrastructureStatus.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [scorecards, selectedYear, searchQuery]);

  const handleCreateScorecard = () => {
    const overall = Math.round((newGovScore + newIsfRate) / 2);
    const tier: 'A' | 'B' | 'C' | 'D' =
      overall >= 85 ? 'A' : overall >= 75 ? 'B' : overall >= 65 ? 'C' : 'D';

    const created: ScorecardRecord = {
      id: `sc-${Date.now()}`,
      schemeId: 'custom-scheme',
      schemeName: newSchemeName,
      periodYear: Number(newYear),
      overallScore: overall,
      ratingTier: tier,
      publishedOn: new Date().toISOString().split('T')[0],
      status: 'published',
      wuaGovernanceScore: newGovScore,
      isfCollectionRate: newIsfRate,
      infrastructureStatus: newInfraStatus,
      fileName: newFileUploaded || 'Scheme_Governance_Scorecard.pdf',
    };

    setScorecards((prev) => [created, ...prev]);
    setIsCreateOpen(false);
    setNewFileUploaded(null);
    success(
      'Scorecard Published',
      `${newSchemeName} (${newYear}) evaluation scorecard published to register.`,
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in-50">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Award className="h-3 w-3 text-amber-700" /> Scheme Governance & Performance
              Scorecards
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-bold text-slate-600">
              Scope: {currentScope.name || 'National Level'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Institutional Scorecards Register
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Annual participatory governance, ISF collection recovery, and physical infrastructure
            audits for Water User Associations (WUAs).
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setIsCreateOpen(true)}
          className="text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white gap-1.5 cursor-pointer shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" /> Publish New Scorecard
        </Button>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Evaluated Schemes</span>
            <Building className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{scorecards.length}</span>
            <span className="text-xs text-emerald-700 font-bold">100% Audited</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200 bg-emerald-50/20 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-bold">
            <span>Tier A Rating</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-950">
              {scorecards.filter((s) => s.ratingTier === 'A').length}
            </span>
            <span className="text-xs text-emerald-700 font-medium">Excellent Performance</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-amber-200 bg-amber-50/20 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-amber-900 text-xs font-bold">
            <span>Average ISF Recovery</span>
            <Clock className="h-4 w-4 text-amber-700" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-950">75.0%</span>
            <span className="text-xs text-amber-800 font-medium">+10% vs Baseline</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Published Reports</span>
            <Layers className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">
              {scorecards.filter((s) => s.status === 'published').length}
            </span>
            <span className="text-xs text-slate-500 font-medium">Publicly Accessible</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-36">
            <Select value={selectedYear} onValueChange={(val) => setSelectedYear(val)}>
              <SelectTrigger className="h-8.5 text-xs font-medium bg-slate-50">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent className="bg-white shadow-xl">
                <SelectItem value="all" className="text-xs py-2">
                  All Years
                </SelectItem>
                <SelectItem value="2026" className="text-xs py-2">
                  Year 2026
                </SelectItem>
                <SelectItem value="2025" className="text-xs py-2">
                  Year 2025
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="text-xs text-slate-400">
            {filteredScorecards.length} Scorecards Found
          </span>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search scheme or condition..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs h-8.5 bg-slate-50"
          />
        </div>
      </div>

      {/* Scorecards Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Irrigation Scheme</th>
                <th className="py-3 px-4">Audit Year</th>
                <th className="py-3 px-4">Overall Grade</th>
                <th className="py-3 px-4">WUA Governance</th>
                <th className="py-3 px-4">ISF Recovery Rate</th>
                <th className="py-3 px-4">Physical Canal Status</th>
                <th className="py-3 px-4">Published Date</th>
                <th className="py-3 px-4 text-right">Audit PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredScorecards.map((sc) => (
                <tr key={sc.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-900">{sc.schemeName}</td>
                  <td className="py-3.5 px-4 font-mono font-medium text-slate-600">
                    {sc.periodYear}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center justify-center h-6 w-6 rounded-full font-black text-xs ${
                        sc.ratingTier === 'A'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : sc.ratingTier === 'B'
                            ? 'bg-blue-100 text-blue-900 border border-blue-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}
                    >
                      {sc.ratingTier}
                    </span>
                    <span className="ml-2 font-mono font-bold text-slate-700">
                      {sc.overallScore}%
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-800">
                    {sc.wuaGovernanceScore}/100
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-teal-800">
                    {sc.isfCollectionRate}%
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">
                    {sc.infrastructureStatus}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-500">
                    {sc.publishedOn || 'Draft Under Review'}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        info('Downloading Verified Scorecard', `${sc.fileName} (PDF Document)`)
                      }
                      className="h-7 px-2.5 text-xs font-semibold gap-1 text-slate-700 hover:text-amber-800 cursor-pointer"
                    >
                      <Download className="h-3 w-3 text-slate-400" /> PDF
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Publish Scorecard Dialog */}
      {isCreateOpen && (
        <Dialog open={isCreateOpen} onOpenChange={(open) => !open && setIsCreateOpen(false)}>
          <DialogContent className="max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 text-amber-800 text-xs font-bold mb-1">
                <Award className="h-3.5 w-3.5" /> Institutional Scorecard Publication
              </div>
              <DialogTitle className="text-base font-black text-slate-900">
                Publish Scheme Performance Scorecard
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pt-2 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Scheme Location *</label>
                <Input
                  value={newSchemeName}
                  onChange={(e) => setNewSchemeName(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Audit Year</label>
                  <Input
                    type="number"
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">WUA Governance (0-100)</label>
                  <Input
                    type="number"
                    value={newGovScore}
                    onChange={(e) => setNewGovScore(Number(e.target.value))}
                    className="text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">ISF Collection Rate (%)</label>
                  <Input
                    type="number"
                    value={newIsfRate}
                    onChange={(e) => setNewIsfRate(Number(e.target.value))}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Physical Canal Status</label>
                  <Input
                    value={newInfraStatus}
                    onChange={(e) => setNewInfraStatus(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center space-y-1.5">
                <UploadCloud className="h-5 w-5 text-slate-400 mx-auto" />
                <span className="font-bold text-slate-700 block text-xs">
                  {newFileUploaded || 'Upload Verified Audit Document (PDF)'}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => setNewFileUploaded('Audited_Scheme_Report_Signed.pdf')}
                  className="text-xs mt-1"
                >
                  {newFileUploaded ? 'Change Document' : 'Attach File'}
                </Button>
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
                onClick={handleCreateScorecard}
                className="bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold"
              >
                Publish Scorecard
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
