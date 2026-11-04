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
} from '@idmis/ui';
import { CreateFarmerInputSchema, type CreateFarmerInput, type SlisGender } from '@idmis/contracts';
import { generateUuidV7, localDb, LocalStore, compressFieldPhoto } from '@idmis/sync';
import { useScope } from '../../../shell/ScopeContext';
import { registerDirtyFormCheck } from '../../../pwa';

export interface IdentityDocItem {
  id: string;
  type: string; // 'NIN' | 'BVN' | 'voter_card' | 'bank_account' | 'drivers_licence' | 'other'
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
  const store = React.useMemo(() => new LocalStore(localDb), []);

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
    birthYear: 1985,
    phone: '',

    // Step 2: Household
    maritalStatus: 'married',
    householdSize: 6,
    dependents: 4,
    nextOfKinName: '',
    nextOfKinPhone: '',
    nextOfKinRelation: 'Spouse',

    // Step 3: Location
    stateId: '018f3a70-0001-7000-8000-000000000001', // Kano
    lga: 'Kura',
    wardId: '018f3a70-0002-7000-8000-000000000001',
    village: 'Dan Hassan',
    latitude: 11.7584,
    longitude: 8.4289,

    // Step 4: WUA & Group
    schemeId: currentScope.id || '018f3a70-0003-7000-8000-000000000001',
    sectorId: '018f3a70-0004-7000-8000-000000000001',
    unitWuaId: '018f3a70-0005-7000-8000-000000000001',
    farmerGroupId: '',

    // Step 5: Documents
    identities: [
      {
        id: generateUuidV7(),
        type: 'NIN',
        number: '',
        bankName: '',
      },
    ] as IdentityDocItem[],

    // Step 6: Photos
    portraitPhoto: null as File | null,
    portraitPreview: null as string | null,
  });

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
      if (!formData.village.trim()) newErrors.village = 'Village name is required';
    }

    if (step === 5) {
      for (const doc of formData.identities) {
        if (doc.type === 'NIN' && doc.number && !/^\d{11}$/.test(doc.number)) {
          newErrors.nin = 'NIN must be exactly 11 digits';
        }
        if (doc.type === 'BVN' && doc.number && !/^\d{11}$/.test(doc.number)) {
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
          type: 'voter_card',
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

  // Final Submission to Offline Outbox
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const farmerId = generateUuidV7();
      const farmerCode = `NG-KRIS-${Math.floor(100000 + Math.random() * 900000)}`;

      const payload: CreateFarmerInput = {
        id: farmerId,
        schemeId: formData.schemeId,
        sectorId: formData.sectorId || undefined,
        farmerCode,
        firstName: formData.firstName,
        lastName: formData.lastName,
        otherNames: formData.otherNames || undefined,
        gender: formData.gender,
        birthYear: Number(formData.birthYear) || undefined,
        phone: formData.phone || undefined,
        village: formData.village || undefined,
        wardId: formData.wardId || undefined,
        unitWuaId: formData.unitWuaId || undefined,
        farmerGroupId: formData.farmerGroupId || undefined,
        maritalStatusId: formData.maritalStatus ? generateUuidV7() : undefined,
        nextOfKinName: formData.nextOfKinName || undefined,
        nextOfKinPhone: formData.nextOfKinPhone || undefined,
        nextOfKinRelation: formData.nextOfKinRelation || undefined,
        location: {
          type: 'Point',
          coordinates: [formData.longitude, formData.latitude],
        },
        identities: formData.identities
          .filter((d) => d.number.trim().length > 0)
          .map((d) => ({
            id: d.id,
            documentTypeId: generateUuidV7(),
            number: d.number,
            bankName: d.bankName || undefined,
          })),
      };

      // Strict contract validation
      CreateFarmerInputSchema.parse(payload);

      // Save to device Dexie outbox
      await store.commitInsert('farmer', farmerId, payload as unknown as Record<string, unknown>, {
        schemeId: formData.schemeId,
        stateId: formData.stateId,
      });

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

      // Navigate to field records view
      navigate({ to: '/field/records' });
    } catch (err) {
      console.error('Farmer registration error:', err);
      alert(`Submission failed: ${String(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <Badge
          variant="outline"
          className="bg-emerald-50 text-emerald-800 border-emerald-300 text-xs"
        >
          Autosaved on Device
        </Badge>
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
                    placeholder="e.g. Abubakar"
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
                    placeholder="e.g. Danbatta"
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
                    placeholder="Middle name"
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
                    min={1920}
                    max={2015}
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
                    value={formData.maritalStatus}
                    onValueChange={(val) => setFormData({ ...formData, maritalStatus: val })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="married">Married</SelectItem>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="widowed">Widowed</SelectItem>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">State / LGA</label>
                  <Input value="Kano / Kura LGA" disabled className="bg-slate-50 text-slate-600" />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Village / Settlement *
                  </label>
                  <Input
                    placeholder="e.g. Dan Hassan"
                    value={formData.village}
                    onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                    className={errors.village ? 'border-rose-500' : ''}
                  />
                  {errors.village && <p className="text-[11px] text-rose-600">{errors.village}</p>}
                </div>
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
                          },
                          (err) => alert(`GPS unavailable: ${err.message}`),
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
                  <Input
                    value="Kano River Irrigation Scheme (KRIS)"
                    disabled
                    className="bg-slate-50 text-slate-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Distributary Sector
                  </label>
                  <Select
                    value={formData.sectorId}
                    onValueChange={(val) => setFormData({ ...formData, sectorId: val })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sector" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="018f3a70-0004-7000-8000-000000000001">
                        Sector B4 (Western Main)
                      </SelectItem>
                      <SelectItem value="018f3a70-0004-7000-8000-000000000002">
                        Sector A2 (Kura Branch)
                      </SelectItem>
                      <SelectItem value="018f3a70-0004-7000-8000-000000000003">
                        Sector C1 (Eastern Lateral)
                      </SelectItem>
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
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="WUA Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="018f3a70-0005-7000-8000-000000000001">
                        Galadima WUA Cluster 3
                      </SelectItem>
                      <SelectItem value="018f3a70-0005-7000-8000-000000000002">
                        Danbatta Apex WUA 1
                      </SelectItem>
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
                          <SelectItem value="NIN">National Identity Number (NIN)</SelectItem>
                          <SelectItem value="BVN">Bank Verification Number (BVN)</SelectItem>
                          <SelectItem value="voter_card">INEC Voter's Card</SelectItem>
                          <SelectItem value="bank_account">Commercial Bank Account</SelectItem>
                          <SelectItem value="drivers_licence">Driver's Licence</SelectItem>
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
                        Compressed client-side to ~1600px for offline efficiency.
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
                    {formData.firstName} {formData.lastName}
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
                    {formData.village} ({formData.latitude.toFixed(4)},{' '}
                    {formData.longitude.toFixed(4)})
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">WUA / Scheme:</span>
                  <span className="font-semibold text-slate-800">
                    Galadima WUA · KRIS Western Branch
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Identity Docs:</span>
                  <span className="font-semibold text-teal-800">
                    {formData.identities.filter((d) => d.number).length} document(s) attached
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200 text-teal-900 text-xs">
                <span className="font-bold">Offline Storage Guarantee: </span>
                Clicking submit saves this record directly to your device's offline Dexie database
                with an outbox mutation op. It will automatically synchronize when internet returns.
              </div>
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
                {isSubmitting ? 'Saving Offline...' : 'Submit & Save Record'}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
