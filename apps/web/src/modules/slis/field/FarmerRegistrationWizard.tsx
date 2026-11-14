import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  User,
  Users,
  MapPin,
  Building2,
  FileText,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Save,
  AlertTriangle,
  Upload,
  Plus,
  Trash2,
  Navigation,
  Wifi,
  WifiOff,
} from 'lucide-react';
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
import { CreateFarmerInputSchema, type CreateFarmerInput, type SlisGender } from '@idmis/contracts';
import { generateUuidV7, localDb, LocalStore, compressFieldPhoto } from '@idmis/sync';
import { getApiClient } from '@idmis/api-client';
import { useScope } from '../../../shell/ScopeContext';
import { registerDirtyFormCheck } from '../../../pwa';
import {
  useEffectiveSchemeId,
  useOrganisations,
  useWuas,
  useGeography,
  useLgas,
  useWards,
  useLookupValues,
} from '../../core/hooks';

export interface IdentityDocItem {
  id: string;
  type: string; // 'nin' | 'bvn' | 'voters_card' | 'national_id' | 'passport' | 'drivers_license' | 'bank_account'
  number: string;
  bankName?: string;
  file?: File;
  previewUrl?: string;
}

const STEPS = [
  { id: 1, title: 'Identity', icon: User, desc: 'Personal details & contacts' },
  { id: 2, title: 'Household', icon: Users, desc: 'Family status & dependents' },
  { id: 3, title: 'Location', icon: MapPin, desc: 'Ward, village & GPS coordinates' },
  { id: 4, title: 'WUA & Group', icon: Building2, desc: 'Sector, WUA & sub-group' },
  { id: 5, title: 'Documents', icon: FileText, desc: 'NIN, BVN, Voter card, Bank' },
  { id: 6, title: 'Photos', icon: Camera, desc: 'Farmer portrait capture' },
  { id: 7, title: 'Review', icon: CheckCircle2, desc: 'Verification & submission' },
];

const STORAGE_AUTOSAVE_KEY = 'idmis_offline_farmer_draft';

