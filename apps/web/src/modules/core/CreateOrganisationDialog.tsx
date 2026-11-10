import * as React from 'react';
import { type CreateOrganisationInput, type OrgType } from '@idmis/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@idmis/ui';
import { useGeography } from './hooks';

interface CreateOrganisationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitOrg: (data: CreateOrganisationInput) => Promise<unknown>;
  parentOrganisations: Array<{ id: string; name: string; code: string; type: string }>;
  defaultParentId?: string | null;
  defaultType?: OrgType;
  isLoading?: boolean;
}

export function CreateOrganisationDialog({
  open,
  onOpenChange,
  onSubmitOrg,
  parentOrganisations,
  defaultParentId,
  defaultType,
  isLoading,
}: CreateOrganisationDialogProps) {
  const { states } = useGeography();
  const [type, setType] = React.useState<OrgType>(defaultType ?? 'rbda');
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [shortName, setShortName] = React.useState('');
  const [parentId, setParentId] = React.useState<string | null>(defaultParentId ?? null);
  const [selectedStateId, setSelectedStateId] = React.useState<string>('');
  const [address, setAddress] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [irrigableAreaHa, setIrrigableAreaHa] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      if (defaultType) setType(defaultType);
      if (defaultParentId !== undefined) setParentId(defaultParentId);
    }
  }, [open, defaultType, defaultParentId]);

  React.useEffect(() => {
    if (states.length > 0 && !selectedStateId) {
      setSelectedStateId(states[0].id);
    }
  }, [states, selectedStateId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Organisation name is required');
      return;
    }
    if (!code.trim()) {
      setFormError('Organisation code is required');
      return;
    }

    setFormError(null);
    try {
      await onSubmitOrg({
        type,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        shortName: shortName.trim() || undefined,
        parentId: parentId || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        irrigableAreaHa: irrigableAreaHa.trim() || undefined,
        isActive: true,
        stateIds: selectedStateId ? [selectedStateId] : [],
      });

      setName('');
      setCode('');
      setShortName('');
      setAddress('');
      setPhone('');
      setEmail('');
      setIrrigableAreaHa('');
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create organisation');
    }
  };

  // Filter possible parents according to hierarchy
  const availableParents = parentOrganisations.filter((o) => {
    if (type === 'scheme') return o.type === 'rbda';
    if (type === 'sector') return o.type === 'scheme';
    return false;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-slate-900 tracking-tight">
            Add New Organisation Unit
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Create an institutional command node: RBDA headquarters, irrigation scheme perimeter, or sector.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Organisation Type</label>
              <Select
                value={type}
                onValueChange={(val) => {
                  setType(val as OrgType);
                  setParentId(null);
                }}
              >
                <SelectTrigger className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl">
                  <SelectItem value="rbda" className="text-xs">River Basin Authority (RBDA)</SelectItem>
                  <SelectItem value="scheme" className="text-xs">Irrigation Scheme</SelectItem>
                  <SelectItem value="sector" className="text-xs">Scheme Sector / Zone</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Assigned State Jurisdiction</label>
              <Select value={selectedStateId} onValueChange={setSelectedStateId}>
                <SelectTrigger className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium">
                  <SelectValue placeholder="Choose State" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl max-h-60 overflow-y-auto">
                  {states.map((st) => (
                    <SelectItem key={st.id} value={st.id} className="text-xs">
                      {st.name} ({st.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {['scheme', 'sector'].includes(type) && (
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">
                Parent {type === 'scheme' ? 'RBDA' : 'Scheme'}
              </label>
              <Select value={parentId || ''} onValueChange={(val) => setParentId(val || null)}>
                <SelectTrigger className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium">
                  <SelectValue placeholder={`Select parent ${type === 'scheme' ? 'RBDA' : 'Scheme'}`} />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl">
                  {availableParents.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      [{p.code}] {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-slate-700 mb-1 block">Organisation Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Hadejia-Jama'are River Basin Dev Authority"
                className="h-10 text-xs rounded-xl"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Unique Code *</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. HJRBDA"
                className="h-10 text-xs rounded-xl uppercase"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Short Name / Acronym</label>
              <Input
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="e.g. HJRBDA"
                className="h-10 text-xs rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Irrigable Area (Hectares)</label>
              <Input
                type="number"
                step="0.01"
                value={irrigableAreaHa}
                onChange={(e) => setIrrigableAreaHa(e.target.value)}
                placeholder="e.g. 25000.00"
                className="h-10 text-xs rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <label className="text-xs font-bold text-slate-700 mb-1 block">Physical Address</label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="HQ Address, City, State"
                className="h-10 text-xs rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 mb-1 block">Contact Phone</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234..."
                className="h-10 text-xs rounded-xl"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-slate-700 mb-1 block">Official Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@organisation.gov.ng"
                className="h-10 text-xs rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 text-xs font-semibold rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-10 rounded-xl"
            >
              {isLoading ? 'Creating...' : 'Create Organisation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

