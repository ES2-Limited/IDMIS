import { Card, CardHeader, CardTitle, CardDescription, CardContent, StatusChip } from '@idmis/ui';

export function BlisHome() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Baseline Land Information System (BLIS)
          </h1>
          <p className="text-sm text-slate-500">
            River basins, dams, hydrometric stations, and watershed monitoring
          </p>
        </div>
        <StatusChip status="approved">Active Network</StatusChip>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interactive Map Workspace</CardTitle>
            <CardDescription>
              Vector tiles for basins, dams, and irrigation commands
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Explore spatial GIS layers and inspect basin infrastructure.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hydromet Time Series</CardTitle>
            <CardDescription>
              River discharge, rainfall, water level, and reservoir capacity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Visualise measurement trends and flag suspect readings with ECharts.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dam Inspections</CardTitle>
            <CardDescription>
              Structural safety assessments and hazard classification
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-600">
              Capture field safety inspections with offline photo documentation.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
