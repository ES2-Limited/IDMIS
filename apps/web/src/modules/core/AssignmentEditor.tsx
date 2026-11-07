import * as React from 'react';
import { Shield, Eye, CheckCircle2, Building, MapPin, Smartphone, Globe } from 'lucide-react';
import {
  Badge,
  Switch,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@idmis/ui';
import type { ModuleKey, ScopeType } from '@idmis/contracts';
import { mockOrganisations, mockRoles } from '../../mocks/coreData';

export interface AssignmentFormData {
  roleId: string;
  module: ModuleKey;
  scopeType: ScopeType;
  scopeStateId: string | null;
  scopeOrgId: string | null;
  canCaptureOffline: boolean;
  validFromOn: string | null;
  validToOn: string | null;
}

interface AssignmentEditorProps {
  value: AssignmentFormData;
  onChange: (value: AssignmentFormData) => void;
  disabled?: boolean;
}

export function AssignmentEditor({ value, onChange, disabled }: AssignmentEditorProps) {
  const selectedRole = mockRoles.find((r) => r.id === value.roleId) || mockRoles[0];

  const handleRoleChange = (roleId: string) => {
    onChange({ ...value, roleId });
  };

  const handleModuleChange = (module: ModuleKey) => {
    onChange({ ...value, module });
  };

  const handleScopeTypeChange = (scopeType: ScopeType) => {
    onChange({
      ...value,
      scopeType,
      scopeStateId: scopeType === 'state' ? '018f3a70-0001-7000-8000-000000000001' : null,
      scopeOrgId: ['rbda', 'scheme', 'sector'].includes(scopeType)
        ? (mockOrganisations[0]?.id ?? null)
        : null,
    });
  };

  // Live simulation of what the user can see based on chosen assignment
  const getSimulatedAccessPreview = () => {
    switch (value.scopeType) {
      case 'national':
        return {
          scopeSummary: 'All 36 States & FCT (Full Federal Command)',
          schemesVisible: '5 National Schemes (KRIS, BIS, HVIP, Dadin Kowa, Bakolori)',
          badgeColor: 'teal',
        };
      case 'state':
        return {
          scopeSummary: 'Kano State Ministry jurisdiction',
          schemesVisible: 'Kano River Scheme (KRIS) & Watari Schemes only',
          badgeColor: 'blue',
        };
      case 'rbda':
        return {
          scopeSummary: 'Hadejia-Jama’are RBDA Command Area',
          schemesVisible: 'KRIS & Hadejia Valley Projects',
          badgeColor: 'amber',
        };
      case 'scheme':
        return {
          scopeSummary: 'Kano River Irrigation Scheme (KRIS) Perimeter',
          schemesVisible: 'Kadawa, Kura & Bunkure Sectors only',
          badgeColor: 'emerald',
        };
      case 'sector':
        return {
          scopeSummary: 'KRIS Sector 4 Distributary Reach',
          schemesVisible: 'Turnouts 1–18 and local field parcels only',
          badgeColor: 'slate',
        };
    }
  };

  const preview = getSimulatedAccessPreview();

  return (
    <div className="space-y-6">
      {/* Role Selection */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-teal-700" />
          System Role
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {mockRoles.map((role) => {
            const isSelected = value.roleId === role.id;
            return (
              <button
                type="button"
                key={role.id}
                disabled={disabled}
                onClick={() => handleRoleChange(role.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-extrabold text-slate-900">{role.name}</span>
                    {role.isSystem && <Badge variant="secondary">System</Badge>}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                    {role.description}
                  </p>
                </div>
                {isSelected && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-teal-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Selected
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Target Module */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Target System Module
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['core', 'slis', 'me', 'blis'] as ModuleKey[]).map((m) => {
            const isSelected = value.module === m;
            return (
              <button
                type="button"
                key={m}
                disabled={disabled}
                onClick={() => handleModuleChange(m)}
                className={`h-11 rounded-xl font-bold text-xs uppercase border transition-all cursor-pointer flex items-center justify-center ${
                  isSelected
                    ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scope Level (Deny by default) */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-teal-700" />
          Authority Scope Boundary
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(['national', 'state', 'rbda', 'scheme', 'sector'] as ScopeType[]).map((st) => {
            const isSelected = value.scopeType === st;
            return (
              <button
                type="button"
                key={st}
                disabled={disabled}
                onClick={() => handleScopeTypeChange(st)}
                className={`h-10 rounded-xl font-bold text-xs capitalize border transition-all cursor-pointer flex items-center justify-center ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {st}
              </button>
            );
          })}
        </div>
      </div>

      {/* Specific Target Org if RBDA / Scheme / Sector with Radix Select */}
      {['rbda', 'scheme', 'sector'].includes(value.scopeType) && (
        <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-1">
            <Building className="h-3.5 w-3.5 text-slate-500" />
            Specific Organisation / Unit
          </label>
          <Select
            value={value.scopeOrgId || mockOrganisations[0]?.id || ''}
            onValueChange={(val) => onChange({ ...value, scopeOrgId: val })}
            disabled={disabled}
          >
            <SelectTrigger className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-2xs hover:border-teal-600 transition-all cursor-pointer">
              <SelectValue placeholder="Choose organisation unit" />
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-xl border-slate-200">
              {mockOrganisations
                .filter((o) => (value.scopeType === 'rbda' ? o.type === 'rbda' : true))
                .map((org) => (
                  <SelectItem key={org.id} value={org.id} className="text-xs font-medium py-2">
                    [{org.code}] {org.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Specific State if state-scoped with Radix Select */}
      {value.scopeType === 'state' && (
        <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-1">
            <MapPin className="h-3.5 w-3.5 text-slate-500" />
            Assigned State Jurisdiction
          </label>
          <Select
            value={value.scopeStateId || '018f3a70-0001-7000-8000-000000000001'}
            onValueChange={(val) => onChange({ ...value, scopeStateId: val })}
            disabled={disabled}
          >
            <SelectTrigger className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-2xs hover:border-teal-600 transition-all cursor-pointer">
              <SelectValue placeholder="Choose state" />
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-xl border-slate-200">
              <SelectItem
                value="018f3a70-0001-7000-8000-000000000001"
                className="text-xs font-medium py-2"
              >
                Kano State
              </SelectItem>
              <SelectItem
                value="018f3a70-0002-7000-8000-000000000002"
                className="text-xs font-medium py-2"
              >
                Jigawa State
              </SelectItem>
              <SelectItem
                value="018f3a70-0003-7000-8000-000000000003"
                className="text-xs font-medium py-2"
              >
                Zamfara State
              </SelectItem>
              <SelectItem
                value="018f3a70-0004-7000-8000-000000000004"
                className="text-xs font-medium py-2"
              >
                Sokoto State
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Offline Capture Capability */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-teal-700" />
            <span className="text-xs font-extrabold text-slate-900">
              Offline Field Capture Allowed
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Enables IndexedDB local storage and field capture forms when disconnected from network.
          </p>
        </div>
        <Switch
          checked={value.canCaptureOffline}
          onCheckedChange={(checked) => onChange({ ...value, canCaptureOffline: checked })}
          disabled={disabled}
        />
      </div>

      {/* Live Preview Box */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-teal-950 text-white shadow-md border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            Live User Visibility Preview
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-teal-950/80 border border-teal-500/40 font-bold uppercase text-teal-200">
            {value.module} Module
          </span>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-start justify-between text-slate-300">
            <span className="text-slate-400">Effective Scope:</span>
            <span className="font-bold text-white text-right">{preview.scopeSummary}</span>
          </div>
          <div className="flex items-start justify-between text-slate-300">
            <span className="text-slate-400">Data Visibility:</span>
            <span className="font-medium text-teal-200 text-right">{preview.schemesVisible}</span>
          </div>
          <div className="flex items-center justify-between text-slate-300 pt-1 border-t border-white/10">
            <span className="text-slate-400">Permissions Granted:</span>
            <span className="font-mono text-[11px] text-amber-300">
              {selectedRole.permissions.join(', ')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
