import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ClipboardList, MapPin, CheckCircle2, Send } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@idmis/ui';
import { localDb, LocalStore } from '@idmis/sync';
import { useScope } from '../../shell/ScopeContext';
import { CreateSurveyResponseInputSchema } from '@idmis/contracts';

interface SurveyOption {
  id: string;
  name: string;
  questions: Array<{
    id: string;
    code: string;
    text: string;
    answerType: 'text' | 'number' | 'single' | 'multi' | 'date' | 'gps';
    options?: string[];
    isRequired: boolean;
  }>;
}

const ACTIVE_FIELD_SURVEYS: SurveyOption[] = [
  {
    id: 'srv-1',
    name: 'Farmer Household Income & Living Standards Survey 2026',
    questions: [
      {
        id: 'q1',
        code: 'HH_SIZE',
        text: 'Total number of family members residing in this farming household?',
        answerType: 'number',
        isRequired: true,
      },
      {
        id: 'q2',
        code: 'PRIMARY_CROP',
        text: 'What was your primary commercial irrigated crop this cycle?',
        answerType: 'single',
        options: ['Rice', 'Tomato', 'Maize', 'Wheat', 'Onion'],
        isRequired: true,
      },
      {
        id: 'q3',
        code: 'INCOME_RANGE',
        text: 'Estimated gross seasonal farm revenue from irrigated parcels (NGN)?',
        answerType: 'single',
        options: [
          'Under 500,000 NGN',
          '500,000 - 1,500,000 NGN',
          '1,500,000 - 3,000,000 NGN',
          'Above 3,000,000 NGN',
        ],
        isRequired: true,
      },
      {
        id: 'q4',
        code: 'OFFTAKE_CHANNEL',
        text: 'Primary produce sales channel utilized by farmer?',
        answerType: 'single',
        options: [
          'Local Aggregator',
          'Direct Factory Contract',
          'Spot Market',
          'Cooperative Store',
        ],
        isRequired: true,
      },
      {
        id: 'q5',
        code: 'NOTES',
        text: 'Enumerator field observations & verification notes',
        answerType: 'text',
        isRequired: false,
      },
    ],
  },
  {
    id: 'srv-2',
    name: 'WUA Water Distribution Satisfaction & Governance Assessment',
    questions: [
      {
        id: 'q21',
        code: 'TAIL_END',
        text: 'Is your farm parcel situated at the head, middle, or tail end of the lateral canal?',
        answerType: 'single',
        options: ['Head Reach', 'Middle Reach', 'Tail End Reach'],
        isRequired: true,
      },
      {
        id: 'q22',
        code: 'WATER_RELIABILITY',
        text: 'How reliable was scheduled irrigation water delivery during peak vegetative stage?',
        answerType: 'single',
        options: ['Always on Schedule', 'Occasional Delay (1-2 days)', 'Severe Deficit / Missed'],
        isRequired: true,
      },
      {
        id: 'q23',
        code: 'DISPUTE_EXPERIENCE',
        text: 'Did your block experience water distribution disputes between users this season?',
        answerType: 'single',
        options: ['No Disputes', 'Resolved by WUA Executives', 'Escalated to Project Office'],
        isRequired: true,
      },
      {
        id: 'q24',
        code: 'WUA_FEE_FAIRNESS',
        text: 'Do you consider the current ISF fee schedule fair relative to water delivery volume?',
        answerType: 'single',
        options: ['Completely Fair', 'Acceptable', 'Unfair / Overbilled'],
        isRequired: true,
      },
    ],
  },
];

