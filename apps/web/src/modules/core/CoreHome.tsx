import * as React from 'react';
import { Users, Building, ShieldCheck, KeyRound } from 'lucide-react';
import { StatusChip, Button, Tabs, TabsList, TabsTrigger, TabsContent } from '@idmis/ui';
import { useScope } from '../../shell/ScopeContext';
import { UserManagementView } from './UserManagementView';
import { OrganisationsTreeView } from './OrganisationsTreeView';

export function CoreHome() {
  const { currentScope } = useScope();
  const [activeTab, setActiveTab] = React.useState('users');

  const quickStats = [
    { label: 'System RBAC Roles', value: '14 Roles', sub: 'Deny-by-default' },
    { label: 'Active Schemes', value: '5 Schemes', sub: 'Kano, Bakolori, Hadejia...' },
    { label: 'Outbox Event Queue', value: 'Healthy', sub: 'Zero backlog' },
    { label: 'Audit Trail', value: '100% Logged', sub: 'Immutable records' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 p-6 sm:p-8 text-white shadow-lg border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                <ShieldCheck className="h-3 w-3" /> Core Admin Engine
              </span>
              <StatusChip status="approved">Security Verified</StatusChip>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Core Administration & Identity
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm max-w-xl leading-relaxed">
              Manage system permissions, institutional hierarchies, Water User Associations (WUAs),
              and tabular spreadsheet batch imports under active scope{' '}
              <span className="font-semibold text-teal-300">
                {currentScope.name || 'National Scope'}
              </span>
              .
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-semibold cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5 mr-1.5 text-teal-400" />
              Audit Logs
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {quickStats.map((stat, i) => (
          <div
            key={i}
            className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between"
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {stat.label}
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-base sm:text-lg font-extrabold text-slate-900">
                {stat.value}
              </span>
              <span className="text-[10px] text-teal-700 font-medium">{stat.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Admin Module Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl border border-slate-200 inline-flex">
          <TabsTrigger
            value="users"
            className="rounded-lg px-4 py-2 text-xs font-extrabold data-[state=active]:bg-white data-[state=active]:text-teal-800 data-[state=active]:shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <Users className="h-4 w-4" />
            User Management & Roles
          </TabsTrigger>
          <TabsTrigger
            value="organisations"
            className="rounded-lg px-4 py-2 text-xs font-extrabold data-[state=active]:bg-white data-[state=active]:text-teal-800 data-[state=active]:shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <Building className="h-4 w-4" />
            Organisations & WUAs Tree
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UserManagementView />
        </TabsContent>

        <TabsContent value="organisations">
          <OrganisationsTreeView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
