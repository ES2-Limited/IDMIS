import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@idmis/ui';
import type { CreateAssignmentInput } from '@idmis/contracts';
import { AssignmentEditor, type AssignmentFormData } from './AssignmentEditor';
import type { UserWithAssignments } from './hooks/useUsers';

interface EditScopeDialogProps {
  user: UserWithAssignments | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitAssignment: (data: CreateAssignmentInput) => Promise<unknown>;
  isLoading?: boolean;
}

export function EditScopeDialog({
  user,
  open,
  onOpenChange,
  onSubmitAssignment,
  isLoading,
}: EditScopeDialogProps) {
  const currentAssignment = user?.assignments?.[0];

  const [assignment, setAssignment] = React.useState<AssignmentFormData>({
    roleId: currentAssignment?.roleId ?? '018f3a5e-0000-7000-8000-000000000021',
    module: (currentAssignment?.module as 'core' | 'slis' | 'me' | 'blis') ?? 'slis',
    scopeType:
      (currentAssignment?.scopeType as 'national' | 'state' | 'rbda' | 'scheme' | 'sector') ??
      'national',
    scopeStateId: currentAssignment?.scopeStateId ?? null,
    scopeOrgId: currentAssignment?.scopeOrgId ?? null,
    canCaptureOffline: currentAssignment?.canCaptureOffline ?? false,
    validFromOn: currentAssignment?.validFromOn ?? new Date().toISOString().split('T')[0],
    validToOn: currentAssignment?.validToOn ?? null,
  });

  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (user && open) {
      const active = user.assignments?.[0];
      setAssignment({
        roleId: active?.roleId ?? '018f3a5e-0000-7000-8000-000000000021',
        module: (active?.module as 'core' | 'slis' | 'me' | 'blis') ?? 'slis',
        scopeType:
          (active?.scopeType as 'national' | 'state' | 'rbda' | 'scheme' | 'sector') ?? 'national',
        scopeStateId: active?.scopeStateId ?? null,
        scopeOrgId: active?.scopeOrgId ?? null,
        canCaptureOffline: active?.canCaptureOffline ?? false,
        validFromOn: active?.validFromOn ?? new Date().toISOString().split('T')[0],
        validToOn: active?.validToOn ?? null,
      });
      setError(null);
    }
  }, [user, open]);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await onSubmitAssignment({
        userId: user.id,
        roleId: assignment.roleId,
        module: assignment.module,
        scopeType: assignment.scopeType,
        scopeStateId: assignment.scopeStateId,
        scopeOrgId: assignment.scopeOrgId,
        canCaptureOffline: assignment.canCaptureOffline,
        validFromOn: assignment.validFromOn || undefined,
        validToOn: assignment.validToOn || undefined,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update user scope assignment');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-slate-900 tracking-tight">
            Edit Scope & Role Assignment
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Modify institutional access boundary and RBAC permissions for{' '}
            <span className="font-semibold text-teal-800">{user.fullName}</span> ({user.email}).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-3">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {error}
            </div>
          )}

          <AssignmentEditor value={assignment} onChange={setAssignment} disabled={isLoading} />

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
              {isLoading ? 'Updating Scope...' : 'Save Scope Assignment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
