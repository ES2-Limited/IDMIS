import * as React from 'react';
import { QueryClient } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { ShellLayout } from '../shell/ShellLayout';
import { NotFound } from '../shell/NotFound';
import { ErrorBoundaryView } from '../shell/ErrorBoundaryView';
import { SignInPage } from '../routes/auth/SignInPage';
import { UnauthorizedPage } from '../routes/auth/UnauthorizedPage';
import { WorkspaceDashboard } from '../modules/dashboard/WorkspaceDashboard';

// Lazy-loaded heavy modules for route-level code splitting & under 1.5MB initial payload
function lazyRouteComponent<P extends object>(
  factory: () => Promise<Record<string, unknown>>,
  exportName?: string,
) {
  const LazyComponent = React.lazy(async () => {
    const mod = await factory();
    const component = (
      exportName ? mod[exportName] : mod.default || Object.values(mod)[0]
    ) as React.ComponentType<P>;
    return { default: component };
  });

  return function LazyWrapper(props: P) {
    return (
      <React.Suspense
        fallback={
          <div className="flex h-64 items-center justify-center p-8">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-teal-600 border-t-transparent" />
              <p className="text-xs font-semibold text-slate-500">Loading workspace module...</p>
            </div>
          </div>
        }
      >
        <LazyComponent {...props} />
      </React.Suspense>
    );
  };
}

// Module views loaded on demand
const CoreHome = lazyRouteComponent(() => import('../modules/core/CoreHome'), 'CoreHome');
const UserManagementView = lazyRouteComponent(
  () => import('../modules/core/UserManagementView'),
  'UserManagementView',
);
const OrganisationsTreeView = lazyRouteComponent(
  () => import('../modules/core/OrganisationsTreeView'),
  'OrganisationsTreeView',
);
const ImportCenterView = lazyRouteComponent(
  () => import('../imports/ImportCenterView'),
  'ImportCenterView',
);
const AuditLogsView = lazyRouteComponent(
  () => import('../modules/core/AuditLogsView'),
  'AuditLogsView',
);

const SlisHome = lazyRouteComponent(() => import('../modules/slis/SlisHome'), 'SlisHome');
const FarmersListView = lazyRouteComponent(
  () => import('../modules/slis/FarmersListView'),
  'FarmersListView',
);
const PlotsMapView = lazyRouteComponent(
  () => import('../modules/slis/PlotsMapView'),
  'PlotsMapView',
);
const WaterRequestsListView = lazyRouteComponent(
  () => import('../modules/slis/WaterRequestsListView'),
  'WaterRequestsListView',
);
const ReviewConflictsListView = lazyRouteComponent(
  () => import('../modules/slis/ReviewConflictsListView'),
  'ReviewConflictsListView',
);
const SlisReportsView = lazyRouteComponent(
  () => import('../modules/slis/SlisReportsView'),
  'SlisReportsView',
);

const MeHome = lazyRouteComponent(() => import('../modules/me/MeHome'), 'MeHome');
const IndicatorsListView = lazyRouteComponent(
  () => import('../modules/me/IndicatorsListView'),
  'IndicatorsListView',
);
const QuarterlyDataEntryView = lazyRouteComponent(
  () => import('../modules/me/QuarterlyDataEntryView'),
  'QuarterlyDataEntryView',
);
const IndicatorMatrixView = lazyRouteComponent(
  () => import('../modules/me/IndicatorMatrixView'),
  'IndicatorMatrixView',
);
const SurveysManagementView = lazyRouteComponent(
  () => import('../modules/me/SurveysManagementView'),
  'SurveysManagementView',
);
const ScorecardsListView = lazyRouteComponent(
  () => import('../modules/me/ScorecardsListView'),
  'ScorecardsListView',
);
const MatchingGrantsListView = lazyRouteComponent(
  () => import('../modules/me/MatchingGrantsListView'),
  'MatchingGrantsListView',
);
const TechnologyAdoptionListView = lazyRouteComponent(
  () => import('../modules/me/TechnologyAdoptionListView'),
  'TechnologyAdoptionListView',
);
const FieldSurveyCaptureForm = lazyRouteComponent(
  () => import('../modules/field/FieldSurveyCaptureForm'),
  'FieldSurveyCaptureForm',
);

const BlisMapWorkspaceView = lazyRouteComponent(
  () => import('../modules/blis/BlisMapWorkspaceView'),
  'BlisMapWorkspaceView',
);
const DamsListView = lazyRouteComponent(
  () => import('../modules/blis/DamsListView'),
  'DamsListView',
);
const StationsListView = lazyRouteComponent(
  () => import('../modules/blis/StationsListView'),
  'StationsListView',
);
const BasinsListView = lazyRouteComponent(
  () => import('../modules/blis/BasinsListView'),
  'BasinsListView',
);
const DamInspectionsListView = lazyRouteComponent(
  () => import('../modules/blis/DamInspectionsListView'),
  'DamInspectionsListView',
);
const FieldDamInspectionCaptureForm = lazyRouteComponent(
  () => import('../modules/field/FieldDamInspectionCaptureForm'),
  'FieldDamInspectionCaptureForm',
);

