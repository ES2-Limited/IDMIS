import * as React from 'react';
import {
  Users,
  Search,
  UserPlus,
  Smartphone,
  ChevronRight,
  Shield,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@idmis/ui';
import type { AppUserResponse, AssignmentResponse, CreateAppUserInput, CreateAssignmentInput } from '@idmis/contracts';
import { CreateUserDialog } from './CreateUserDialog';
import { EditScopeDialog } from './EditScopeDialog';
import { useToast } from '@idmis/ui';
import { useUsers, useRoles, type UserWithAssignments } from './hooks';

export function UserManagementView() {
  const toast = useToast();
  const [search, setSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [userToEditScope, setUserToEditScope] = React.useState<UserWithAssignments | null>(null);

  const { roles } = useRoles();

  // Modular custom hook for Users
  const {
    users: serverUsers,
    isLoading,
    isFetching: isRefetching,
    refetch,
    createUser,
    isCreating,
    assignScope,
    isAssigningScope,
  } = useUsers({
    limit: 50,
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
  });

  const handleCreateUser = async (data: CreateAppUserInput) => {
    try {
      await createUser(data);
      toast.success('User created successfully');
      setIsCreateOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create user on server';
      toast.error(msg);
    }
  };

  const handleAssignScope = async (data: CreateAssignmentInput) => {
    try {
      await assignScope(data);
      toast.success('Scope assignment updated successfully');
      setUserToEditScope(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update scope assignment';
      toast.error(msg);
      throw err;
    }
  };

  // Pure live data from server
  const activeUsers: UserWithAssignments[] = serverUsers ?? [];

  const filteredUsers = activeUsers.filter((user) => {
    const matchesSearch =
      user.fullName.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      Boolean(user.username && user.username.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus =
      statusFilter === 'all' ? true : statusFilter === 'active' ? user.isActive : !user.isActive;

    const matchesRole =
      roleFilter === 'all'
        ? true
        : Boolean(user.assignments && user.assignments.some((a) => a.roleId === roleFilter));

    return matchesSearch && matchesStatus && matchesRole;
  });

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              User Accounts & Scope Access
            </h2>
            {isLoading && (
              <RefreshCw className="h-4 w-4 animate-spin text-teal-600" aria-label="Loading..." />
            )}
          </div>
          <p className="text-xs text-slate-500">
            RBAC permission roles, state and scheme tenant boundaries, and offline device
            authorizations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-10 text-xs rounded-xl"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-10 rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5 w-full sm:w-auto"
          >
            <UserPlus className="h-4 w-4" />
            Create New User
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar - Full Mobile Responsive */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name, email..."
            className="pl-9 h-10 text-xs border-slate-200 w-full"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
          {/* Role Filter Select */}
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger
              aria-label="Filter by Role"
              className="h-10 min-h-[40px] w-full sm:w-[180px] bg-slate-50 border-slate-200 text-xs font-semibold rounded-xl hover:bg-white hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Shield className="h-3.5 w-3.5 text-teal-700 shrink-0" />
                <SelectValue placeholder="All Roles" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-xl border-slate-200">
              <SelectItem value="all" className="text-xs font-medium py-2">
                All Roles
              </SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id} className="text-xs font-medium py-2">
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter Select */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              aria-label="Filter by Status"
              className="h-10 min-h-[40px] w-full sm:w-[150px] bg-slate-50 border-slate-200 text-xs font-semibold rounded-xl hover:bg-white hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
            >
              <div className="flex items-center gap-1.5 truncate">
                <CheckCircle2 className="h-3.5 w-3.5 text-teal-700 shrink-0" />
                <SelectValue placeholder="All Statuses" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-xl border-slate-200">
              <SelectItem value="all" className="text-xs font-medium py-2">
                All Statuses
              </SelectItem>
              <SelectItem value="active" className="text-xs font-medium py-2">
                Active Only
              </SelectItem>
              <SelectItem value="inactive" className="text-xs font-medium py-2">
                Inactive Only
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Responsive Content: Cards on Mobile, Table on Desktop */}

      {/* 1. Mobile Cards (< md) */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            No users matching criteria
          </div>
        ) : (
          filteredUsers.map((user) => {
            const assignment = user.assignments?.[0];
            return (
              <div
                key={user.id}
                className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{user.fullName}</h3>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      user.isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400 block font-medium">Assigned Role</span>
                    <span className="font-semibold text-slate-700">
                      {assignment
                        ? roles.find((r) => r.id === assignment.roleId)?.name || 'Custom'
                        : 'No Role'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Tenant Scope</span>
                    <span className="font-semibold text-slate-700 capitalize">
                      {assignment?.scopeType || 'None'}
                    </span>
                  </div>
                </div>

                {assignment?.canCaptureOffline && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-teal-700 bg-teal-50/80 px-2.5 py-1 rounded-lg border border-teal-100">
                    <Smartphone className="h-3.5 w-3.5 shrink-0" />
                    <span>Offline PWA Device Authorized</span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setUserToEditScope(user)}
                    className="text-xs text-teal-700 hover:text-teal-800 hover:bg-teal-50 cursor-pointer h-7 px-2"
                  >
                    Edit Scope
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 2. Desktop Table (>= md) */}
      <div className="hidden md:block rounded-2xl bg-white border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">User Identity</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Tenant Scope</th>
                <th className="py-3 px-4 text-center">Offline Capture</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    No users matching criteria
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const assignment = user.assignments?.[0];
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{user.fullName}</div>
                        <div className="text-[11px] text-slate-500">{user.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-700">
                          {assignment
                            ? roles.find((r) => r.id === assignment.roleId)?.name || 'Custom'
                            : 'Unassigned'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 uppercase tracking-wide">
                          {assignment?.scopeType || 'None'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {assignment?.canCaptureOffline ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                            <Smartphone className="h-3 w-3" />
                            Enabled
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            user.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setUserToEditScope(user)}
                          className="text-xs text-teal-700 hover:text-teal-800 hover:bg-teal-50 cursor-pointer"
                        >
                          Edit Scope
                          <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CreateUserDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmitUser={handleCreateUser}
        isLoading={isCreating}
      />

      <EditScopeDialog
        user={userToEditScope}
        open={Boolean(userToEditScope)}
        onOpenChange={(open) => !open && setUserToEditScope(null)}
        onSubmitAssignment={handleAssignScope}
        isLoading={isAssigningScope}
      />
    </div>
  );
}
