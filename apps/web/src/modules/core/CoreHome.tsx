import { Card, CardHeader, CardTitle, CardDescription, CardContent, StatusChip } from '@idmis/ui';

export function CoreHome() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Core Administration</h1>
          <p className="text-sm text-slate-500">
            Manage users, organisations, scopes, and system configuration
          </p>
        </div>
        <StatusChip status="approved">Active</StatusChip>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">User Management</CardTitle>
            <CardDescription>Accounts, role assignments, and scope boundaries</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Configure RBAC roles, officer assignments, and offline capture flags.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Organisations & WUAs</CardTitle>
            <CardDescription>
              RBDAs, State Ministries, Schemes, and Water User Associations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Maintain institutional hierarchy and contact structures.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Center</CardTitle>
            <CardDescription>Batch upload tabular spreadsheets</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              5-step tabular import engine with dry-run validation and undo.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
