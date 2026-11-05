import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronLeft, Save } from 'lucide-react';
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
} from '@idmis/ui';
import {
  RecordTrainingAttendanceInputSchema,
  type RecordTrainingAttendanceInput,
  type SlisGender,
} from '@idmis/contracts';
import { generateUuidV7, localDb, LocalStore } from '@idmis/sync';
import { useScope } from '../../shell/ScopeContext';

export function TrainingAttendanceFieldForm() {
  const navigate = useNavigate();
  const { currentScope } = useScope();
  const store = React.useMemo(() => new LocalStore(localDb), []);

  const [attendeeType, setAttendeeType] = React.useState<'farmer' | 'staff'>('farmer');
  const [topic, setTopic] = React.useState('Participatory Irrigation Management (PIM) Operation');
  const [farmerName, setFarmerName] = React.useState('');
  const [staffName, setStaffName] = React.useState('');
  const [gender, setGender] = React.useState<SlisGender>('male');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    try {
      const attendanceId = generateUuidV7();
      const trainingId = generateUuidV7();
      const schemeId = currentScope.id || '018f3a70-0003-7000-8000-000000000001';

      const payload: RecordTrainingAttendanceInput = {
        id: attendanceId,
        trainingId,
        farmerId: attendeeType === 'farmer' ? generateUuidV7() : undefined,
        staffName: attendeeType === 'staff' ? staffName || 'Aliyu Garba' : undefined,
        gender,
      };

      // Strict contract validation
      RecordTrainingAttendanceInputSchema.parse(payload);

      // Commit locally to outbox
      await store.commitInsert(
        'training_attendance',
        attendanceId,
        {
          ...payload,
          topic,
          displayName:
            attendeeType === 'farmer'
              ? `Farmer: ${farmerName || 'Musa Ibrahim'}`
              : `Staff: ${staffName || 'Aliyu Garba'}`,
          status: 'saved_on_device',
          submittedAt: new Date().toISOString(),
        },
        {
          schemeId,
        },
      );

      navigate({ to: '/field/records' });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errors' in err) {
        const zodErrors = (err as { errors: Array<{ path: (string | number)[]; message: string }> })
          .errors;
        const mapped: Record<string, string> = {};
        for (const item of zodErrors) {
          mapped[item.path.join('.')] = item.message;
        }
        setErrors(mapped);
      } else {
        setErrors({ form: 'Validation failed. Check your inputs.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-6 animate-in fade-in-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => navigate({ to: '/field/capture' })}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Training Attendance</h2>
            <p className="text-xs text-slate-500">Record farmer capacity building roster</p>
          </div>
        </div>
        <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 text-xs">
          Offline Roster
        </Badge>
      </div>

      <Card className="rounded-2xl border-slate-200/90 shadow-sm bg-white">
        <form onSubmit={handleSubmit}>
          <CardContent className="p-5 space-y-4">
            {errors.form && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {errors.form}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Training Session Topic</label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Training title"
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Participant Category</label>
              <Select
                value={attendeeType}
                onValueChange={(val) => setAttendeeType(val as 'farmer' | 'staff')}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="farmer">Registered Farmer Member</SelectItem>
                  <SelectItem value="staff">WUA / Project Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {attendeeType === 'farmer' ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Farmer Participant</label>
                <Input
                  placeholder="e.g. Sani Haruna Danbatta"
                  value={farmerName}
                  onChange={(e) => setFarmerName(e.target.value)}
                  className="text-xs"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Staff Member Name *</label>
                <Input
                  placeholder="e.g. Aliyu Garba (Extension Agent)"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className={`text-xs ${errors.staffName ? 'border-rose-500' : ''}`}
                />
                {errors.staffName && (
                  <p className="text-[10px] text-rose-600">{errors.staffName}</p>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Gender</label>
              <Select value={gender} onValueChange={(val) => setGender(val as SlisGender)}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="Gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>

          <CardFooter className="px-5 py-3 border-t border-slate-100 flex justify-between bg-slate-50/50 rounded-b-2xl">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: '/field/capture' })}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold"
            >
              <Save className="h-4 w-4 mr-1.5" />
              Save to Device
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
