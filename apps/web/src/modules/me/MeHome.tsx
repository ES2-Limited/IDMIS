import { Table, ClipboardList, Target, ArrowUpRight, TrendingUp, BarChart3 } from 'lucide-react';
import { Card, StatusChip, Button } from '@idmis/ui';
import { Link } from '@tanstack/react-router';
import { useScope } from '../../shell/ScopeContext';

export function MeHome() {
  const { currentScope } = useScope();

  const meSections = [
    {
      title: 'Project Results Framework',
      description:
        '22 Project Development Objective (PDO) and intermediate results framework indicators.',
      stats: '22 Indicators',
      statLabel: '18 On Target',
      icon: Target,
      badge: 'Quarterly Cycle',
      badgeStatus: 'syncing' as const,
      color: 'amber',
      features: [
        'PDO Targets vs Actuals',
        'Automated aggregate rollups',
        'Disaggregated by gender',
        'Baseline milestones',
      ],
      linkText: 'Explore Framework',
      to: '/me/indicators',
    },
    {
      title: 'Quarterly Data Entry Grid',
      description:
        'Matrix input for seasonal irrigation cycles, yield estimates, and evidence document attachments.',
      stats: 'Q4 2026 Active',
      statLabel: '87% Submitted',
      icon: Table,
      badge: 'Submission Open',
      badgeStatus: 'approved' as const,
      color: 'teal',
      features: [
        'Excel-style inline grid',
        'Formula auto-calculation',
        'Supporting PDF proofs',
        'Audit signature sign-off',
      ],
      linkText: 'Open Quarterly Grid',
      to: '/me/entry',
    },
    {
      title: 'Field Surveys & Beneficiaries',
      description:
        'Mobile offline surveys for farmer household income, yields, and water user satisfaction.',
      stats: '1,840 Surveys',
      statLabel: 'Offline Capable',
      icon: ClipboardList,
      badge: 'Field Syncing',
      badgeStatus: 'saved_on_device' as const,
      color: 'blue',
      features: [
        'Offline survey forms',
        'GPS geotagged audits',
        'Crop sample weighing',
        'Surveyor ID validation',
      ],
      linkText: 'Conduct Survey',
      to: '/me/surveys',
    },
  ];

  const quickStats = [
    { label: 'Active PDO Indicators', value: '22 Metrics', sub: '91% tracked' },
    { label: 'Quarterly Submissions', value: '87.4%', sub: '4 schemes closed' },
    { label: 'Field Beneficiaries', value: '34,800', sub: '+1,200 this season' },
    { label: 'Yield Improvement', value: '+34.2%', sub: 'vs baseline' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-950 via-amber-900 to-slate-900 p-6 sm:p-8 text-white shadow-lg border border-amber-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <BarChart3 className="h-3 w-3" /> M&E Framework
              </span>
              <StatusChip status="syncing">Quarterly Cycle</StatusChip>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Monitoring & Evaluation (M&E)
            </h1>
            <p className="text-amber-100/80 text-xs sm:text-sm max-w-xl leading-relaxed">
              Track Project Development Objectives (PDOs), capture quarterly monitoring submissions,
              and review beneficiary survey results across{' '}
              <span className="font-semibold text-amber-300">
                {currentScope.name || 'National Level'}
              </span>
              .
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/me/indicators">
              <Button
                variant="outline"
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-semibold cursor-pointer"
              >
                <Target className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
                Results Framework
              </Button>
            </Link>
            <Link to="/me/matrix">
              <Button className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md cursor-pointer">
                <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                Indicator Matrix
              </Button>
            </Link>
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
              <span className="text-[10px] text-amber-700 font-medium">{stat.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {meSections.map((sec, i) => {
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
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <Button
                  asChild
                  variant="outline"
                  className="w-full justify-between h-10 rounded-xl text-xs font-bold text-slate-700 hover:text-amber-700 hover:border-amber-300 hover:bg-amber-50/50 cursor-pointer"
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
