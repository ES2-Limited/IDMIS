import * as React from 'react';
import { type CreateWuaInput, type WuaLevel } from '@idmis/contracts';
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
  Switch,
} from '@idmis/ui';

interface CreateWuaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitWua: (data: CreateWuaInput) => Promise<unknown>;
  organisationId: string;
  organisationName: string;
  isLoading?: boolean;
}

export function CreateWuaDialog({
  open,
  onOpenChange,
  onSubmitWua,
  organisationId,
  organisationName,
  isLoading,
}: CreateWuaDialogProps) {
  const [level, setLevel] = React.useState<WuaLevel>('unit');
  const [name, setName] = React.useState('');
  const [regNo, setRegNo] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [bankName, setBankName] = React.useState('');
  const [bankAccountNumber, setBankAccountNumber] = React.useState('');
  const [isOperational, setIsOperational] = React.useState(true);
  const [hasMaintenanceFund, setHasMaintenanceFund] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('WUA Name is required');
      return;
    }

    if (bankAccountNumber && (bankAccountNumber.length < 10 || bankAccountNumber.length > 20)) {
      setFormError('Bank Account Number must be between 10 and 20 digits');
      return;
    }

    try {
      await onSubmitWua({
        name: name.trim(),
        level,
        organisationId,
        regNo: regNo.trim() || undefined,
        address: address.trim() || undefined,
        bankName: bankName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        isOperational,
        hasMaintenanceFund,
      });

      // Reset form
      setName('');
      setRegNo('');
      setAddress('');
      setBankName('');
      setBankAccountNumber('');
      setIsOperational(true);
      setHasMaintenanceFund(false);
      onOpenChange(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create Water User Association');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-slate-900 tracking-tight">
            Attach Water User Association
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Register and link a WUA directly to{' '}
            <span className="font-semibold text-teal-700">{organisationName}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {formError}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">WUA Level</label>
            <Select value={level} onValueChange={(val) => setLevel(val as WuaLevel)}>
              <SelectTrigger className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl shadow-xl">
                <SelectItem value="apex" className="text-xs">Apex WUA (Scheme-Wide Federation)</SelectItem>
                <SelectItem value="sector" className="text-xs">Sector WUA (Distributary Reach)</SelectItem>
                <SelectItem value="unit" className="text-xs">Unit WUA (Watercourse / Field Level)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Association Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kadawa North Water Users Association"
              className="h-10 text-xs rounded-xl border-slate-200"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Registration Number</label>
            <Input
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              placeholder="e.g. WUA/KRIS/2024/016"
              className="h-10 text-xs rounded-xl border-slate-200 font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Bank Name</label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. First Bank of Nigeria"
                className="h-10 text-xs rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Bank Account Number</label>
              <Input
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="10-digit NUBAN"
                className="h-10 text-xs rounded-xl border-slate-200 font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 block">Contact / Physical Address</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Sector 4 Office, Kadawa Village"
              className="h-10 text-xs rounded-xl border-slate-200"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-col gap-2.5">
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer">
              <span>Operational Status</span>
              <Switch checked={isOperational} onCheckedChange={setIsOperational} />
            </label>
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer">
              <span>Maintenance Fund Established</span>
              <Switch checked={hasMaintenanceFund} onCheckedChange={setHasMaintenanceFund} />
            </label>
          </div>

          <DialogFooter className="pt-3 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="h-10 text-xs rounded-xl font-bold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="h-10 text-xs rounded-xl font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer"
            >
              {isLoading ? 'Attaching WUA...' : 'Attach WUA'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

