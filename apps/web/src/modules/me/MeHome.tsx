import { Card, CardHeader, CardTitle, CardDescription, CardContent, StatusChip } from '@idmis/ui';

export function MeHome() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Monitoring & Evaluation (M&E)
          </h1>
          <p className="text-sm text-slate-500">
            Project results framework, indicators, quarterly submissions, and surveys
          </p>
        </div>
        <StatusChip status="syncing">Quarterly Cycle</StatusChip>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Results Framework</CardTitle>
            <CardDescription>
              22 Project Development Objective (PDO) & intermediate indicators
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Track targets vs actuals across national, state, and scheme scopes.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quarterly Entry Grid</CardTitle>
            <CardDescription>Input quarterly progress data and evidence files</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Enter manual indicators and view automatically computed project values.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Field Surveys</CardTitle>
            <CardDescription>Beneficiary questionnaires and impact evaluation</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Design surveys online and conduct field interviews completely offline.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
