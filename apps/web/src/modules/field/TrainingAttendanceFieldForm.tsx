import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronLeft, Save, Wifi, WifiOff } from 'lucide-react';
import {
  Card,
  CardContent,
  CardFooter,
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
import {
  RecordTrainingAttendanceInputSchema,
  type RecordTrainingAttendanceInput,
  type SlisGender,
} from '@idmis/contracts';
import { generateUuidV7, localDb, LocalStore } from '@idmis/sync';
import { getApiClient } from '@idmis/api-client';
import { useScope } from '../../shell/ScopeContext';
import { useEffectiveSchemeId } from '../core/hooks';
import { useFarmers } from '../slis/hooks';

export function TrainingAttendanceFieldForm() {
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

  // Live Farmers in scheme
  const { farmers = [], isLoading: loadingFarmers } = useFarmers({ schemeId, limit: 100 });

  const [trainingId] = React.useState('018f3a5e-0060-7000-8000-000000000001'); // Water Scheduling & Canal Maintenance
  const [attendeeType, setAttendeeType] = React.useState<'farmer' | 'staff'>('farmer');
  const [farmerId, setFarmerId] = React.useState('');
  const [staffName, setStaffName] = React.useState('');
  const [gender, setGender] = React.useState<SlisGender>('male');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (farmers.length > 0 && !farmerId) {
      setFarmerId(farmers[0]!.id);
    }
  }, [farmers, farmerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const attendanceId = generateUuidV7();

      const payload: RecordTrainingAttendanceInput = {
        id: attendanceId,
        trainingId,
        farmerId: attendeeType === 'farmer' ? farmerId : undefined,
        staffName: attendeeType === 'staff' ? staffName : undefined,
        gender,
      };

      // Strict validation
      RecordTrainingAttendanceInputSchema.parse(payload);

      let syncedOnline = false;

      // Online attempt first
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const client = getApiClient();
          await client.recordTrainingAttendance(payload);
          syncedOnline = true;
        } catch (serverErr) {
          console.warn(
            'Direct training attendance creation failed; falling back to offline outbox:',
            serverErr,
          );
        }
      }

      if (syncedOnline) {
        // Cache cleanly in local storage (zero pending outbox ops)
        await store.cacheCleanRecord(
          'training_attendance',
          attendanceId,
          payload as unknown as Record<string, unknown>,
          { schemeId },
        );
      } else {
        // Offline commit to Dexie
        await store.commitInsert(
          'training_attendance',
          attendanceId,
          payload as unknown as Record<string, unknown>,
          { schemeId },
        );
      }

      const displayName =
        attendeeType === 'farmer'
          ? farmers.find((f) => f.id === farmerId)?.firstName || 'Farmer'
          : staffName;

      if (syncedOnline) {
        success(
          'Attendance Recorded & Synced',
          `Logged ${displayName} attendance directly on server.`,
        );
      } else {
        warning(
          'Attendance Saved Offline',
          `Logged ${displayName} attendance locally in outbox. Will sync automatically when online.`,
        );
      }

      navigate({ to: '/field/records' });
    } catch (err) {
      console.error('Training attendance error:', err);
      toastError('Submission Failed', String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: '/field/capture' })}
          className="text-xs h-8 text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Capture
        </Button>
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

      <Card className="rounded-2xl border-slate-200/90 shadow-sm bg-white">
        <form onSubmit={handleSubmit}>
          <CardContent className="p-5 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-extrabold text-slate-900">
                Training Attendance Check-in
              </h2>
              <p className="text-xs text-slate-500">
                Register participant attendance for capacity building sessions and extension
                workshops.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Scheme</label>
                {schemes.length > 1 ? (
                  <Select
                    value={schemeId}
                    onValueChange={(val) => {
                      setSchemeId(val);
                      setFarmerId('');
                    }}
                  >
                    <SelectTrigger className="w-full">
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
                    className="bg-slate-50 text-slate-700 font-medium"
                  />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Attendee Type</label>
                <Select
                  value={attendeeType}
                  onValueChange={(val) => setAttendeeType(val as 'farmer' | 'staff')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="farmer">Registered Farmer</SelectItem>
                    <SelectItem value="staff">Scheme / Ministry Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Training Session</label>
              <Input
                value="Water Scheduling & Canal Maintenance (PIM-2026)"
                disabled
                className="bg-slate-50 text-slate-700 font-medium"
              />
            </div>

            {attendeeType === 'farmer' ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Select Farmer *</label>
                <Select
                  value={farmerId}
                  onValueChange={setFarmerId}
                  disabled={farmers.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        loadingFarmers
                          ? 'Loading farmers...'
                          : farmers.length === 0
                            ? 'No registered farmers'
                            : 'Select Farmer'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {farmers.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.firstName} {f.lastName} ({f.farmerCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Staff Full Name *</label>
                <Input
                  placeholder="e.g. Engr. Aliyu Garba"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Gender *</label>
              <Select value={gender} onValueChange={(val) => setGender(val as SlisGender)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isOnline ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
                <span className="font-bold">Online Connection: </span>
                Clicking check-in will immediately record attendance on the central training session
                register.
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <span className="font-bold">Offline Storage Guarantee: </span>
                Attendance stored locally in offline database with sync on network restore.
              </div>
            )}
          </CardContent>

          <CardFooter className="p-4 bg-slate-50/80 border-t border-slate-100 rounded-b-2xl flex items-center justify-end">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-8 px-4 rounded-xl shadow-sm"
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              {isSubmitting
                ? 'Recording...'
                : isOnline
                  ? 'Submit & Sync Check-in'
                  : 'Save Check-in Offline'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
