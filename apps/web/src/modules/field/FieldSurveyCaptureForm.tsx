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
import { useSurveys } from '../me/hooks';

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
  const [respondentType, setRespondentType] = React.useState<'farmer' | 'wua' | 'community'>('farmer');
  const [respondentName, setRespondentName] = React.useState('Mallam Bello Kura');
  const [village, setVillage] = React.useState('Dan Hassan');
  const [gpsCoordinates, setGpsCoordinates] = React.useState('11.7584° N, 8.4289° E');
  const [answers, setAnswers] = React.useState<Record<string, string>>({
    HH_SIZE: '6',
    PRIMARY_CROP: 'Rice',
    WATER_SATISFACTION: 'Satisfied',
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [successId, setSuccessId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (surveys.length > 0 && !selectedSurveyId) {
      setSelectedSurveyId(surveys[0]!.id);
    }
  }, [surveys, selectedSurveyId]);

  const activeSurvey = surveys.find((s) => s.id === selectedSurveyId) ?? surveys[0];

  const handleAnswerChange = (code: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [code]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSurveyId) {
      toastError('Survey Required', 'Please select an active survey instrument.');
      return;
    }

    setIsSubmitting(true);
    try {
      const answersArray: CreateSurveyAnswerInput[] = Object.entries(answers).map(
        ([code, value]) => ({
          questionCode: code,
          value: code === 'HH_SIZE' ? Number(value) || 0 : value,
        }),
      );

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
          console.warn('Direct survey response submission failed; falling back to offline outbox:', serverErr);
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
        warning('Saved Offline', 'Survey response saved to local outbox. Will sync when reconnected.');
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
                <Input value={schemeName} disabled className="bg-slate-50 text-slate-700 font-medium h-10 text-xs" />
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
              3 Verified Questions
            </span>
          </div>

          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <label className="block text-xs font-semibold text-slate-800">
                1. Total number of family members in household? *
              </label>
              <Input
                type="number"
                min={1}
                value={answers.HH_SIZE || '6'}
                onChange={(e) => handleAnswerChange('HH_SIZE', e.target.value)}
                className="h-9 text-xs bg-white"
              />
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <label className="block text-xs font-semibold text-slate-800">
                2. What was your primary irrigated commercial crop this season? *
              </label>
              <Select
                value={answers.PRIMARY_CROP || 'Rice'}
                onValueChange={(val) => handleAnswerChange('PRIMARY_CROP', val)}
              >
                <SelectTrigger className="h-9 text-xs bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Rice">Lowland Rice</SelectItem>
                  <SelectItem value="Maize">Hybrid Maize</SelectItem>
                  <SelectItem value="Tomato">Dry Season Tomato</SelectItem>
                  <SelectItem value="Wheat">Irrigated Wheat</SelectItem>
                  <SelectItem value="Onion">Commercial Onion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <label className="block text-xs font-semibold text-slate-800">
                3. How satisfied are you with water delivery reliability? *
              </label>
              <Select
                value={answers.WATER_SATISFACTION || 'Satisfied'}
                onValueChange={(val) => handleAnswerChange('WATER_SATISFACTION', val)}
              >
                <SelectTrigger className="h-9 text-xs bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Very Satisfied">Very Satisfied</SelectItem>
                  <SelectItem value="Satisfied">Satisfied</SelectItem>
                  <SelectItem value="Neutral">Neutral</SelectItem>
                  <SelectItem value="Dissatisfied">Dissatisfied</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
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
            disabled={isSubmitting}
            className="bg-teal-700 hover:bg-teal-800 text-white min-h-[44px] px-6 text-xs font-bold"
          >
            <Send className="w-4 h-4 mr-1.5" />
            {isSubmitting ? 'Saving...' : isOnline ? 'Submit & Sync Survey' : 'Save Response Offline'}
          </Button>
        </div>
      </form>
    </div>
  );
}
