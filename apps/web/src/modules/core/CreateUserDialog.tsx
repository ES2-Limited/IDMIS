import * as React from 'react';
import { type CreateAppUserInput } from '@idmis/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
} from '@idmis/ui';
import { AssignmentEditor, type AssignmentFormData } from './AssignmentEditor';
import { mockRoles } from '../../mocks/coreData';
import { useGeography } from './hooks';

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitUser: (data: CreateAppUserInput) => void;
  isLoading?: boolean;
}

export function CreateUserDialog({ open, onOpenChange, onSubmitUser, isLoading }: UserDialogProps) {
  const { states } = useGeography();
  const [assignment, setAssignment] = React.useState<AssignmentFormData>({
    roleId: mockRoles[1]?.id ?? '018f3a5e-0000-7000-8000-000000000021',
    module: 'slis',
    scopeType: 'state',
    scopeStateId: null,
    scopeOrgId: null,
    canCaptureOffline: true,
    validFromOn: new Date().toISOString().split('T')[0],
    validToOn: null,
  });

  // Keep scopeStateId in sync with loaded states when state-scoped
  React.useEffect(() => {
    if (states.length > 0 && assignment.scopeType === 'state' && !assignment.scopeStateId) {
      setAssignment((prev) => ({
        ...prev,
        scopeStateId: states[0]?.id ?? null,
      }));
    }
  }, [states, assignment.scopeType, assignment.scopeStateId]);

  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('TemporaryPassword123!');
  const [formError, setFormError] = React.useState<string | null>(null);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setFormError('Full name is required');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setFormError('Valid email address is required');
      return;
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long');
      return;
    }

    setFormError(null);
    onSubmitUser({
      fullName: fullName.trim(),
      email: email.trim(),
      username: username.trim() || undefined,
      phone: phone.trim() || undefined,
      password,
      isActive: true,
      firstAssignment: {
        roleId: assignment.roleId,
        module: assignment.module,
        scopeType: assignment.scopeType,
        scopeStateId: assignment.scopeStateId,
        scopeOrgId: assignment.scopeOrgId,
        canCaptureOffline: assignment.canCaptureOffline,
        validFromOn: assignment.validFromOn,
        validToOn: assignment.validToOn,
      },
    });

    setFullName('');
    setEmail('');
    setUsername('');
    setPhone('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-slate-900 tracking-tight">
            Create System User & Initial Assignment
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Create user credentials, assign granular RBAC module roles, and restrict data scope
            boundaries (Deny-by-default).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleFormSubmit} className="space-y-6 mt-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {formError}
            </div>
          )}

          {/* Identity Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Full Name *</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Dr. Amina Bello"
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Official Email *</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="e.g. amina.bello@triming.gov.ng"
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Username (Optional)</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. amina.bello"
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Phone Number (Optional)</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +234 803 123 4567"
                className="h-10 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Temporary Password *</label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="text"
              className="h-10 text-xs font-mono bg-slate-50"
            />
            <p className="text-[10px] text-slate-400">
              User will be forced to change this password and register TOTP 2FA on their first
              sign-in.
            </p>
          </div>

          {/* First Assignment Matrix */}
          <div className="pt-4 border-t border-slate-200">
            <h4 className="text-sm font-extrabold text-slate-900 mb-3">
              Initial Role & Scope Assignment
            </h4>
            <AssignmentEditor value={assignment} onChange={setAssignment} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold cursor-pointer"
            >
              {isLoading ? 'Creating User...' : 'Create User & Assign Scope'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
