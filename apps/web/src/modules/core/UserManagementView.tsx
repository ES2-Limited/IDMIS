import * as React from 'react';
import {
  Users,
  Search,
  UserPlus,
  Smartphone,
  ChevronRight,
  Shield,
  CheckCircle2,
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
import type { CreateAppUserInput } from '@idmis/contracts';
import { mockUsers, mockRoles } from '../../mocks/coreData';
import { CreateUserDialog } from './CreateUserDialog';

export function UserManagementView() {
  const [users, setUsers] = React.useState(mockUsers);
  const [search, setSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.fullName.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      (user.username && user.username.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus =
      statusFilter === 'all' ? true : statusFilter === 'active' ? user.isActive : !user.isActive;

    const matchesRole =
      roleFilter === 'all' ? true : user.assignments.some((a) => a.roleId === roleFilter);

    return matchesSearch && matchesStatus && matchesRole;
  });

  const handleCreateUser = (data: CreateAppUserInput) => {
    const newUser = {
      id: `018f3a80-${Date.now().toString().slice(-4)}-7000-8000-000000000000`,
      email: data.email,
      username: data.username || null,
      fullName: data.fullName,
      phone: data.phone || null,
      isActive: true,
      mustChangePassword: true,
      failedSignIns: 0,
      lockedUntil: null,
      lastSignInAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      assignments: data.firstAssignment
        ? [
            {
              id: `018f3a90-${Date.now().toString().slice(-4)}-7000-8000-000000000000`,
              userId: `018f3a80-${Date.now().toString().slice(-4)}-7000-8000-000000000000`,
              roleId: data.firstAssignment.roleId,
              module: data.firstAssignment.module,
              scopeType: data.firstAssignment.scopeType,
              scopeStateId: data.firstAssignment.scopeStateId ?? null,
              scopeOrgId: data.firstAssignment.scopeOrgId ?? null,
              canCaptureOffline: data.firstAssignment.canCaptureOffline ?? false,
              validFromOn: data.firstAssignment.validFromOn ?? null,
              validToOn: data.firstAssignment.validToOn ?? null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              version: 1,
            },
          ]
        : [],
    };

    setUsers([newUser, ...users]);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            User Accounts & Scope Access
          </h2>
          <p className="text-xs text-slate-500">
            RBAC permission roles, state and scheme tenant boundaries, and offline device
            authorizations.
          </p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-10 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
        >
          <UserPlus className="h-4 w-4" />
          Create New User
        </Button>
      </div>

      {/* Filter & Search Bar with Radix Select Dropdowns (Matches Header Style) */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by full name, email, or username..."
            className="pl-9 h-10 text-xs border-slate-200 w-full"
          />
        </div>

        <div className="flex items-center gap-2.5">
          {/* Role Filter Select */}
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger
              aria-label="Filter by Role"
              className="h-10 min-h-[40px] w-[180px] bg-slate-50 border-slate-200 text-xs font-semibold rounded-xl hover:bg-white hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
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
              {mockRoles.map((r) => (
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
              className="h-10 min-h-[40px] w-[150px] bg-slate-50 border-slate-200 text-xs font-semibold rounded-xl hover:bg-white hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
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

      {/* Tabular User List */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">User Details</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Assigned Role & Module</th>
                <th className="py-3.5 px-4">Scope Level</th>
                <th className="py-3.5 px-4">Offline Access</th>
                <th className="py-3.5 px-4">Last Active</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    No users matching criteria
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const assignment = user.assignments[0];
                  const role = mockRoles.find((r) => r.id === assignment?.roleId);

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-teal-50/30 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-teal-100 text-teal-800 font-black flex items-center justify-center text-xs">
                            {user.fullName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900">{user.fullName}</div>
                            <div className="text-[11px] text-slate-400">{user.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {user.isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Inactive
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {role ? (
                          <div className="space-y-0.5">
                            <span className="font-bold text-slate-800">{role.name}</span>
                            <div className="text-[10px] uppercase font-black tracking-wider text-teal-700">
                              {assignment.module} module
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No active role</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {assignment ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold capitalize bg-slate-100 text-slate-800">
                            {assignment.scopeType}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {assignment?.canCaptureOffline ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700">
                            <Smartphone className="h-3.5 w-3.5" /> Enabled
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Online Only</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {user.lastSignInAt
                          ? new Date(user.lastSignInAt).toLocaleDateString()
                          : 'Never'}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0 cursor-pointer text-slate-500 hover:text-slate-900"
                        >
                          <ChevronRight className="h-4 w-4" />
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

      {/* Create User Dialog */}
      <CreateUserDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmitUser={handleCreateUser}
      />
    </div>
  );
}
