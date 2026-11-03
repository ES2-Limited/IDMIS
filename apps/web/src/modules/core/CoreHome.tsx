import { Users, Building, UploadCloud, ShieldCheck, ArrowUpRight, KeyRound } from 'lucide-react';
import { Card, StatusChip, Button } from '@idmis/ui';
import { Link } from '@tanstack/react-router';
import { useScope } from '../../shell/ScopeContext';

export function CoreHome() {
  const { currentScope } = useScope();

  const coreSections = [
    {
      title: 'User Management & Roles',
      description:
        'System accounts, RBAC permission roles, officer field badges, and scope boundaries.',
      stats: '1,420 Active Users',
      statLabel: '98 Field Officers',
      icon: Users,
      badge: 'RBAC Active',
      badgeStatus: 'approved' as const,
      color: 'teal',
      features: [
        'Role assignments',
        'Biometric & TOTP MFA',
        'Scheme scoping',
        'Deactivation audit',
      ],
      linkText: 'Manage Users',
      to: '/core',
    },
    {
      title: 'Organisations & WUAs',
      description:
        'River Basin Development Authorities (RBDAs), state ministries, schemes, and water user associations.',
      stats: '5 RBDAs • 382 WUAs',
      statLabel: '100% Verified',
      icon: Building,
      badge: 'Institutional',
      badgeStatus: 'saved_on_device' as const,
      color: 'amber',
      features: [
        'Institutional hierarchy',
        'WUA executive committees',
        'Bank account link',
        'Fee compliance',
      ],
      linkText: 'View Hierarchy',
      to: '/core',
    },
    {
      title: 'Batch Import Center',
      description:
        'Tabular spreadsheet import engine with column matching, dry-run schema validation, and undo history.',
      stats: '48 Data Sets',
      statLabel: '0 Pending Errors',
      icon: UploadCloud,
      badge: 'Engine Ready',
      badgeStatus: 'approved' as const,
      color: 'blue',
      features: [
        '5-step import wizard',
        'CSV/XLSX parser',
        'Auto-error report',
        'Rollback snapshot',
      ],
      linkText: 'Open Import Center',
      to: '/core',
    },
  ];

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

      {/* Main Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {coreSections.map((sec, i) => {
          const Icon = sec.icon;
          return (
            <Card
              key={i}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                      sec.color === 'teal'
                        ? 'bg-teal-50 text-teal-700 border border-teal-200/60'
                        : sec.color === 'amber'
                          ? 'bg-amber-50 text-amber-600 border border-amber-200/60'
                          : 'bg-blue-50 text-blue-600 border border-blue-200/60'
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <StatusChip status={sec.badgeStatus}>{sec.badge}</StatusChip>
                </div>

                <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                  {sec.title}
                </h3>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed min-h-[40px]">
                  {sec.description}
                </p>

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">{sec.stats}</span>
                  <span className="text-[11px] font-medium text-slate-400">{sec.statLabel}</span>
                </div>

                <div className="mt-4 space-y-1.5">
                  {sec.features.map((feat, fIdx) => (
                    <div key={fIdx} className="flex items-center gap-2 text-[11px] text-slate-600">
                      <div className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <Button
                  asChild
                  variant="outline"
                  className="w-full justify-between h-10 rounded-xl text-xs font-bold text-slate-700 hover:text-teal-700 hover:border-teal-300 hover:bg-teal-50/50 cursor-pointer"
                >
                  <Link to={sec.to}>
                    <span>{sec.linkText}</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
