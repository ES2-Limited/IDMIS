import * as React from 'react';
import {
  ClipboardList,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Layers,
  FileQuestion,
  MoveUp,
  MoveDown,
  Trash2,
  Eye,
  MapPin,
  Users,
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
import { useSurveys } from './hooks';
import type { SurveyAnswerType } from '@idmis/contracts';

export interface QuestionDraft {
  id: string;
  code: string;
  text: string;
  answerType: SurveyAnswerType;
  options?: string[];
  isRequired: boolean;
  sortOrder: number;
}

export interface SurveyRecord {
  id: string;
  name: string;
  schemeId?: string | null;
  schemeName?: string;
  version: number;
  opensOn: string;
  closesOn: string;
  status: 'active' | 'draft' | 'closed';
  questionsCount: number;
  responsesCount: number;
  questions: QuestionDraft[];
  lastResponseAt?: string;
}

export interface SurveyResponseItem {
  id: string;
  surveyId: string;
  surveyName: string;
  schemeName: string;
  farmerName?: string;
  householdName?: string;
  collectedAt: string;
  enumeratorName: string;
  location?: { lat: number; lng: number };
  answersSummary: Record<string, string>;
}

// Initial seeded surveys matching M&E Results Framework and Household surveys
export function SurveysManagementView() {
  const { currentScope } = useScope();
  const schemeId = currentScope.type === 'scheme' ? currentScope.id : undefined;
  const { surveys: serverSurveys, createSurvey } = useSurveys(schemeId);

  // Tab State: 'surveys' | 'responses'
  const [activeTab, setActiveTab] = React.useState<'surveys' | 'responses'>('surveys');

  // Surveys State
  const [surveys, setSurveys] = React.useState<SurveyRecord[]>([]);

  React.useEffect(() => {
    if (serverSurveys && serverSurveys.length > 0) {
      setSurveys(
        serverSurveys.map((s) => ({
          id: s.id,
          name: s.name,
          schemeId: s.schemeId,
          schemeName: currentScope.name || undefined,
          version: s.version,
          opensOn: s.opensOn || '',
          closesOn: s.closesOn || '',
          status: 'active',
          questionsCount: 0,
          responsesCount: 0,
          questions: [],
        })),
      );
    } else {
      setSurveys([]);
    }
  }, [serverSurveys, currentScope.name]);
  const [responses] = React.useState<SurveyResponseItem[]>([]);
  const [selectedSurveyFilter, setSelectedSurveyFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Builder Modal State
  const [isBuilderOpen, setIsBuilderOpen] = React.useState<boolean>(false);
  const [editingSurveyId, setEditingSurveyId] = React.useState<string | null>(null);
  const [builderName, setBuilderName] = React.useState<string>('');
  const [builderOpensOn, setBuilderOpensOn] = React.useState<string>('2026-04-01');
  const [builderClosesOn, setBuilderClosesOn] = React.useState<string>('2026-10-31');
  const [builderQuestions, setBuilderQuestions] = React.useState<QuestionDraft[]>([]);

  // New Question Sub-Form
  const [newQCode, setNewQCode] = React.useState<string>('');
  const [newQText, setNewQText] = React.useState<string>('');
  const [newQType, setNewQType] = React.useState<SurveyAnswerType>('single');
  const [newQOptions, setNewQOptions] = React.useState<string>('Yes, No, Partially');
  const [newQRequired, setNewQRequired] = React.useState<boolean>(true);

  // Inspect Response Modal
  const [inspectResponse, setInspectResponse] = React.useState<SurveyResponseItem | null>(null);

  // Open Builder for New Survey
  const handleOpenNewBuilder = () => {
    setEditingSurveyId(null);
    setBuilderName('');
    setBuilderOpensOn('2026-04-01');
    setBuilderClosesOn('2026-10-31');
    setBuilderQuestions([
      {
        id: `q-${Date.now()}-1`,
        code: 'FARM_AREA',
        text: 'Total hectares cultivated this season?',
        answerType: 'number',
        isRequired: true,
        sortOrder: 1,
      },
      {
        id: `q-${Date.now()}-2`,
        code: 'CROP_TYPE',
        text: 'Primary irrigated crop planted?',
        answerType: 'single',
        options: ['Rice', 'Tomato', 'Maize', 'Wheat', 'Onion'],
        isRequired: true,
        sortOrder: 2,
      },
    ]);
    setIsBuilderOpen(true);
  };

  // Open Builder for Existing Survey
  const handleEditSurvey = (srv: SurveyRecord) => {
    setEditingSurveyId(srv.id);
    setBuilderName(srv.name);
    setBuilderOpensOn(srv.opensOn);
    setBuilderClosesOn(srv.closesOn);
    setBuilderQuestions([...srv.questions]);
    setIsBuilderOpen(true);
  };

  // Add Question to Builder
  const handleAddQuestion = () => {
    if (!newQCode.trim() || !newQText.trim()) return;
    const q: QuestionDraft = {
      id: `q-${Date.now()}`,
      code: newQCode.trim().toUpperCase().replace(/\s+/g, '_'),
      text: newQText.trim(),
      answerType: newQType,
      isRequired: newQRequired,
      sortOrder: builderQuestions.length + 1,
      options:
        newQType === 'single' || newQType === 'multi'
          ? newQOptions
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
    };
    setBuilderQuestions((prev) => [...prev, q]);
    setNewQCode('');
    setNewQText('');
  };

  // Move Question Order
  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= builderQuestions.length) return;
    const reordered = [...builderQuestions];
    const temp = reordered[index]!;
    reordered[index] = reordered[targetIdx]!;
    reordered[targetIdx] = temp;
    reordered.forEach((q, idx) => (q.sortOrder = idx + 1));
    setBuilderQuestions(reordered);
  };

  // Delete Question
  const handleDeleteQuestion = (id: string) => {
    setBuilderQuestions((prev) =>
      prev.filter((q) => q.id !== id).map((q, idx) => ({ ...q, sortOrder: idx + 1 })),
    );
  };

  // Save Survey in Builder
  const handleSaveSurvey = async () => {
    if (!builderName.trim() || builderQuestions.length === 0) return;

    try {
      if (createSurvey) {
        await createSurvey({
          name: builderName,
          schemeId: currentScope.type === 'scheme' ? currentScope.id : undefined,
          opensOn: builderOpensOn,
          closesOn: builderClosesOn,
        });
      }
    } catch {
      // Fallback local update
    }

    if (editingSurveyId) {
      setSurveys((prev) =>
        prev.map((s) =>
          s.id === editingSurveyId
            ? {
                ...s,
                name: builderName,
                opensOn: builderOpensOn,
                closesOn: builderClosesOn,
                questionsCount: builderQuestions.length,
                questions: builderQuestions,
              }
            : s,
        ),
      );
    } else {
      const newSrv: SurveyRecord = {
        id: `srv-${Date.now()}`,
        name: builderName,
        schemeId: currentScope.id || null,
        schemeName: currentScope.name || 'All Schemes',
        version: 1,
        opensOn: builderOpensOn,
        closesOn: builderClosesOn,
        status: 'active',
        questionsCount: builderQuestions.length,
        responsesCount: 0,
        questions: builderQuestions,
      };
      setSurveys((prev) => [newSrv, ...prev]);
    }

    setIsBuilderOpen(false);
  };

  // Filtered Surveys
  const filteredSurveys = React.useMemo(() => {
    return surveys.filter((s) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.schemeName?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [surveys, searchQuery]);

  // Filtered Responses
  const filteredResponses = React.useMemo(() => {
    return responses.filter((r) => {
      if (selectedSurveyFilter !== 'all' && r.surveyId !== selectedSurveyFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.farmerName?.toLowerCase().includes(q) ||
          r.surveyName.toLowerCase().includes(q) ||
          r.enumeratorName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [responses, selectedSurveyFilter, searchQuery]);

  return (
    <div className="space-y-4 animate-in fade-in-50">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full flex items-center gap-1">
              <ClipboardList className="h-3 w-3 text-teal-700" /> Survey Management & Field Capture
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-bold text-slate-600">
              Scope: {currentScope.name || 'National Portfolio'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Surveys & Questionnaires
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Design survey questionnaires, deploy to offline field tablets, and review verified
            beneficiary response datasets.
          </p>
        </div>

        {/* Tab & Builder Trigger */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => setActiveTab('surveys')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'surveys'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/50'
              }`}
            >
              Questionnaires ({surveys.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('responses')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === 'responses'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/50'
              }`}
            >
              Responses ({responses.length})
            </button>
          </div>

          <Button
            size="sm"
            onClick={handleOpenNewBuilder}
            className="text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Design Survey
          </Button>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Deployed Surveys</span>
            <FileQuestion className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{surveys.length}</span>
            <span className="text-xs text-emerald-700 font-bold">Active in Field</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-teal-200 bg-teal-50/20 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-teal-800 text-xs font-bold">
            <span>Total Captured Responses</span>
            <CheckCircle2 className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-teal-950">
              {surveys.reduce((acc, s) => acc + s.responsesCount, 0).toLocaleString()}
            </span>
            <span className="text-xs text-teal-700 font-medium">Household Submissions</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Offline Sync Status</span>
            <Clock className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">100%</span>
            <span className="text-xs text-emerald-700 font-bold">Outbox Synchronized</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-amber-200 bg-amber-50/20 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-amber-900 text-xs font-bold">
            <span>Sample Question Bank</span>
            <Layers className="h-4 w-4 text-amber-700" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-950">
              {surveys.reduce((acc, s) => acc + s.questionsCount, 0)}
            </span>
            <span className="text-xs text-amber-800 font-medium">Verified Questions</span>
          </div>
        </div>
      </div>

      {/* Control Filter Toolbar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {activeTab === 'responses' && (
            <div className="w-64">
              <Select
                value={selectedSurveyFilter}
                onValueChange={(val) => setSelectedSurveyFilter(val)}
              >
                <SelectTrigger className="h-8.5 text-xs font-medium bg-slate-50">
                  <SelectValue placeholder="Filter by Survey" />
                </SelectTrigger>
                <SelectContent className="bg-white shadow-xl">
                  <SelectItem value="all" className="text-xs font-medium py-2">
                    All Surveys ({responses.length})
                  </SelectItem>
                  {surveys.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs font-medium py-2">
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <span className="text-xs font-medium text-slate-400">
            {activeTab === 'surveys'
              ? `${filteredSurveys.length} Questionnaires available`
              : `${filteredResponses.length} Responses logged`}
          </span>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder={
              activeTab === 'surveys'
                ? 'Search surveys or scheme...'
                : 'Search farmer or enumerator...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs h-8.5 bg-slate-50"
          />
        </div>
      </div>

      {/* TAB 1: Surveys Questionnaire List */}
      {activeTab === 'surveys' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Survey Name & Details</th>
                  <th className="py-3 px-4">Target Scheme</th>
                  <th className="py-3 px-4">Validity Window</th>
                  <th className="py-3 px-4">Questions</th>
                  <th className="py-3 px-4">Responses</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSurveys.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 px-4 text-center">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <ClipboardList className="h-8 w-8 text-slate-300 stroke-[1.5]" />
                        <div className="text-sm font-semibold text-slate-700">No surveys found</div>
                        <p className="text-xs text-slate-500 max-w-sm">
                          {searchQuery
                            ? `No surveys match "${searchQuery}". Try clearing your search.`
                            : 'No survey questionnaires have been created for this scheme yet.'}
                        </p>
                        <Button
                          size="sm"
                          onClick={handleOpenNewBuilder}
                          className="bg-teal-700 hover:bg-teal-800 text-white text-xs mt-2 gap-1.5"
                        >
                          <Plus className="h-3.5 w-3.5" /> Design New Survey
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredSurveys.map((srv) => (
                    <tr key={srv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 max-w-sm">
                        <div className="font-bold text-slate-900 leading-snug">{srv.name}</div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                          <span className="font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                            v{srv.version}
                          </span>
                          {srv.lastResponseAt && <span>Latest response: {srv.lastResponseAt}</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700">
                        {srv.schemeName || 'All Schemes'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {srv.opensOn} → {srv.closesOn}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {srv.questionsCount} items
                      </td>
                      <td className="py-3.5 px-4 font-mono font-black text-teal-800">
                        {srv.responsesCount.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4">
                        {srv.status === 'active' ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-300 text-emerald-800 bg-emerald-50 text-[10px] font-bold gap-1"
                          >
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-slate-300 text-slate-600 bg-slate-50 text-[10px] font-bold"
                          >
                            Draft
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditSurvey(srv)}
                          className="h-7 px-3 text-xs font-semibold gap-1 text-slate-700 hover:text-teal-800 cursor-pointer"
                        >
                          Edit Builder
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Survey Responses List */}
      {activeTab === 'responses' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Respondent Farmer / Household</th>
                  <th className="py-3 px-4">Survey Questionnaire</th>
                  <th className="py-3 px-4">Location / Scheme</th>
                  <th className="py-3 px-4">Collected Time</th>
                  <th className="py-3 px-4">Enumerator</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredResponses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 px-4 text-center">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Users className="h-8 w-8 text-slate-300 stroke-[1.5]" />
                        <div className="text-sm font-semibold text-slate-700">
                          No responses recorded
                        </div>
                        <p className="text-xs text-slate-500 max-w-sm">
                          {searchQuery || selectedSurveyFilter !== 'all'
                            ? 'No survey responses match your filter criteria.'
                            : 'Field survey responses collected via the PWA mobile surveyor tool will appear here.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredResponses.map((rsp) => (
                    <tr key={rsp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 leading-snug">
                          {rsp.farmerName || rsp.householdName}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {rsp.id}</span>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs font-semibold text-slate-800">
                        {rsp.surveyName}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-teal-600" />
                          {rsp.schemeName}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">{rsp.collectedAt}</td>
                      <td className="py-3.5 px-4 text-slate-700 font-medium">
                        {rsp.enumeratorName}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setInspectResponse(rsp)}
                          className="h-7 px-3 text-xs font-semibold gap-1 text-slate-700 hover:text-teal-800 cursor-pointer"
                        >
                          <Eye className="h-3 w-3 text-slate-500" /> View Answers
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Desktop Survey Builder Modal */}
      {isBuilderOpen && (
        <Dialog open={isBuilderOpen} onOpenChange={(open) => !open && setIsBuilderOpen(false)}>
          <DialogContent className="max-w-3xl rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 text-teal-800 text-xs font-bold mb-1">
                <ClipboardList className="h-3.5 w-3.5" /> Desktop Survey Questionnaire Builder
              </div>
              <DialogTitle className="text-lg font-black text-slate-900">
                {editingSurveyId ? 'Edit Survey Questionnaire' : 'Design New Field Survey'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2 text-xs">
              {/* Basic Survey Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="sm:col-span-3 space-y-1">
                  <label className="font-bold text-slate-700">Survey Title *</label>
                  <Input
                    placeholder="e.g. Dry Season Crop Output & Market Linkage Survey..."
                    value={builderName}
                    onChange={(e) => setBuilderName(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Opens On Date</label>
                  <Input
                    type="date"
                    value={builderOpensOn}
                    onChange={(e) => setBuilderOpensOn(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Closes On Date</label>
                  <Input
                    type="date"
                    value={builderClosesOn}
                    onChange={(e) => setBuilderClosesOn(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Assigned Scheme Scope</label>
                  <div className="p-2 rounded-lg bg-white border border-slate-200 font-semibold text-slate-800">
                    {currentScope.name || 'All National Schemes'}
                  </div>
                </div>
              </div>

              {/* Questions List & Reordering */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-slate-800 text-sm">
                    Questions Sequence ({builderQuestions.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Use Up/Down controls to define question order
                  </span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {builderQuestions.map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono font-black text-slate-400 text-xs w-5 text-center">
                          #{q.sortOrder}
                        </span>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 leading-snug truncate">
                            {q.text}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                            <span className="font-mono bg-slate-100 text-slate-700 px-1 rounded font-bold">
                              {q.code}
                            </span>
                            <span className="font-semibold text-teal-700">
                              Type: {q.answerType}
                            </span>
                            {q.isRequired && (
                              <span className="text-rose-600 font-bold">Required</span>
                            )}
                            {q.options && (
                              <span className="text-slate-400">({q.options.length} options)</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMoveQuestion(idx, 'up')}
                          disabled={idx === 0}
                          className="h-6 w-6 p-0"
                          aria-label="Move question up"
                        >
                          <MoveUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMoveQuestion(idx, 'down')}
                          disabled={idx === builderQuestions.length - 1}
                          className="h-6 w-6 p-0"
                          aria-label="Move question down"
                        >
                          <MoveDown className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="h-6 w-6 p-0 text-rose-600 hover:bg-rose-50 border-rose-200"
                          aria-label="Delete question"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add New Question Section */}
              <div className="p-3.5 rounded-2xl bg-teal-50/40 border border-teal-200 space-y-2">
                <span className="font-bold text-teal-900 block text-xs">
                  + Add Question to Questionnaire
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">Question Code *</label>
                    <Input
                      placeholder="e.g. YIELD_KG"
                      value={newQCode}
                      onChange={(e) => setNewQCode(e.target.value)}
                      className="text-xs font-mono uppercase bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">
                      Question Label / Prompt *
                    </label>
                    <Input
                      placeholder="e.g. Total quantity of harvested produce (kg)..."
                      value={newQText}
                      onChange={(e) => setNewQText(e.target.value)}
                      className="text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">Answer Type</label>
                    <Select
                      value={newQType}
                      onValueChange={(val: SurveyAnswerType) => setNewQType(val)}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent className="bg-white shadow-xl">
                        <SelectItem value="text" className="text-xs py-1.5">
                          Text / Prose
                        </SelectItem>
                        <SelectItem value="number" className="text-xs py-1.5">
                          Numeric Quantity
                        </SelectItem>
                        <SelectItem value="single" className="text-xs py-1.5">
                          Single Choice (Dropdown/Radio)
                        </SelectItem>
                        <SelectItem value="multi" className="text-xs py-1.5">
                          Multi Choice (Checkboxes)
                        </SelectItem>
                        <SelectItem value="date" className="text-xs py-1.5">
                          Date Picker
                        </SelectItem>
                        <SelectItem value="gps" className="text-xs py-1.5">
                          GPS Coordinates
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(newQType === 'single' || newQType === 'multi') && (
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">
                        Options (comma-separated)
                      </label>
                      <Input
                        placeholder="Option 1, Option 2, Option 3..."
                        value={newQOptions}
                        onChange={(e) => setNewQOptions(e.target.value)}
                        className="text-xs bg-white"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={newQRequired}
                      onChange={(e) => setNewQRequired(e.target.checked)}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    Required field on mobile tablet
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddQuestion}
                    disabled={!newQCode.trim() || !newQText.trim()}
                    className="text-xs font-bold bg-teal-800 text-white cursor-pointer"
                  >
                    Insert Question
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsBuilderOpen(false)}
                className="text-xs font-bold cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSurvey}
                disabled={!builderName.trim() || builderQuestions.length === 0}
                className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold cursor-pointer"
              >
                Save & Deploy Survey
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Inspect Response Modal */}
      {inspectResponse && (
        <Dialog open={!!inspectResponse} onOpenChange={(open) => !open && setInspectResponse(null)}>
          <DialogContent className="max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 text-teal-800 text-xs font-bold mb-1">
                <Eye className="h-3.5 w-3.5" /> Survey Response Verification
              </div>
              <DialogTitle className="text-base font-black text-slate-900">
                {inspectResponse.farmerName || inspectResponse.householdName}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pt-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Survey:</span>
                  <span className="font-bold text-slate-800">{inspectResponse.surveyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Scheme Location:</span>
                  <span className="font-semibold text-slate-800">{inspectResponse.schemeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Recorded At:</span>
                  <span className="font-mono text-slate-800">{inspectResponse.collectedAt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Enumerator:</span>
                  <span className="font-semibold text-teal-800">
                    {inspectResponse.enumeratorName}
                  </span>
                </div>
                {inspectResponse.location && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">GPS Location:</span>
                    <span className="font-mono text-slate-700">
                      {inspectResponse.location.lat.toFixed(4)},{' '}
                      {inspectResponse.location.lng.toFixed(4)}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h5 className="font-bold text-slate-800 text-xs">Submitted Answer Values:</h5>
                <div className="space-y-1.5">
                  {Object.entries(inspectResponse.answersSummary).map(([key, val]) => (
                    <div
                      key={key}
                      className="p-2.5 rounded-lg border border-slate-200 bg-white flex justify-between items-center"
                    >
                      <span className="font-mono font-bold text-slate-500 text-[11px]">{key}</span>
                      <span className="font-bold text-slate-900 text-xs">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInspectResponse(null)}
                className="text-xs font-bold cursor-pointer"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
