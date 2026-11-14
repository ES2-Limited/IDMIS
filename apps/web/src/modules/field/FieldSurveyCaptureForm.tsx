import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CheckCircle2, Send, Wifi, WifiOff } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Badge,
  useToast,
} from '@idmis/ui';
import { localDb, LocalStore, generateUuidV7 } from '@idmis/sync';
import { useScope } from '../../shell/ScopeContext';
import {
  CreateSurveyResponseInputSchema,
  type CreateSurveyResponseInput,
  type CreateSurveyAnswerInput,
} from '@idmis/contracts';
import { getApiClient } from '@idmis/api-client';
import { useEffectiveSchemeId } from '../core/hooks';
import { useSurveys, useSurvey } from '../me/hooks';

function extractQuestionChoices(options: unknown): string[] {
  if (!options) return [];
  if (Array.isArray(options)) return options.map(String);
  if (typeof options === 'object') {
    const rec = options as Record<string, unknown>;
    if (Array.isArray(rec.choices)) return rec.choices.map(String);
    if (Array.isArray(rec.options)) return rec.options.map(String);
  }
  return [];
}

export function FieldSurveyCaptureForm() {
  const navigate = useNavigate();
  const { currentScope } = useScope();
  const { success, warning, error: toastError } = useToast();
  const store = React.useMemo(() => new LocalStore(localDb), []);

  const [isOnline, setIsOnline] = React.useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Live Scheme Resolution
  const { schemeId, schemeName, schemes, setSchemeId } = useEffectiveSchemeId(currentScope.id);

  // Live Surveys from DB
  const { surveys = [], isLoading: loadingSurveys } = useSurveys();

  const [selectedSurveyId, setSelectedSurveyId] = React.useState<string>('');
  const [respondentType, setRespondentType] = React.useState<'farmer' | 'wua' | 'community'>(
    'farmer',
  );
  const [respondentName, setRespondentName] = React.useState('Mallam Bello Kura');
  const [village, setVillage] = React.useState('Dan Hassan');
  const [gpsCoordinates, setGpsCoordinates] = React.useState('11.7584° N, 8.4289° E');
  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [successId, setSuccessId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (surveys.length > 0 && !selectedSurveyId) {
      setSelectedSurveyId(surveys[0]!.id);
    }
  }, [surveys, selectedSurveyId]);

  const activeSurvey = surveys.find((s) => s.id === selectedSurveyId) ?? surveys[0];

  // Dynamic survey questions from API
  const { questions = [], isLoading: loadingQuestions } = useSurvey(selectedSurveyId);

  const sortedQuestions = React.useMemo(() => {
    return [...questions].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [questions]);

  // Pre-fill default values when questions change if not already set
  React.useEffect(() => {
    if (sortedQuestions.length > 0) {
      setAnswers((prev) => {
        const next = { ...prev };
        for (const q of sortedQuestions) {
          if (next[q.id] === undefined) {
            const choices = extractQuestionChoices(q.options);
            if (q.answerType === 'single' && choices.length > 0) {
              next[q.id] = choices[0];
            } else if (q.answerType === 'number') {
              next[q.id] = '1';
            } else {
              next[q.id] = '';
            }
          }
        }
        return next;
      });
    }
  }, [sortedQuestions]);

  const handleAnswerChange = (questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSurveyId) {
      toastError('Survey Required', 'Please select an active survey instrument.');
      return;
    }

    if (sortedQuestions.length === 0) {
      toastError(
        'Empty Survey Template',
        'This survey instrument has no questions configured yet. Please choose another survey.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const answersArray: CreateSurveyAnswerInput[] = [];

      for (const q of sortedQuestions) {
        const rawVal = answers[q.id];
        const isMissing =
          rawVal === undefined ||
          rawVal === null ||
          (typeof rawVal === 'string' && rawVal.trim() === '') ||
          (Array.isArray(rawVal) && rawVal.length === 0);

        if (q.isRequired && isMissing) {
          toastError('Required Question', `Please answer question: "${q.text}"`);
          setIsSubmitting(false);
          return;
        }

        if (isMissing) continue;

        let formattedVal: unknown = rawVal;
        if (q.answerType === 'number') {
          const parsed = Number(rawVal);
          if (isNaN(parsed)) {
            toastError('Invalid Number', `Question "${q.text}" must be a valid number.`);
            setIsSubmitting(false);
            return;
          }
          formattedVal = parsed;
        } else if (q.answerType === 'gps') {
          if (typeof rawVal === 'string') {
            const parts = rawVal.split(',').map((s) => parseFloat(s.trim()));
            if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              // Service expects [lon, lat]
              formattedVal = [parts[1], parts[0]];
            }
          }
        }

        answersArray.push({
          questionId: q.id,
          questionCode: q.code,
          value: formattedVal,
        });
      }

      const payload: CreateSurveyResponseInput = {
        surveyId: selectedSurveyId,
        schemeId,
        answers: answersArray,
        collectedAt: new Date().toISOString(),
      };

      CreateSurveyResponseInputSchema.parse(payload);

      let syncedOnline = false;

      // Online attempt first
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const client = getApiClient();
          await client.submitSurveyResponse(payload);
          syncedOnline = true;
        } catch (serverErr) {
          console.warn(
            'Direct survey response submission failed; falling back to offline outbox:',
            serverErr,
          );
        }
      }

      const responseId = generateUuidV7();

      if (syncedOnline) {
        // Cache cleanly in local storage (zero pending outbox ops)
        await store.cacheCleanRecord(
          'survey_response',
          responseId,
          {
            ...payload,
            respondentType,
            respondentName,
            village,
            gpsCoordinates,
            status: 'synced',
            surveyName: activeSurvey?.name || 'Survey',
          },
          {
            schemeId,
          },
        );
      } else {
        // Offline commit to Dexie outbox
        await store.commitInsert(
          'survey_response',
          responseId,
          {
            ...payload,
            respondentType,
            respondentName,
            village,
            gpsCoordinates,
            status: 'saved_on_device',
            surveyName: activeSurvey?.name || 'Survey',
          },
          {
            schemeId,
          },
        );
      }

      setSuccessId(responseId);
      if (syncedOnline) {
        success('Survey Synced', 'Survey questionnaire response uploaded directly to M&E server.');
      } else {
        warning(
          'Saved Offline',
          'Survey response saved to local outbox. Will sync when reconnected.',
        );
      }
    } catch (err) {
      console.error('Failed to submit survey:', err);
      toastError('Submission Failed', String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successId) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center max-w-lg mx-auto space-y-4">
        <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">
          {isOnline ? 'Survey Synced to M&E Server' : 'Survey Questionnaire Saved Offline'}
        </h2>
        <p className="text-xs text-slate-500">
          The survey response for <span className="font-bold">{respondentName}</span> has been{' '}
          {isOnline ? 'recorded on the TRIMING server' : 'queued in your device offline outbox'}.
        </p>

        <div className="pt-2 flex flex-col gap-2">
          <Button
            className="w-full bg-teal-700 hover:bg-teal-800 text-white min-h-[44px]"
            onClick={() => {
              setSuccessId(null);
            }}
          >
            Conduct Another Survey
          </Button>
          <Button
            variant="outline"
            className="w-full min-h-[44px]"
            onClick={() => navigate({ to: '/field/records' })}
          >
            View Field Records
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">M&E Beneficiary Survey</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Conduct household, agronomic, or WUA governance field interviews.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-800 border-emerald-300 text-xs flex items-center gap-1"
            >
              <Wifi className="h-3 w-3" /> Online
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-800 border-amber-300 text-xs flex items-center gap-1"
            >
              <WifiOff className="h-3 w-3" /> Offline Outbox Active
            </Badge>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Survey instrument picker */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
            1. Survey Instrument & Scheme
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Scheme Context
              </label>
              {schemes.length > 1 ? (
                <Select value={schemeId} onValueChange={setSchemeId}>
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder="Select Scheme" />
                  </SelectTrigger>
                  <SelectContent>
                    {schemes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={schemeName}
                  disabled
                  className="bg-slate-50 text-slate-700 font-medium h-10 text-xs"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Active Survey Template *
              </label>
              <Select
                value={selectedSurveyId}
                onValueChange={setSelectedSurveyId}
                disabled={surveys.length === 0}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue
                    placeholder={
                      loadingSurveys
                        ? 'Loading templates...'
                        : surveys.length === 0
                          ? 'No surveys active'
                          : 'Select Survey'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {surveys.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} (v{s.version ?? 1})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Respondent Metadata */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
            2. Respondent Details
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Beneficiary Category
              </label>
              <Select
                value={respondentType}
                onValueChange={(val: 'farmer' | 'wua' | 'community') => setRespondentType(val)}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="farmer">Smallholder Farmer</SelectItem>
                  <SelectItem value="wua">WUA Executive / Trustee</SelectItem>
                  <SelectItem value="community">Host Community Leader</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Respondent Full Name *
              </label>
              <Input
                required
                value={respondentName}
                onChange={(e) => setRespondentName(e.target.value)}
                className="h-10 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Settlement / Village
              </label>
              <Input
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                className="h-10 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                GPS Location
              </label>
              <Input
                value={gpsCoordinates}
                onChange={(e) => setGpsCoordinates(e.target.value)}
                className="h-10 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Dynamic Questionnaire Form */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              3. Interview Questionnaire
            </h3>
            <span className="text-[11px] text-teal-700 font-semibold">
              {loadingQuestions
                ? 'Loading questions...'
                : `${sortedQuestions.length} Questions Configured`}
            </span>
          </div>

          {loadingQuestions ? (
            <div className="p-4 text-center text-xs text-slate-500">
              Loading questionnaire questions...
            </div>
          ) : sortedQuestions.length === 0 ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-bold">⚠️ No Questions Found for this Survey</p>
              <p className="text-slate-600">
                This survey template currently has no questions configured. Please select another
                survey instrument with active questions or configure questions in M&E Survey
                Management.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedQuestions.map((q, idx) => {
                const choices = extractQuestionChoices(q.options);
                return (
                  <div
                    key={q.id}
                    className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <label className="block text-xs font-semibold text-slate-800">
                        {idx + 1}. {q.text}{' '}
                        {q.isRequired && <span className="text-red-500">*</span>}
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        [{q.code}]
                      </span>
                    </div>

                    {q.answerType === 'single' ? (
                      choices.length > 0 ? (
                        <Select
                          value={answers[q.id] || ''}
                          onValueChange={(val) => handleAnswerChange(q.id, val)}
                        >
                          <SelectTrigger className="h-9 text-xs bg-white">
                            <SelectValue placeholder="Select an option" />
                          </SelectTrigger>
                          <SelectContent>
                            {choices.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={answers[q.id] || ''}
                          onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                          className="h-9 text-xs bg-white"
                          placeholder="Enter your answer"
                        />
                      )
                    ) : q.answerType === 'number' ? (
                      <Input
                        type="number"
                        value={answers[q.id] ?? ''}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                        className="h-9 text-xs bg-white"
                        placeholder="Enter numeric value"
                      />
                    ) : q.answerType === 'date' ? (
                      <Input
                        type="date"
                        value={answers[q.id] || ''}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                        className="h-9 text-xs bg-white"
                      />
                    ) : q.answerType === 'gps' ? (
                      <Input
                        value={answers[q.id] || ''}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                        className="h-9 text-xs bg-white"
                        placeholder="e.g. 11.7584, 8.4289 (Lat, Lon)"
                      />
                    ) : (
                      <Input
                        value={answers[q.id] || ''}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                        className="h-9 text-xs bg-white"
                        placeholder="Enter text response"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            className="text-xs"
            onClick={() => navigate({ to: '/field/capture' })}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting || sortedQuestions.length === 0}
            className="bg-teal-700 hover:bg-teal-800 text-white min-h-[44px] px-6 text-xs font-bold"
          >
            <Send className="w-4 h-4 mr-1.5" />
            {isSubmitting
              ? 'Saving...'
              : isOnline
                ? 'Submit & Sync Survey'
                : 'Save Response Offline'}
          </Button>
        </div>
      </form>
    </div>
  );
}