export function FarmerRegistrationWizard() {
  const navigate = useNavigate();
  const { currentScope } = useScope();
  const { success, error: toastError, warning } = useToast();
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

  // Live Lookups
  const { data: docTypes = [] } = useLookupValues('document_type');
  const { data: maritalStatuses = [] } = useLookupValues('marital_status');

  // Live Sectors for active scheme
  const { organisations: sectorOrgs = [], isLoading: loadingSectors } = useOrganisations({
    type: 'sector',
    parentId: schemeId,
  });

  // Live WUAs for active scheme
  const { wuas = [], isLoading: loadingWuas } = useWuas({
    organisationId: schemeId,
  });

  const [currentStep, setCurrentStep] = React.useState(1);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [duplicateWarning, setDuplicateWarning] = React.useState<string | null>(null);

  // Form State
  const [formData, setFormData] = React.useState({
    // Step 1: Identity
    firstName: '',
    lastName: '',
    otherNames: '',
    gender: 'male' as SlisGender,
    birthYear: new Date().getFullYear() - 35,
    phone: '',

    // Step 2: Household
    maritalStatusCode: 'married',
    householdSize: 1,
    dependents: 0,
    nextOfKinName: '',
    nextOfKinPhone: '',
    nextOfKinRelation: '',

    // Step 3: Location
    stateId: '018f3a5e-0001-7000-8000-000000000020', // Kano default
    lgaId: '',
    wardId: '',
    village: '',
    latitude: 11.7584,
    longitude: 8.4289,

    // Step 4: WUA & Group
    schemeId,
    sectorId: '',
    unitWuaId: '',
    farmerGroupId: '',

    // Step 5: Documents
    identities: [
      {
        id: generateUuidV7(),
        type: 'nin',
        number: '',
        bankName: '',
      },
    ] as IdentityDocItem[],

    // Step 6: Photos
    portraitPhoto: null as File | null,
    portraitPreview: null as string | null,
  });

  // Keep schemeId synchronized
  React.useEffect(() => {
    if (schemeId && formData.schemeId !== schemeId) {
      setFormData((prev) => ({ ...prev, schemeId }));
    }
  }, [schemeId, formData.schemeId]);

  // Set default sector / WUA when loaded
  React.useEffect(() => {
    if (sectorOrgs.length > 0 && !formData.sectorId) {
      setFormData((prev) => ({ ...prev, sectorId: sectorOrgs[0]!.id }));
    }
  }, [sectorOrgs, formData.sectorId]);

  React.useEffect(() => {
    if (wuas.length > 0 && !formData.unitWuaId) {
      setFormData((prev) => ({ ...prev, unitWuaId: wuas[0]!.id }));
    }
  }, [wuas, formData.unitWuaId]);

  // Live Geography
  const { states = [], isLoadingStates } = useGeography();
  const { lgas = [] } = useLgas(formData.stateId);
  const { wards = [] } = useWards(formData.lgaId);

  // Set default LGA and Ward when options load
  React.useEffect(() => {
    if (lgas.length > 0 && (!formData.lgaId || !lgas.some((l) => l.id === formData.lgaId))) {
      setFormData((prev) => ({ ...prev, lgaId: lgas[0]!.id }));
    }
  }, [lgas, formData.lgaId]);

  React.useEffect(() => {
    if (wards.length > 0 && (!formData.wardId || !wards.some((w) => w.id === formData.wardId))) {
      setFormData((prev) => ({ ...prev, wardId: wards[0]!.id }));
    }
  }, [wards, formData.wardId]);

  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Check if form is dirty for PWA reload prevention
  const isFormDirty = React.useCallback(() => {
    return Boolean(formData.firstName || formData.lastName || formData.phone);
  }, [formData.firstName, formData.lastName, formData.phone]);

  React.useEffect(() => {
    const unregister = registerDirtyFormCheck(isFormDirty);
    return () => unregister();
  }, [isFormDirty]);

  // Load autosaved draft on mount
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_AUTOSAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setFormData((prev) => ({ ...prev, ...parsed, portraitPhoto: null, portraitPreview: null }));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Autosave draft on step change
  const saveDraft = (dataToSave = formData) => {
    try {
      const serializable = { ...dataToSave, portraitPhoto: null, portraitPreview: null };
      localStorage.setItem(STORAGE_AUTOSAVE_KEY, JSON.stringify(serializable));
    } catch {
      // Ignore storage errors
    }
  };

  // Duplicate Check against cached offline records
  const checkCachedDuplicates = async (firstName: string, lastName: string, phone: string) => {
    if (!firstName || !lastName) return;
    try {
      const cached = await store.listRecords('farmer');
      const match = cached.find((r) => {
        const d = r.data as Record<string, unknown>;
        const matchName =
          typeof d.firstName === 'string' &&
          typeof d.lastName === 'string' &&
          d.firstName.toLowerCase() === firstName.toLowerCase() &&
          d.lastName.toLowerCase() === lastName.toLowerCase();
        const matchPhone = Boolean(phone && d.phone === phone);
        return matchName || matchPhone;
      });

      if (match) {
        const matchData = match.data as Record<string, unknown>;
        setDuplicateWarning(
          `Potential duplicate found in local records: "${String(matchData.firstName ?? '')} ${String(matchData.lastName ?? '')}" (${String(matchData.farmerCode ?? 'Unsynced')}).`,
        );
      } else {
        setDuplicateWarning(null);
      }
    } catch {
      // Offline fallback ignore
    }
  };

  // Step Validation
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
      if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
      if (formData.phone && !/^\+?[0-9]{10,15}$/.test(formData.phone.replace(/[\s-]/g, ''))) {
        newErrors.phone = 'Please provide a valid phone number';
      }
    }

    if (step === 3) {
      if (!formData.village.trim()) newErrors.village = 'Village / Settlement name is required';
    }

    if (step === 5) {
      for (const doc of formData.identities) {
        if (doc.type === 'nin' && doc.number && !/^\d{11}$/.test(doc.number.trim())) {
          newErrors.nin = 'NIN must be exactly 11 digits';
        }
        if (doc.type === 'bvn' && doc.number && !/^\d{11}$/.test(doc.number.trim())) {
          newErrors.bvn = 'BVN must be exactly 11 digits';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) return;
    saveDraft();
    if (currentStep === 1) {
      checkCachedDuplicates(formData.firstName, formData.lastName, formData.phone);
    }
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Photo Capture & Client Compression
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressFieldPhoto(file, { maxDimension: 1600, quality: 0.82 });
      const previewUrl = URL.createObjectURL(compressed.blob);
      setFormData((prev) => ({
        ...prev,
        portraitPhoto: new File([compressed.blob], 'farmer-portrait.jpg', { type: 'image/jpeg' }),
        portraitPreview: previewUrl,
      }));
    } catch (err) {
      console.error('Photo compression error:', err);
    }
  };

  // Document management
  const addIdentityDoc = () => {
    setFormData((prev) => ({
      ...prev,
      identities: [
        ...prev.identities,
        {
          id: generateUuidV7(),
          type: 'voters_card',
          number: '',
        },
      ],
    }));
  };

  const removeIdentityDoc = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      identities: prev.identities.filter((d) => d.id !== id),
    }));
  };

  const updateIdentityDoc = (id: string, updates: Partial<IdentityDocItem>) => {
    setFormData((prev) => ({
      ...prev,
      identities: prev.identities.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    }));
  };

  // Helper to map doc type code to DB lookup_value UUID
  const resolveDocTypeId = (typeCode: string) => {
    const match = docTypes.find((d) => d.code.toLowerCase() === typeCode.toLowerCase());
    return match?.id || '018f3a5e-0003-7000-8001-000000000001';
  };

  // Helper to map marital status code to DB lookup_value UUID
  const resolveMaritalStatusId = (statusCode: string) => {
    const match = maritalStatuses.find((m) => m.code.toLowerCase() === statusCode.toLowerCase());
    return match?.id;
  };

  // Final Submission (Immediate online sync if available + Dexie fallback)
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const farmerId = generateUuidV7();
      const farmerCode = `FARM-KRIS-${Math.floor(1000 + Math.random() * 9000)}`;

      const payload: CreateFarmerInput = {
        id: farmerId,
        schemeId: formData.schemeId,
        sectorId: formData.sectorId || undefined,
        farmerCode,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        otherNames: formData.otherNames?.trim() || undefined,
        gender: formData.gender,
        birthYear: Number(formData.birthYear) || undefined,
        phone: formData.phone?.trim() || undefined,
        village: formData.village?.trim() || undefined,
        wardId: formData.wardId || undefined,
        unitWuaId: formData.unitWuaId || undefined,
        farmerGroupId: formData.farmerGroupId?.trim() || undefined,
        maritalStatusId: resolveMaritalStatusId(formData.maritalStatusCode),
        nextOfKinName: formData.nextOfKinName?.trim() || undefined,
        nextOfKinPhone: formData.nextOfKinPhone?.trim() || undefined,
        nextOfKinRelation: formData.nextOfKinRelation?.trim() || undefined,
        location: {
          type: 'Point',
          coordinates: [formData.longitude, formData.latitude],
        },
        identities: formData.identities
          .filter((d) => d.number.trim().length > 0)
          .map((d) => ({
            id: d.id,
            documentTypeId: resolveDocTypeId(d.type),
            number: d.number.trim(),
            bankName: d.bankName?.trim() || undefined,
          })),
      };

      // Strict contract validation
      CreateFarmerInputSchema.parse(payload);

      let syncedOnline = false;

      // Online attempt first
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const client = getApiClient();
          await client.createFarmer(payload);
          syncedOnline = true;
        } catch (serverErr) {
          console.warn('Direct online registration failed; falling back to offline outbox:', serverErr);
        }
      }

      if (syncedOnline) {
        // Cache cleanly in local storage (zero pending outbox ops)
        await store.cacheCleanRecord(
          'farmer',
          farmerId,
          payload as unknown as Record<string, unknown>,
          {
            schemeId: formData.schemeId,
            stateId: formData.stateId,
          },
        );
      } else {
        // Queue in offline Dexie outbox
        await store.commitInsert(
          'farmer',
          farmerId,
          payload as unknown as Record<string, unknown>,
          {
            schemeId: formData.schemeId,
            stateId: formData.stateId,
          },
        );
      }

      // Queue photo if attached
      if (formData.portraitPhoto) {
        await store.queuePhoto({
          recordId: farmerId,
          entity: 'farmer',
          category: 'farmer_portrait',
          blob: formData.portraitPhoto,
          mimeType: formData.portraitPhoto.type,
          width: 1600,
          height: 1600,
          sizeBytes: formData.portraitPhoto.size,
        });
      }

      // Clear autosave draft
      localStorage.removeItem(STORAGE_AUTOSAVE_KEY);

      if (syncedOnline) {
        success(
          'Farmer Registered & Synced',
          `${formData.firstName} ${formData.lastName} (${farmerCode}) uploaded directly to server.`,
        );
      } else {
        warning(
          'Saved Offline',
          `${formData.firstName} ${formData.lastName} saved to local outbox. Will sync automatically when connection is restored.`,
        );
      }

      navigate({ to: '/field/records' });
    } catch (err) {
      console.error('Farmer registration error:', err);
      toastError('Registration Failed', String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedSector = sectorOrgs.find((s) => s.id === formData.sectorId);
  const selectedWua = wuas.find((w) => w.id === formData.unitWuaId);

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-12">
      {/* Top Wizard Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Farmer Registration</h2>
          <p className="text-xs text-slate-500">
            Step {currentStep} of {STEPS.length}: {STEPS[currentStep - 1].title}
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

      {/* Stepper Progress Bar */}
      <div className="overflow-x-auto scrollbar-none py-1">
        <div className="flex items-center gap-2 min-w-max">
          {STEPS.map((s) => {
            const isCompleted = s.id < currentStep;
            const isCurrent = s.id === currentStep;
            const StepIcon = s.icon;

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (s.id < currentStep) setCurrentStep(s.id);
                }}
                disabled={s.id > currentStep}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isCurrent
                    ? 'bg-teal-700 text-white shadow-sm'
                    : isCompleted
                      ? 'bg-teal-100/70 text-teal-800 hover:bg-teal-200'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <StepIcon className="h-3.5 w-3.5" />
                <span>{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Duplicate Warning Alert */}
      {duplicateWarning && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5 shadow-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Duplicate Warning: </span>
            {duplicateWarning}
          </div>
        </div>
      )}

      {/* Form Content Steps */}
      <Card className="rounded-2xl border-slate-200/90 shadow-sm bg-white">
        <CardContent className="p-5 space-y-4">
          {/* STEP 1: IDENTITY */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in-50">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                1. Personal Identity Details
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">First Name *</label>
                  <Input
                    placeholder="Enter first name"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className={errors.firstName ? 'border-rose-500' : ''}
                  />
                  {errors.firstName && (
                    <p className="text-[11px] text-rose-600">{errors.firstName}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Last Name *</label>
                  <Input
                    placeholder="Enter last name"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className={errors.lastName ? 'border-rose-500' : ''}
                  />
                  {errors.lastName && (
                    <p className="text-[11px] text-rose-600">{errors.lastName}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Other Names</label>
                  <Input
                    placeholder="Middle name (optional)"
                    value={formData.otherNames}
                    onChange={(e) => setFormData({ ...formData, otherNames: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Gender *</label>
                  <Select
                    value={formData.gender}
                    onValueChange={(val) => setFormData({ ...formData, gender: val as SlisGender })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Birth Year</label>
                  <Input
                    type="number"
                    min={1930}
                    max={new Date().getFullYear() - 15}
                    value={formData.birthYear}
                    onChange={(e) =>
                      setFormData({ ...formData, birthYear: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Primary Phone</label>
                <Input
                  type="tel"
                  placeholder="+234 800 000 0000"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className={errors.phone ? 'border-rose-500' : ''}
                />
                {errors.phone && <p className="text-[11px] text-rose-600">{errors.phone}</p>}
              </div>
            </div>
          )}

          {/* STEP 2: HOUSEHOLD */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in-50">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                2. Household Composition & Next of Kin
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Marital Status</label>
                  <Select
                    value={formData.maritalStatusCode}
                    onValueChange={(val) => setFormData({ ...formData, maritalStatusCode: val })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {maritalStatuses.length > 0 ? (
                        maritalStatuses.map((m) => (
                          <SelectItem key={m.id} value={m.code}>
                            {m.label}
                          </SelectItem>
                        ))
                      ) : (
                        <>
                          <SelectItem value="married">Married</SelectItem>
                          <SelectItem value="single">Single</SelectItem>
                          <SelectItem value="widowed">Widowed</SelectItem>
                          <SelectItem value="divorced">Divorced</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Household Size</label>
                  <Input
                    type="number"
                    min={1}
                    value={formData.householdSize}
                    onChange={(e) =>
                      setFormData({ ...formData, householdSize: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Dependents</label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.dependents}
                    onChange={(e) =>
                      setFormData({ ...formData, dependents: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Next of Kin Name</label>
                  <Input
                    placeholder="Full name"
                    value={formData.nextOfKinName}
                    onChange={(e) => setFormData({ ...formData, nextOfKinName: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Next of Kin Phone</label>
                  <Input
                    placeholder="+234..."
                    value={formData.nextOfKinPhone}
                    onChange={(e) => setFormData({ ...formData, nextOfKinPhone: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Relationship</label>
                  <Input
                    placeholder="e.g. Spouse / Brother"
                    value={formData.nextOfKinRelation}
                    onChange={(e) =>
                      setFormData({ ...formData, nextOfKinRelation: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: LOCATION & GPS */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in-50">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                3. Residence & GPS Coordinates
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">State</label>
                  <Select
                    value={formData.stateId}
                    onValueChange={(val) => setFormData({ ...formData, stateId: val, lgaId: '', wardId: '' })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={isLoadingStates ? 'Loading...' : 'Select State'} />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((st) => (
                        <SelectItem key={st.id} value={st.id}>
                          {st.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">LGA</label>
                  <Select
                    value={formData.lgaId}
                    onValueChange={(val) => setFormData({ ...formData, lgaId: val, wardId: '' })}
                    disabled={lgas.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={lgas.length === 0 ? 'No LGAs' : 'Select LGA'} />
                    </SelectTrigger>
                    <SelectContent>
                      {lgas.map((lg) => (
                        <SelectItem key={lg.id} value={lg.id}>
                          {lg.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Ward</label>
                  <Select
                    value={formData.wardId}
                    onValueChange={(val) => setFormData({ ...formData, wardId: val })}
                    disabled={wards.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={wards.length === 0 ? 'No Wards' : 'Select Ward'} />
                    </SelectTrigger>
                    <SelectContent>
                      {wards.map((wd) => (
                        <SelectItem key={wd.id} value={wd.id}>
                          {wd.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Village / Settlement Name *
                </label>
                <Input
                  placeholder="Enter village or settlement name"
                  value={formData.village}
                  onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                  className={errors.village ? 'border-rose-500' : ''}
                />
                {errors.village && <p className="text-[11px] text-rose-600">{errors.village}</p>}
              </div>

              {/* GPS Capture */}
              <div className="p-3.5 rounded-2xl bg-teal-50/60 border border-teal-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                    <Navigation className="h-4 w-4 text-teal-700" />
                    Device GPS Coordinates
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => {
                      if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            setFormData((prev) => ({
                              ...prev,
                              latitude: parseFloat(pos.coords.latitude.toFixed(6)),
                              longitude: parseFloat(pos.coords.longitude.toFixed(6)),
                            }));
                            success(
                              'GPS Coordinates Acquired',
                              `${pos.coords.latitude.toFixed(6)}° N, ${pos.coords.longitude.toFixed(6)}° E`,
                            );
                          },
                          (err) => toastError('GPS Unavailable', err.message),
                          { enableHighAccuracy: true },
                        );
                      }
                    }}
                    className="text-xs h-7 border-teal-300 text-teal-800 bg-white"
                  >
                    Acquire GPS
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500">Latitude:</span>
                    <span className="font-mono font-semibold ml-1.5 text-slate-900">
                      {formData.latitude.toFixed(6)}° N
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Longitude:</span>
                    <span className="font-mono font-semibold ml-1.5 text-slate-900">
                      {formData.longitude.toFixed(6)}° E
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: WUA & SECTOR */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-in fade-in-50">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                4. Irrigation Scheme & Water User Association
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Irrigation Scheme</label>
                  {schemes.length > 1 ? (
                    <Select
                      value={formData.schemeId}
                      onValueChange={(val) => {
                        setSchemeId(val);
                        setFormData({ ...formData, schemeId: val, sectorId: '', unitWuaId: '' });
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
                  <label className="text-xs font-semibold text-slate-700">
                    Distributary Sector
                  </label>
                  <Select
                    value={formData.sectorId}
                    onValueChange={(val) => setFormData({ ...formData, sectorId: val })}
                    disabled={sectorOrgs.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          loadingSectors
                            ? 'Loading sectors...'
                            : sectorOrgs.length === 0
                              ? 'No sectors available'
                              : 'Select Sector'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {sectorOrgs.map((sec) => (
                        <SelectItem key={sec.id} value={sec.id}>
                          {sec.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Primary WUA Unit</label>
                  <Select
                    value={formData.unitWuaId}
                    onValueChange={(val) => setFormData({ ...formData, unitWuaId: val })}
                    disabled={wuas.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          loadingWuas
                            ? 'Loading WUAs...'
                            : wuas.length === 0
                              ? 'No WUAs in this scheme'
                              : 'Select WUA Unit'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {wuas.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Farmer Sub-Group</label>
                  <Input
                    placeholder="e.g. Al-Baraka Rice Growers"
                    value={formData.farmerGroupId}
                    onChange={(e) => setFormData({ ...formData, farmerGroupId: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: IDENTITY DOCUMENTS */}
          {currentStep === 5 && (
            <div className="space-y-4 animate-in fade-in-50">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-900">
                  5. Identity Documents (NIN, BVN, Voter Card, Bank)
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={addIdentityDoc}
                  className="text-xs h-7 border-teal-300 text-teal-800 flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Document
                </Button>
              </div>

              {errors.nin && <p className="text-xs text-rose-600 font-medium">{errors.nin}</p>}
              {errors.bvn && <p className="text-xs text-rose-600 font-medium">{errors.bvn}</p>}

              <div className="space-y-3">
                {formData.identities.map((doc, idx) => (
                  <div
                    key={doc.id}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Document #{idx + 1}</span>
                      {formData.identities.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeIdentityDoc(doc.id)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <Select
                        value={doc.type}
                        onValueChange={(val) => updateIdentityDoc(doc.id, { type: val })}
                      >
                        <SelectTrigger className="w-full bg-white">
                          <SelectValue placeholder="Doc Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {docTypes.length > 0 ? (
                            docTypes.map((dt) => (
                              <SelectItem key={dt.id} value={dt.code}>
                                {dt.label}
                              </SelectItem>
                            ))
                          ) : (
                            <>
                              <SelectItem value="nin">National Identity Number (NIN)</SelectItem>
                              <SelectItem value="bvn">Bank Verification Number (BVN)</SelectItem>
                              <SelectItem value="voters_card">INEC Voter's Card</SelectItem>
                              <SelectItem value="bank_account">Bank Account Number</SelectItem>
                              <SelectItem value="drivers_license">Driver's License</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>

                      <Input
                        placeholder="Document Number / Code"
                        value={doc.number}
                        onChange={(e) => updateIdentityDoc(doc.id, { number: e.target.value })}
                        className="bg-white"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 6: PHOTO CAPTURE */}
          {currentStep === 6 && (
            <div className="space-y-4 animate-in fade-in-50">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                6. Farmer Portrait Photo
              </h3>

              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50 space-y-3">
                {formData.portraitPreview ? (
                  <div className="relative group">
                    <img
                      src={formData.portraitPreview}
                      alt="Farmer Preview"
                      className="w-48 h-48 object-cover rounded-2xl shadow-md border-2 border-teal-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, portraitPhoto: null, portraitPreview: null })
                      }
                      className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1.5 shadow-md"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="p-4 rounded-full bg-teal-100 text-teal-700">
                      <Camera className="h-8 w-8" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-slate-800">Capture or Upload Portrait</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Compressed client-side to ~1600px for efficient sync.
                      </p>
                    </div>
                  </>
                )}

                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    {formData.portraitPreview ? 'Change Photo' : 'Take Photo / Browse'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* STEP 7: REVIEW & SUBMIT */}
          {currentStep === 7 && (
            <div className="space-y-4 animate-in fade-in-50">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                7. Review & Submit Record
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Farmer Name:</span>
                  <span className="font-bold text-slate-900">
                    {formData.firstName || '—'} {formData.lastName || '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Gender & Birth Year:</span>
                  <span className="font-semibold text-slate-800">
                    {formData.gender.toUpperCase()} · {formData.birthYear}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Phone:</span>
                  <span className="font-semibold text-slate-800">{formData.phone || 'None'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Village & GPS:</span>
                  <span className="font-semibold text-slate-800">
                    {formData.village || '—'} ({formData.latitude.toFixed(4)},{' '}
                    {formData.longitude.toFixed(4)})
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">WUA / Sector / Scheme:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedWua?.name || 'Selected WUA'} · {selectedSector?.name || 'Selected Sector'} · {schemeName}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Identity Docs:</span>
                  <span className="font-semibold text-teal-800">
                    {formData.identities.filter((d) => d.number.trim()).length} document(s) attached
                  </span>
                </div>
              </div>

              {isOnline ? (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
                  <Wifi className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Online Connection Active: </span>
                    Submitting will immediately send this farmer record to the central server and persist an offline backup copy on this device.
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                  <WifiOff className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Offline Storage Guarantee: </span>
                    You are currently offline. This record will be safely stored in your local Dexie database and automatically synchronized as soon as internet connectivity returns.
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Stepper Navigation Footer */}
        <CardFooter className="p-4 bg-slate-50/80 border-t border-slate-100 rounded-b-2xl flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={currentStep === 1}
            className="text-xs h-8 px-3 border-slate-200"
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => saveDraft()}
              className="text-xs h-8 px-2.5 text-slate-600 hover:bg-slate-200/60"
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              Save Draft
            </Button>

            {currentStep < STEPS.length ? (
              <Button
                type="button"
                size="sm"
                onClick={handleNext}
                className="bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs h-8 px-4 rounded-xl shadow-sm"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 px-4 rounded-xl shadow-md"
              >
                {isSubmitting ? 'Submitting...' : isOnline ? 'Submit & Sync Record' : 'Save Offline Record'}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