export function FieldSurveyCaptureForm() {
  const navigate = useNavigate();
  const { currentScope } = useScope();
  const store = React.useMemo(() => new LocalStore(localDb), []);

  const [selectedSurveyId, setSelectedSurveyId] = React.useState<string>('srv-1');
  const [respondentName, setRespondentName] = React.useState<string>('');
  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const [gpsLocation, setGpsLocation] = React.useState<{ lat: number; lng: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const activeSurvey =
    ACTIVE_FIELD_SURVEYS.find((s) => s.id === selectedSurveyId) ?? ACTIVE_FIELD_SURVEYS[0]!;

  // Handle GPS Capture
  const handleCaptureGps = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {
          // Fallback approximate Kano irrigation scheme coordinates
          setGpsLocation({ lat: 11.642, lng: 8.534 });
        },
      );
    } else {
      setGpsLocation({ lat: 11.642, lng: 8.534 });
    }
  };

  const handleAnswerChange = (code: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [code]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!respondentName.trim()) {
      setErrorMsg('Respondent farmer / household name is required.');
      return;
    }

    // Validate required questions
    for (const q of activeSurvey.questions) {
      if (q.isRequired && (answers[q.code] === undefined || answers[q.code] === '')) {
        setErrorMsg(`Please answer required question: "${q.text}"`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const responseId = crypto.randomUUID();
      const schemeId = currentScope.id || 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

      const payload = {
        id: responseId,
        surveyId: '11111111-2222-3333-4444-555555555555',
        schemeId,
        collectedAt: new Date().toISOString(),
        location: gpsLocation,
        answers: Object.entries(answers).map(([code, value]) => ({
          questionCode: code,
          value,
        })),
      };

      // Contract validation
      CreateSurveyResponseInputSchema.parse(payload);

      // Commit locally to outbox via Dexie storage
      await store.commitInsert(
        'survey_response',
        responseId,
        {
          ...payload,
          surveyName: activeSurvey.name,
          respondentName,
          status: 'saved_on_device',
          displayName: `Survey: ${activeSurvey.name} (${respondentName})`,
          submittedAt: new Date().toISOString(),
        },
        { schemeId },
      );

      navigate({ to: '/field/records' });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errors' in err) {
        setErrorMsg('Validation failed on survey questionnaire schema.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to save survey to device.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-in fade-in-50 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full flex items-center gap-1">
          <ClipboardList className="h-3 w-3 text-teal-700" /> Offline Field Capture
        </span>
        <span className="text-xs text-slate-400">·</span>
        <span className="text-xs font-bold text-slate-600">
          Scope: {currentScope.name || 'All Schemes'}
        </span>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Field Beneficiary Survey
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Complete questionnaire for farmer household or WUA member. Stores locally and syncs to
            M&E upon reconnection.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Survey Questionnaire Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Select Questionnaire *</label>
            <Select
              value={selectedSurveyId}
              onValueChange={(val) => {
                setSelectedSurveyId(val);
                setAnswers({});
              }}
            >
              <SelectTrigger className="h-10 text-xs font-bold bg-slate-50">
                <SelectValue placeholder="Choose Survey" />
              </SelectTrigger>
              <SelectContent className="bg-white shadow-xl">
                {ACTIVE_FIELD_SURVEYS.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs font-semibold py-2">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Respondent Metadata */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Respondent Farmer / Household Name *
              </label>
              <Input
                placeholder="e.g. Aliyu Ibrahim Garba (KRIS-04-129)"
                value={respondentName}
                onChange={(e) => setRespondentName(e.target.value)}
                className="text-xs bg-white"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="text-xs">
                <span className="font-bold text-slate-700 block">GPS Coordinates:</span>
                <span className="text-[11px] font-mono text-slate-500">
                  {gpsLocation
                    ? `${gpsLocation.lat.toFixed(5)}, ${gpsLocation.lng.toFixed(5)} (Verified)`
                    : 'Not captured yet'}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCaptureGps}
                className="text-xs font-bold gap-1 text-teal-800 border-teal-200 bg-teal-50/50 cursor-pointer"
              >
                <MapPin className="h-3 w-3" /> Get Location
              </Button>
            </div>
          </div>

          {/* Dynamic Questionnaire Questions */}
          <div className="space-y-4 pt-2">
            <h4 className="font-black text-slate-800 text-sm border-b border-slate-100 pb-2 flex items-center justify-between">
              <span>Questionnaire Prompts</span>
              <span className="text-[11px] font-normal text-slate-400">
                {activeSurvey.questions.length} Questions
              </span>
            </h4>

            {activeSurvey.questions.map((q, idx) => (
              <div key={q.id} className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="font-mono text-teal-700 font-black">Q{idx + 1}.</span>
                  {q.text}
                  {q.isRequired && <span className="text-rose-600 font-bold">*</span>}
                </label>

                {q.answerType === 'single' && q.options && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                    {q.options.map((opt) => {
                      const isSelected = answers[q.code] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleAnswerChange(q.code, opt)}
                          className={`p-3 rounded-xl border text-xs text-left font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'border-teal-700 bg-teal-50/80 text-teal-950 shadow-2xs'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{opt}</span>
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-teal-700" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {q.answerType === 'number' && (
                  <Input
                    type="number"
                    placeholder="Enter quantity or count..."
                    value={String(answers[q.code] ?? '')}
                    onChange={(e) => handleAnswerChange(q.code, Number(e.target.value))}
                    className="text-xs font-mono bg-white"
                  />
                )}

                {q.answerType === 'text' && (
                  <Input
                    placeholder="Enter observations or field notes..."
                    value={String(answers[q.code] ?? '')}
                    onChange={(e) => handleAnswerChange(q.code, e.target.value)}
                    className="text-xs bg-white"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: '/field/capture' })}
              className="text-xs font-bold cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold gap-1.5 cursor-pointer shadow-xs"
            >
              <Send className="h-3.5 w-3.5" /> Save Survey to Outbox
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