const FieldHomeView = lazyRouteComponent(
  () => import('../modules/field/FieldHomeView'),
  'FieldHomeView',
);
const FieldCaptureView = lazyRouteComponent(
  () => import('../modules/field/FieldCaptureView'),
  'FieldCaptureView',
);
const FieldRecordsView = lazyRouteComponent(
  () => import('../modules/field/FieldRecordsView'),
  'FieldRecordsView',
);
const FieldSyncView = lazyRouteComponent(
  () => import('../modules/field/FieldSyncView'),
  'FieldSyncView',
);
const FieldProfileView = lazyRouteComponent(
  () => import('../modules/field/FieldProfileView'),
  'FieldProfileView',
);
const FarmerRegistrationWizard = lazyRouteComponent(
  () => import('../modules/slis/field/FarmerRegistrationWizard'),
  'FarmerRegistrationWizard',
);
const PlotMappingView = lazyRouteComponent(
  () => import('../modules/slis/field/PlotMappingView'),
  'PlotMappingView',
);
const WaterRequestFieldForm = lazyRouteComponent(
  () => import('../modules/field/WaterRequestFieldForm'),
  'WaterRequestFieldForm',
);
const FeeCollectionFieldForm = lazyRouteComponent(
  () => import('../modules/field/FeeCollectionFieldForm'),
  'FeeCollectionFieldForm',
);
const TrainingAttendanceFieldForm = lazyRouteComponent(
  () => import('../modules/field/TrainingAttendanceFieldForm'),
  'TrainingAttendanceFieldForm',
);
const CropProductionFieldForm = lazyRouteComponent(
  () => import('../modules/field/CropProductionFieldForm'),
  'CropProductionFieldForm',
);

export const queryClient = new QueryClient();

// Root Route
const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: ({ error, reset }) => (
    <ErrorBoundaryView
      error={error instanceof Error ? error : new Error(String(error))}
      resetErrorBoundary={reset}
    />
  ),
});

// Auth Routes (unauthenticated shell)
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInPage,
});

const unauthorizedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/unauthorized',
  component: UnauthorizedPage,
});

// Authenticated Application Shell Route
const appShellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated-shell',
  component: ShellLayout,
});

// Workspace Home Dashboard (Desktop Admin / Scheme Officer Overview)
const indexRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/',
  component: WorkspaceDashboard,
});

// Dedicated Field Station Home route
const fieldHomeRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/field',
  component: FieldHomeView,
});

const fieldCaptureRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/field/capture',
  component: FieldCaptureView,
});

const fieldFarmerRegisterRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/field/capture/farmer',
  component: FarmerRegistrationWizard,
});

const fieldPlotMapRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/field/capture/plot',
  component: PlotMappingView,
});

const fieldWaterRequestRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/field/capture/water',
  component: WaterRequestFieldForm,
});

const fieldFeeCollectionRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/field/capture/fee',
  component: FeeCollectionFieldForm,
});

const fieldTrainingAttendanceRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/field/capture/training',
  component: TrainingAttendanceFieldForm,
});

const fieldCropProductionRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/field/capture/crop',
  component: CropProductionFieldForm,
});

const fieldSurveyRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/field/capture/survey',
  component: FieldSurveyCaptureForm,
});

const fieldDamInspectionRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/field/capture/dam-inspection',
  component: FieldDamInspectionCaptureForm,
});

const fieldRecordsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/field/records',
  component: FieldRecordsView,
});

const fieldSyncRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/field/sync',
  component: FieldSyncView,
});

const fieldProfileRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/field/profile',
  component: FieldProfileView,
});

// Module routes: Core
const coreRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/core',
  component: CoreHome,
});

const coreUsersRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/core/users',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>Core Administration</span>
        <span>/</span>
        <span className="text-teal-700 font-bold">Users & Roles</span>
      </div>
      <UserManagementView />
    </div>
  ),
});

const coreOrganisationsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/core/organisations',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>Core Administration</span>
        <span>/</span>
        <span className="text-teal-700 font-bold">Organisations & WUAs</span>
      </div>
      <OrganisationsTreeView />
    </div>
  ),
});

const coreImportsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/core/imports',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>Core Administration</span>
        <span>/</span>
        <span className="text-teal-700 font-bold">Batch Import Center</span>
      </div>
      <ImportCenterView />
    </div>
  ),
});

const coreAuditRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/core/audit',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>Core Administration</span>
        <span>/</span>
        <span className="text-teal-700 font-bold">Security Audit Trail</span>
      </div>
      <AuditLogsView />
    </div>
  ),
});

// Module routes: SLIS
const slisRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/slis',
  component: SlisHome,
});

const slisFarmersRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/slis/farmers',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>SLIS Module</span>
        <span>/</span>
        <span className="text-teal-700 font-bold">Farmers & Households</span>
      </div>
      <FarmersListView />
    </div>
  ),
});

const slisPlotsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/slis/plots',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>SLIS Module</span>
        <span>/</span>
        <span className="text-teal-700 font-bold">Plots & Command Areas</span>
      </div>
      <PlotsMapView />
    </div>
  ),
});

const slisWaterRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/slis/water',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>SLIS Module</span>
        <span>/</span>
        <span className="text-teal-700 font-bold">Water Allocation Requests</span>
      </div>
      <WaterRequestsListView />
    </div>
  ),
});

const slisReviewRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/slis/review',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>SLIS Module</span>
        <span>/</span>
        <span className="text-rose-700 font-bold">Review & Conflicts</span>
      </div>
      <ReviewConflictsListView />
    </div>
  ),
});

const slisReportsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/slis/reports',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>SLIS Module</span>
        <span>/</span>
        <span className="text-teal-700 font-bold">Operational Reports</span>
      </div>
      <SlisReportsView />
    </div>
  ),
});

// Module routes: M&E
const meRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/me',
  component: MeHome,
});

const meIndicatorsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/me/indicators',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>M&E Module</span>
        <span>/</span>
        <span className="text-amber-800 font-bold">Results Framework & Indicators</span>
      </div>
      <IndicatorsListView />
    </div>
  ),
});

const meEntryRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/me/entry',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>M&E Module</span>
        <span>/</span>
        <span className="text-teal-800 font-bold">Quarterly Monitoring Data Entry</span>
      </div>
      <QuarterlyDataEntryView />
    </div>
  ),
});

const meMatrixRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/me/matrix',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>M&E Module</span>
        <span>/</span>
        <span className="text-amber-800 font-bold">Performance Indicator Matrix</span>
      </div>
      <IndicatorMatrixView />
    </div>
  ),
});

const meSurveysRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/me/surveys',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>M&E Module</span>
        <span>/</span>
        <span className="text-teal-800 font-bold">Surveys & Questionnaire Builder</span>
      </div>
      <SurveysManagementView />
    </div>
  ),
});

const meScorecardsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/me/scorecards',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>M&E Module</span>
        <span>/</span>
        <span className="text-amber-800 font-bold">Scheme Scorecards</span>
      </div>
      <ScorecardsListView />
    </div>
  ),
});

const meGrantsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/me/grants',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>M&E Module</span>
        <span>/</span>
        <span className="text-teal-800 font-bold">Matching Grants</span>
      </div>
      <MatchingGrantsListView />
    </div>
  ),
});

const meAdoptionRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/me/adoption',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>M&E Module</span>
        <span>/</span>
        <span className="text-lime-800 font-bold">Technology Adoption</span>
      </div>
      <TechnologyAdoptionListView />
    </div>
  ),
});

// Module routes: BLIS
const blisRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/blis',
  component: BlisMapWorkspaceView,
});

const blisBasinsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/blis/basins',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>BLIS Module</span>
        <span>/</span>
        <span className="text-teal-800 font-bold">Basin Catchments & Morphometry</span>
      </div>
      <BasinsListView />
    </div>
  ),
});

const blisDamsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/blis/dams',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>BLIS Module</span>
        <span>/</span>
        <span className="text-teal-800 font-bold">Dams & Impoundment Reservoirs</span>
      </div>
      <DamsListView />
    </div>
  ),
});

const blisStationsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/blis/stations',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>BLIS Module</span>
        <span>/</span>
        <span className="text-teal-800 font-bold">Hydromet Telemetry Stations</span>
      </div>
      <StationsListView />
    </div>
  ),
});

const blisInspectionsRoute = createRoute({
  getParentRoute: () => appShellRoute,
  path: '/blis/inspections',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>BLIS Module</span>
        <span>/</span>
        <span className="text-teal-800 font-bold">Dam Safety Surveillance & Inspections</span>
      </div>
      <DamInspectionsListView />
    </div>
  ),
});

const authenticatedChildren = appShellRoute.addChildren([
  indexRoute,
  fieldHomeRoute,
  fieldCaptureRoute,
  fieldFarmerRegisterRoute,
  fieldPlotMapRoute,
  fieldWaterRequestRoute,
  fieldFeeCollectionRoute,
  fieldTrainingAttendanceRoute,
  fieldCropProductionRoute,
  fieldSurveyRoute,
  fieldDamInspectionRoute,
  fieldRecordsRoute,
  fieldSyncRoute,
  fieldProfileRoute,
  coreRoute,
  coreUsersRoute,
  coreOrganisationsRoute,
  coreImportsRoute,
  coreAuditRoute,
  slisRoute,
  slisFarmersRoute,
  slisPlotsRoute,
  slisWaterRoute,
  slisReviewRoute,
  slisReportsRoute,
  meRoute,
  meIndicatorsRoute,
  meEntryRoute,
  meMatrixRoute,
  meSurveysRoute,
  meScorecardsRoute,
  meGrantsRoute,
  meAdoptionRoute,
  blisRoute,
  blisBasinsRoute,
  blisDamsRoute,
  blisStationsRoute,
  blisInspectionsRoute,
]);

const routeTree = rootRoute.addChildren([signInRoute, unauthorizedRoute, authenticatedChildren]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
