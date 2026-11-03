import { Card, CardHeader, CardTitle, CardDescription, CardContent, StatusChip } from '@idmis/ui';

export function SlisHome() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Scheme Land Information System (SLIS)
          </h1>
          <p className="text-sm text-slate-500">
            Irrigation schemes, farmers, parcels, crops, and water deliveries
          </p>
        </div>
        <StatusChip status="saved_on_device">Field Ready</StatusChip>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Farmers & Households</CardTitle>
            <CardDescription>Farmer registry and encrypted identity records</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Register farmers, household members, and verify land tenure.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plots & Boundaries</CardTitle>
            <CardDescription>GIS parcels, GPS boundary walks, and crop rotations</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Spatial polygon mapping with automatic area calculation.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review & Held Conflicts</CardTitle>
            <CardDescription>Supervisor approval and sync conflict resolution</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Inspect device submissions and resolve concurrent edits.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
