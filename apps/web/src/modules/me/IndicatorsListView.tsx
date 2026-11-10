import * as React from 'react';
import {
  Target,
  Search,
  Filter,
  Eye,
  Edit3,
  UploadCloud,
  FileSpreadsheet,
  Cpu,
  PenTool,
  HelpCircle,
  TrendingUp,
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
import { ImportWizard } from '../../imports/ImportWizard';
import { useIndicators } from './hooks';

export interface IndicatorItem {
  id: string;
  code: string;
  name: string;
  level: 'pdo' | 'intermediate';
  unit: string;
  frequency: string;
  method: 'computed' | 'manual' | 'survey';
  computeKey?: string | null;
  baseline?: string | null;
  baselineYear?: number | null;
  endTarget?: string | null;
  endTargetNote?: string | null;
  disaggregations: string[];
  currentValue?: string;
  status: 'on_track' | 'at_risk' | 'off_track';
  targetsByYear: Record<string, string>;
}

export const mockIndicators: IndicatorItem[] = [
  {
    id: '018f3a70-0051-7000-8000-000000000001',
    code: '1a',
    name: 'Direct project beneficiaries',
    level: 'pdo',
    unit: 'Number',
    frequency: 'quarterly',
    method: 'computed',
    computeKey: 'slis.beneficiaries',
    baseline: '0',
    baselineYear: 2020,
    endTarget: '10,000,000',
    endTargetNote: 'World Bank ICR verified target',
    disaggregations: ['gender', 'scheme', 'state'],
    currentValue: '8,420,500',
    status: 'on_track',
    targetsByYear: {
      '2024': '5,000,000',
      '2025': '7,500,000',
      '2026': '10,000,000',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000002',
    code: '1b',
    name: 'Female beneficiaries (%)',
    level: 'pdo',
    unit: '%',
    frequency: 'quarterly',
    method: 'computed',
    computeKey: 'slis.beneficiaries_female_pct',
    baseline: '15.0',
    baselineYear: 2020,
    endTarget: '50.0',
    disaggregations: ['scheme', 'state'],
    currentValue: '48.2',
    status: 'on_track',
    targetsByYear: {
      '2024': '40.0',
      '2025': '45.0',
      '2026': '50.0',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000003',
    code: '2a',
    name: 'Area provided with irrigation and drainage services',
    level: 'pdo',
    unit: 'ha',
    frequency: 'quarterly',
    method: 'computed',
    computeKey: 'slis.area_serviced',
    baseline: '12,500',
    baselineYear: 2020,
    endTarget: '50,000',
    disaggregations: ['scheme', 'state'],
    currentValue: '46,120',
    status: 'on_track',
    targetsByYear: {
      '2024': '35,000',
      '2025': '42,000',
      '2026': '50,000',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000004',
    code: '2b',
    name: 'Area provided with irrigation services – improved',
    level: 'pdo',
    unit: 'ha',
    frequency: 'quarterly',
    method: 'computed',
    computeKey: 'slis.area_improved',
    baseline: '8,000',
    baselineYear: 2020,
    endTarget: '27,000',
    endTargetNote: 'Gravity canal rehabilitation',
    disaggregations: ['scheme', 'state'],
    currentValue: '26,450',
    status: 'on_track',
    targetsByYear: {
      '2024': '20,000',
      '2025': '24,000',
      '2026': '27,000',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000005',
    code: '2c',
    name: 'Area provided with irrigation services – new expansion',
    level: 'pdo',
    unit: 'ha',
    frequency: 'quarterly',
    method: 'computed',
    computeKey: 'slis.area_new',
    baseline: '0',
    baselineYear: 2020,
    endTarget: '23,000',
    disaggregations: ['scheme', 'state'],
    currentValue: '19,670',
    status: 'at_risk',
    targetsByYear: {
      '2024': '15,000',
      '2025': '19,000',
      '2026': '23,000',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000006',
    code: '3',
    name: 'Cropping intensity (average annual crops per parcel)',
    level: 'pdo',
    unit: '%',
    frequency: 'annual',
    method: 'computed',
    computeKey: 'slis.cropping_intensity',
    baseline: '110.0',
    baselineYear: 2020,
    endTarget: '180.0',
    disaggregations: ['scheme'],
    currentValue: '168.5',
    status: 'on_track',
    targetsByYear: {
      '2024': '150.0',
      '2025': '165.0',
      '2026': '180.0',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000007',
    code: '4',
    name: 'Water user satisfaction with service delivery',
    level: 'pdo',
    unit: '%',
    frequency: 'annual',
    method: 'survey',
    baseline: '45.0',
    baselineYear: 2021,
    endTarget: '80.0',
    disaggregations: ['scheme', 'gender'],
    currentValue: '78.4',
    status: 'on_track',
    targetsByYear: {
      '2024': '70.0',
      '2025': '75.0',
      '2026': '80.0',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000008',
    code: '5',
    name: 'Fee collection rate vs total operational billing',
    level: 'intermediate',
    unit: '%',
    frequency: 'quarterly',
    method: 'computed',
    computeKey: 'slis.fee_recovery_rate',
    baseline: '32.0',
    baselineYear: 2020,
    endTarget: '85.0',
    disaggregations: ['scheme', 'wua'],
    currentValue: '88.2',
    status: 'on_track',
    targetsByYear: {
      '2024': '75.0',
      '2025': '80.0',
      '2026': '85.0',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000009',
    code: '6',
    name: 'Staff and dam engineers trained in dam safety surveillance',
    level: 'intermediate',
    unit: 'Number',
    frequency: 'annual',
    method: 'computed',
    computeKey: 'slis.trained_dam_safety',
    baseline: '12',
    baselineYear: 2020,
    endTarget: '120',
    disaggregations: ['gender', 'basin'],
    currentValue: '115',
    status: 'on_track',
    targetsByYear: {
      '2024': '80',
      '2025': '100',
      '2026': '120',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000010',
    code: '7',
    name: 'WUAs legally registered and operational under statutory framework',
    level: 'intermediate',
    unit: 'Number',
    frequency: 'quarterly',
    method: 'computed',
    computeKey: 'core.wua_operational',
    baseline: '45',
    baselineYear: 2020,
    endTarget: '210',
    disaggregations: ['scheme', 'state'],
    currentValue: '198',
    status: 'on_track',
    targetsByYear: {
      '2024': '160',
      '2025': '185',
      '2026': '210',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000011',
    code: '8',
    name: 'Female representation in WUA executive governance committees',
    level: 'intermediate',
    unit: '%',
    frequency: 'annual',
    method: 'survey',
    baseline: '8.0',
    baselineYear: 2020,
    endTarget: '30.0',
    disaggregations: ['scheme'],
    currentValue: '28.5',
    status: 'on_track',
    targetsByYear: {
      '2024': '22.0',
      '2025': '26.0',
      '2026': '30.0',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000012',
    code: '9',
    name: 'Farmers adopting climate-smart agricultural technology',
    level: 'intermediate',
    unit: 'Number',
    frequency: 'quarterly',
    method: 'computed',
    computeKey: 'me.tech_adopters',
    baseline: '1,200',
    baselineYear: 2020,
    endTarget: '18,000',
    disaggregations: ['scheme', 'gender'],
    currentValue: '16,400',
    status: 'on_track',
    targetsByYear: {
      '2024': '12,000',
      '2025': '15,000',
      '2026': '18,000',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000013',
    code: '10',
    name: 'Female farmers adopting improved technology packages',
    level: 'intermediate',
    unit: 'Number',
    frequency: 'quarterly',
    method: 'computed',
    computeKey: 'me.tech_adopters_female',
    baseline: '240',
    baselineYear: 2020,
    endTarget: '6,500',
    disaggregations: ['scheme'],
    currentValue: '5,920',
    status: 'on_track',
    targetsByYear: {
      '2024': '4,000',
      '2025': '5,200',
      '2026': '6,500',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000014',
    code: '11',
    name: 'Matching grants disbursed to farmer interest groups',
    level: 'intermediate',
    unit: 'Number',
    frequency: 'quarterly',
    method: 'manual',
    computeKey: null,
    baseline: '0',
    baselineYear: 2020,
    endTarget: '450',
    disaggregations: ['scheme', 'state'],
    currentValue: '412',
    status: 'on_track',
    targetsByYear: {
      '2024': '300',
      '2025': '380',
      '2026': '450',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000015',
    code: '12',
    name: 'Dams with upgraded instrumentation and real-time telemetry',
    level: 'intermediate',
    unit: 'Number',
    frequency: 'annual',
    method: 'manual',
    computeKey: null,
    baseline: '0',
    baselineYear: 2020,
    endTarget: '8',
    disaggregations: ['basin'],
    currentValue: '6',
    status: 'on_track',
    targetsByYear: {
      '2024': '4',
      '2025': '6',
      '2026': '8',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000016',
    code: '13',
    name: 'Emergency Action Plans (EAPs) prepared and tested',
    level: 'intermediate',
    unit: 'Number',
    frequency: 'annual',
    method: 'manual',
    computeKey: null,
    baseline: '0',
    baselineYear: 2020,
    endTarget: '8',
    disaggregations: ['basin'],
    currentValue: '7',
    status: 'on_track',
    targetsByYear: {
      '2024': '4',
      '2025': '6',
      '2026': '8',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000017',
    code: '14a',
    name: 'Yield of main product – Tomato (t/ha)',
    level: 'intermediate',
    unit: 't/ha',
    frequency: 'quarterly',
    method: 'computed',
    computeKey: 'slis.yield.tomato',
    baseline: '14.5',
    baselineYear: 2020,
    endTarget: '30.0',
    disaggregations: ['scheme'],
    currentValue: '28.4',
    status: 'on_track',
    targetsByYear: {
      '2024': '22.0',
      '2025': '26.0',
      '2026': '30.0',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000018',
    code: '14b',
    name: 'Yield of main product – Rice (t/ha)',
    level: 'intermediate',
    unit: 't/ha',
    frequency: 'quarterly',
    method: 'computed',
    computeKey: 'slis.yield.rice',
    baseline: '2.8',
    baselineYear: 2020,
    endTarget: '5.5',
    disaggregations: ['scheme'],
    currentValue: '5.1',
    status: 'on_track',
    targetsByYear: {
      '2024': '4.2',
      '2025': '4.8',
      '2026': '5.5',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000019',
    code: '14c',
    name: 'Yield of main product – Maize (t/ha)',
    level: 'intermediate',
    unit: 't/ha',
    frequency: 'quarterly',
    method: 'computed',
    computeKey: 'slis.yield.maize',
    baseline: '2.0',
    baselineYear: 2020,
    endTarget: '4.5',
    disaggregations: ['scheme'],
    currentValue: '4.2',
    status: 'on_track',
    targetsByYear: {
      '2024': '3.2',
      '2025': '3.8',
      '2026': '4.5',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000020',
    code: '14d',
    name: 'Yield of main product – Onion (t/ha)',
    level: 'intermediate',
    unit: 't/ha',
    frequency: 'quarterly',
    method: 'computed',
    computeKey: 'slis.yield.onion',
    baseline: '12.0',
    baselineYear: 2020,
    endTarget: '24.0',
    disaggregations: ['scheme'],
    currentValue: '23.1',
    status: 'on_track',
    targetsByYear: {
      '2024': '18.0',
      '2025': '21.0',
      '2026': '24.0',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000021',
    code: '15',
    name: 'Commercial partnerships with agro-processing off-takers',
    level: 'intermediate',
    unit: 'Number',
    frequency: 'quarterly',
    method: 'manual',
    computeKey: null,
    baseline: '1',
    baselineYear: 2020,
    endTarget: '7',
    disaggregations: ['scheme'],
    currentValue: '6',
    status: 'on_track',
    targetsByYear: {
      '2024': '4',
      '2025': '6',
      '2026': '7',
    },
  },
  {
    id: '018f3a70-0051-7000-8000-000000000022',
    code: '16',
    name: 'Scheme performance scorecards monitored and published',
    level: 'intermediate',
    unit: 'Number',
    frequency: 'annual',
    method: 'computed',
    computeKey: 'me.scorecards_published',
    baseline: '0',
    baselineYear: 2020,
    endTarget: '4',
    disaggregations: ['scheme'],
    currentValue: '4',
    status: 'on_track',
    targetsByYear: {
      '2024': '2',
      '2025': '3',
      '2026': '4',
    },
  },
];

export function IndicatorsListView() {
  const { currentScope } = useScope();
  const [levelFilter, setLevelFilter] = React.useState<'all' | 'pdo' | 'intermediate'>('all');
  const [methodFilter, setMethodFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');

  // Modals & Panels
  const [selectedIndicator, setSelectedIndicator] = React.useState<IndicatorItem | null>(null);
  const [editingTargetsIndicator, setEditingTargetsIndicator] =
    React.useState<IndicatorItem | null>(null);
  const [isImportWizardOpen, setIsImportWizardOpen] = React.useState(false);
  const [tempTargets, setTempTargets] = React.useState<Record<string, string>>({});

  // Modular custom hook for Indicators
  const { indicators: serverIndicators } = useIndicators({
    limit: 50,
  });

  const activeIndicators: IndicatorItem[] = React.useMemo(() => {
    if (serverIndicators && serverIndicators.length > 0) {
      return serverIndicators.map((ind) => ({
        id: ind.id,
        code: ind.code,
        name: ind.name,
        level: ind.level,
        unit: ind.unit,
        frequency: ind.frequency,
        method: ind.method,
        computeKey: ind.computeKey,
        baseline: ind.baseline ? String(ind.baseline) : null,
        baselineYear: ind.baselineYear,
        endTarget: ind.endTarget ? String(ind.endTarget) : null,
        endTargetNote: ind.endTargetNote,
        disaggregations: ind.disaggregations || [],
        currentValue: ind.endTarget ? String(ind.endTarget) : '—',
        status: 'on_track',
        targetsByYear: {},
      }));
    }
    return [];
  }, [serverIndicators]);

  const filteredIndicators = React.useMemo(() => {
    return activeIndicators.filter((item) => {
      if (levelFilter !== 'all' && item.level !== levelFilter) return false;
      if (methodFilter !== 'all' && item.method !== methodFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = item.code.toLowerCase().includes(q);
        const matchName = item.name.toLowerCase().includes(q);
        if (!matchCode && !matchName) return false;
      }
      return true;
    });
  }, [activeIndicators, levelFilter, methodFilter, searchQuery]);

  const pdoCount = React.useMemo(
    () => activeIndicators.filter((i) => i.level === 'pdo').length,
    [activeIndicators],
  );
  const intermediateCount = React.useMemo(
    () => activeIndicators.filter((i) => i.level === 'intermediate').length,
    [activeIndicators],
  );

  const handleOpenEditTargets = (indicator: IndicatorItem) => {
    setEditingTargetsIndicator(indicator);
    setTempTargets({ ...indicator.targetsByYear });
  };

  const handleSaveTargets = () => {
    if (!editingTargetsIndicator) return;
    if (selectedIndicator?.id === editingTargetsIndicator.id) {
      setSelectedIndicator({ ...selectedIndicator, targetsByYear: { ...tempTargets } });
    }
    setEditingTargetsIndicator(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in-50">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Target className="h-3 w-3 text-amber-700" /> Results Framework v2.0
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-bold text-slate-600">
              {currentScope.name || 'National & All Schemes'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Results Framework & Indicators
          </h2>
          <p className="text-xs text-slate-500">
            Project Development Objectives (PDOs) and Intermediate Results indicators with method
            attribution and target milestones.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setIsImportWizardOpen(true)}
            className="bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold gap-1.5 shadow-xs cursor-pointer"
          >
            <UploadCloud className="h-3.5 w-3.5" /> Import Targets
          </Button>
        </div>
      </div>

      {/* KPI Overview Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Total Indicators
          </span>
          <span className="text-xl font-black text-slate-900 mt-1 block">
            {activeIndicators.length} Active
          </span>
          <span className="text-[11px] text-teal-700 font-semibold mt-0.5 block">
            100% Seeded & Tracked
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            PDO Indicators
          </span>
          <span className="text-xl font-black text-amber-900 mt-1 block">
            {pdoCount} Key Objectives
          </span>
          <span className="text-[11px] text-amber-700 font-semibold mt-0.5 block">
            High-Level Project Goals
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Intermediate Indicators
          </span>
          <span className="text-xl font-black text-slate-900 mt-1 block">
            {intermediateCount} Metrics
          </span>
          <span className="text-[11px] text-slate-500 font-semibold mt-0.5 block">
            Component Milestones
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Automated Compute
          </span>
          <span className="text-xl font-black text-blue-900 mt-1 block">
            {activeIndicators.filter((i) => i.method === 'computed').length} Formulas
          </span>
          <span className="text-[11px] text-blue-700 font-semibold mt-0.5 block flex items-center gap-1">
            <Cpu className="h-3 w-3" /> Rollup from SLIS DB
          </span>
        </div>
      </div>

      {/* Tabs & Search & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        {/* Tabs for PDO / Intermediate / All */}
        <div className="flex items-center gap-1.5 border border-slate-200 p-1 rounded-xl bg-slate-50 text-xs font-bold">
          <button
            onClick={() => setLevelFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              levelFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/50'
            }`}
          >
            All Indicators ({activeIndicators.length})
          </button>
          <button
            onClick={() => setLevelFilter('pdo')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              levelFilter === 'pdo'
                ? 'bg-white text-amber-900 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/50'
            }`}
          >
            PDO Indicators ({pdoCount})
          </button>
          <button
            onClick={() => setLevelFilter('intermediate')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              levelFilter === 'intermediate'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/50'
            }`}
          >
            Intermediate ({intermediateCount})
          </button>
        </div>

        {/* Search & Method Select Dropdown */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-48 sm:w-60">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Filter by indicator code or title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-xs h-8 bg-slate-50/50"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <div className="w-36 sm:w-44">
              <Select value={methodFilter} onValueChange={(val: string) => setMethodFilter(val)}>
                <SelectTrigger
                  aria-label="Filter by calculation method"
                  className="h-8 min-h-[32px] w-full bg-slate-50 border-slate-200 text-xs font-semibold rounded-lg hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
                >
                  <SelectValue placeholder="All Methods" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl border-slate-200">
                  <SelectItem value="all" className="text-xs font-medium py-2">
                    All Methods
                  </SelectItem>
                  <SelectItem value="computed" className="text-xs font-medium py-2">
                    Computed (Auto)
                  </SelectItem>
                  <SelectItem value="manual" className="text-xs font-medium py-2">
                    Manual Entry
                  </SelectItem>
                  <SelectItem value="survey" className="text-xs font-medium py-2">
                    Survey Based
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Responsive Table of Indicators */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 w-16">Code</th>
                <th className="py-3 px-4">Indicator Name</th>
                <th className="py-3 px-4">Level</th>
                <th className="py-3 px-4">Unit & Freq</th>
                <th className="py-3 px-4">Method Badge</th>
                <th className="py-3 px-4">Baseline</th>
                <th className="py-3 px-4">End Target</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredIndicators.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                    <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px]">
                      {item.code}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 max-w-sm">
                    <div className="font-bold text-slate-900 leading-snug">{item.name}</div>
                    {item.computeKey && (
                      <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded mt-1 inline-block">
                        fn: {item.computeKey}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {item.level === 'pdo' ? (
                      <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-bold">
                        PDO
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-slate-600 border-slate-300 text-[10px] font-medium"
                      >
                        Intermediate
                      </Badge>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-800">{item.unit}</div>
                    <div className="text-[10px] text-slate-400 capitalize">{item.frequency}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    {item.method === 'computed' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                        <Cpu className="h-3 w-3" /> Computed
                      </span>
                    ) : item.method === 'manual' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <PenTool className="h-3 w-3" /> Manual
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                        <HelpCircle className="h-3 w-3" /> Survey
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-medium text-slate-600">
                    {item.baseline ? `${item.baseline} (${item.baselineYear})` : '—'}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                    {item.endTarget || '—'}
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedIndicator(item)}
                      className="text-xs font-semibold gap-1 text-slate-700"
                    >
                      <Eye className="h-3 w-3" /> View Detail
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenEditTargets(item)}
                      className="text-xs font-semibold gap-1 text-amber-900 border-amber-200 hover:bg-amber-50"
                    >
                      <Edit3 className="h-3 w-3" /> Edit Targets
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Indicator Detail Inspection Drawer / Dialog */}
      {selectedIndicator && (
        <Dialog
          open={!!selectedIndicator}
          onOpenChange={(open) => !open && setSelectedIndicator(null)}
        >
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full">
                  Indicator #{selectedIndicator.code}
                </span>
                <span className="text-xs uppercase font-bold text-slate-400">
                  {selectedIndicator.level} Indicator
                </span>
              </div>
              <DialogTitle className="text-lg font-black text-slate-900">
                {selectedIndicator.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              {/* Properties Grid */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Unit of Measurement
                  </span>
                  <span className="font-bold text-slate-900 mt-0.5 block">
                    {selectedIndicator.unit}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Reporting Frequency
                  </span>
                  <span className="font-bold text-slate-900 mt-0.5 block capitalize">
                    {selectedIndicator.frequency}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Calculation Method
                  </span>
                  <span className="font-bold text-slate-900 mt-0.5 block capitalize flex items-center gap-1">
                    {selectedIndicator.method === 'computed' ? (
                      <Cpu className="h-3 w-3 text-blue-600" />
                    ) : (
                      <PenTool className="h-3 w-3 text-amber-600" />
                    )}
                    {selectedIndicator.method}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Disaggregations
                  </span>
                  <span className="font-bold text-teal-800 mt-0.5 block capitalize">
                    {selectedIndicator.disaggregations.join(', ') || 'National / Scheme level'}
                  </span>
                </div>
              </div>

              {/* Baseline & Targets Overview */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5 text-amber-700" /> Targets by Milestone Year
                </span>
                <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  <div className="p-2.5 flex items-center justify-between bg-slate-50/50">
                    <span className="text-slate-500 font-medium">
                      Baseline ({selectedIndicator.baselineYear || 'Inception'})
                    </span>
                    <span className="font-mono font-bold text-slate-700">
                      {selectedIndicator.baseline || '0'} {selectedIndicator.unit}
                    </span>
                  </div>
                  {Object.entries(selectedIndicator.targetsByYear).map(([yr, targetVal]) => (
                    <div key={yr} className="p-2.5 flex items-center justify-between bg-white">
                      <span className="font-bold text-slate-800">Target Year {yr}</span>
                      <span className="font-mono font-black text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {targetVal} {selectedIndicator.unit}
                      </span>
                    </div>
                  ))}
                  <div className="p-2.5 flex items-center justify-between bg-amber-50/40">
                    <span className="font-bold text-amber-950">End Target Goal</span>
                    <span className="font-mono font-black text-amber-950 text-sm">
                      {selectedIndicator.endTarget || '—'} {selectedIndicator.unit}
                    </span>
                  </div>
                </div>
                {selectedIndicator.endTargetNote && (
                  <p className="text-[11px] text-slate-400 italic">
                    Note: {selectedIndicator.endTargetNote}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedIndicator(null)}
                className="text-xs font-bold"
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  handleOpenEditTargets(selectedIndicator);
                  setSelectedIndicator(null);
                }}
                className="bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold gap-1"
              >
                <Edit3 className="h-3 w-3" /> Edit Targets
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Target Editor Dialog */}
      {editingTargetsIndicator && (
        <Dialog
          open={!!editingTargetsIndicator}
          onOpenChange={(open) => !open && setEditingTargetsIndicator(null)}
        >
          <DialogContent className="max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 text-amber-700 text-xs font-bold mb-1">
                <Edit3 className="h-3.5 w-3.5" /> Edit Annual Targets
              </div>
              <DialogTitle className="text-base font-black text-slate-900">
                Target Editor: #{editingTargetsIndicator.code} {editingTargetsIndicator.unit}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pt-2 text-xs">
              <p className="text-slate-500">
                Adjust annual milestone projections for {editingTargetsIndicator.name}:
              </p>

              {['2024', '2025', '2026'].map((year) => (
                <div key={year} className="space-y-1">
                  <label className="font-bold text-slate-700">
                    Target for Year {year} ({editingTargetsIndicator.unit})
                  </label>
                  <Input
                    value={tempTargets[year] || ''}
                    onChange={(e) =>
                      setTempTargets((prev) => ({ ...prev, [year]: e.target.value }))
                    }
                    className="text-xs font-mono"
                    placeholder="e.g. 50000"
                  />
                </div>
              ))}
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingTargetsIndicator(null)}
                className="text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveTargets}
                className="bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold"
              >
                Save Milestone Targets
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Target Import Modal via ImportWizard */}
      {isImportWizardOpen && (
        <Dialog open={isImportWizardOpen} onOpenChange={setIsImportWizardOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <FileSpreadsheet className="h-4 w-4 text-amber-700" />
                <Badge
                  variant="outline"
                  className="border-amber-300 text-amber-800 bg-amber-50 text-[10px]"
                >
                  Bulk Spreadsheet Import
                </Badge>
              </div>
              <DialogTitle className="text-lg font-black text-slate-900">
                Import Results Framework Targets
              </DialogTitle>
            </DialogHeader>
            <div className="pt-2">
              <ImportWizard
                initialDatasetId="me_targets"
                onBatchCommitted={() => setIsImportWizardOpen(false)}
                onCancel={() => setIsImportWizardOpen(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
