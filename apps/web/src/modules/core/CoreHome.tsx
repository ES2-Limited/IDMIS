import * as React from 'react';
import { Users, Building, UploadCloud, ShieldCheck, KeyRound } from 'lucide-react';
import { StatusChip, Button, Tabs, TabsList, TabsTrigger, TabsContent } from '@idmis/ui';
import { Link } from '@tanstack/react-router';
import { useScope } from '../../shell/ScopeContext';
import { UserManagementView } from './UserManagementView';
import { OrganisationsTreeView } from './OrganisationsTreeView';
import { ImportCenterView } from '../../imports/ImportCenterView';
import { useOrganisations, useWuas, useUsers, useImportBatches, useRoles } from './hooks';

export function CoreHome() {
  const { currentScope } = useScope();
  const [activeTab, setActiveTab] = React.useState('users');

  const { organisations } = useOrganisations();
  const { total: totalWuas, wuas } = useWuas();
  const { total: totalUsers, users } = useUsers();
  const { batches } = useImportBatches();
  const { roles } = useRoles();

  const activeSchemesCount = organisations.filter((o) => o.type === 'scheme').length;
  const userCount = totalUsers ?? users.length;
  const wuaCount = totalWuas || wuas.length;

  const quickStats = [
    {
      label: 'System Users',
      value: `${userCount} Users`,
      sub: `${roles.length} RBAC Roles`,
    },
    {
      label: 'Active Schemes',
      value: `${activeSchemesCount} Schemes`,
      sub: `${organisations.length} Total Units`,
    },
    {
      label: 'Registered WUAs',
      value: `${wuaCount} WUAs`,
      sub: 'Apex, Sector & Unit',
    },
    {
      label: 'Import Batches',
      value: `${batches.length} Batches`,
      sub: 'Audit & Undo Ready',
    },
  ];

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 p-5 sm:p-8 text-white shadow-lg border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-900/60 text-teal-200 border border-teal-500/50 backdrop-blur-sm">
                <ShieldCheck className="h-3.5 w-3.5 text-teal-300" /> Core Admin Engine
              </span>
              <StatusChip status="approved">Security Verified</StatusChip>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Core Administration & Identity
            </h1>
            <p className="text-slate-200 text-xs sm:text-sm max-w-xl leading-relaxed font-medium">
              Manage system permissions, institutional hierarchies, Water User Associations (WUAs),
              and tabular spreadsheet batch imports under active scope{' '}
              <span className="font-semibold text-teal-300">
                {currentScope.name || 'National Scope'}
              </span>
              .
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/core/audit">
              <Button
                variant="outline"
                className="bg-white/20 hover:bg-white/30 text-white font-bold border border-white/40 shadow-xs backdrop-blur-sm text-xs cursor-pointer w-full sm:w-auto"
              >
                <KeyRound className="h-3.5 w-3.5 mr-1.5 text-teal-300" />
                Audit Logs
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
        {quickStats.map((stat, i) => (
          <div
            key={i}
            className="p-3 sm:p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex flex-col justify-between"
          >
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">
              {stat.label}
            </span>
            <div className="mt-1 flex items-baseline justify-between gap-1 flex-wrap">
              <span className="text-sm sm:text-base md:text-lg font-extrabold text-slate-900">
                {stat.value}
              </span>
              <span className="text-[9px] sm:text-[10px] text-teal-700 font-medium">
                {stat.sub}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Admin Module Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5 w-full">
        <div className="w-full overflow-x-auto pb-1 scrollbar-none">
          <TabsList className="bg-slate-100 p-1 rounded-xl border border-slate-200 inline-flex w-full sm:w-auto min-w-max">
            <TabsTrigger
              value="users"
              className="rounded-lg px-3 sm:px-4 py-2 text-xs font-extrabold data-[state=active]:bg-white data-[state=active]:text-teal-800 data-[state=active]:shadow-xs flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer flex-1 sm:flex-initial"
            >
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Users & Roles</span>
            </TabsTrigger>
            <TabsTrigger
              value="organisations"
              className="rounded-lg px-3 sm:px-4 py-2 text-xs font-extrabold data-[state=active]:bg-white data-[state=active]:text-teal-800 data-[state=active]:shadow-xs flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer flex-1 sm:flex-initial"
            >
              <Building className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Organisations & WUAs</span>
            </TabsTrigger>
            <TabsTrigger
              value="imports"
              className="rounded-lg px-3 sm:px-4 py-2 text-xs font-extrabold data-[state=active]:bg-white data-[state=active]:text-teal-800 data-[state=active]:shadow-xs flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer flex-1 sm:flex-initial"
            >
              <UploadCloud className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>Batch Import Center</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="users">
          <UserManagementView />
        </TabsContent>

        <TabsContent value="organisations">
          <OrganisationsTreeView />
        </TabsContent>

        <TabsContent value="imports">
          <ImportCenterView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
