import { QueryClient } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { ShellLayout } from '../shell/ShellLayout';
import { NotFound } from '../shell/NotFound';
import { ErrorBoundaryView } from '../shell/ErrorBoundaryView';
import { SignInPage } from '../routes/auth/SignInPage';
import { UnauthorizedPage } from '../routes/auth/UnauthorizedPage';
import { WorkspaceDashboard } from '../modules/dashboard/WorkspaceDashboard';
import { CoreHome } from '../modules/core/CoreHome';
import { UserManagementView } from '../modules/core/UserManagementView';
import { OrganisationsTreeView } from '../modules/core/OrganisationsTreeView';
import { ImportCenterView } from '../imports/ImportCenterView';
import { SlisHome } from '../modules/slis/SlisHome';
import { FarmersListView } from '../modules/slis/FarmersListView';
import { PlotsMapView } from '../modules/slis/PlotsMapView';
import { WaterRequestsListView } from '../modules/slis/WaterRequestsListView';
import { ReviewConflictsListView } from '../modules/slis/ReviewConflictsListView';
import { SlisReportsView } from '../modules/slis/SlisReportsView';
import { MeHome } from '../modules/me/MeHome';
import { IndicatorsListView } from '../modules/me/IndicatorsListView';
import { QuarterlyDataEntryView } from '../modules/me/QuarterlyDataEntryView';
import { IndicatorMatrixView } from '../modules/me/IndicatorMatrixView';
import { SurveysManagementView } from '../modules/me/SurveysManagementView';
import { ScorecardsListView } from '../modules/me/ScorecardsListView';
import { MatchingGrantsListView } from '../modules/me/MatchingGrantsListView';
import { TechnologyAdoptionListView } from '../modules/me/TechnologyAdoptionListView';
import { FieldSurveyCaptureForm } from '../modules/field/FieldSurveyCaptureForm';
import { BlisMapWorkspaceView } from '../modules/blis/BlisMapWorkspaceView';
import { DamsListView } from '../modules/blis/DamsListView';
import { StationsListView } from '../modules/blis/StationsListView';
import { BasinsListView } from '../modules/blis/BasinsListView';
import { DamInspectionsListView } from '../modules/blis/DamInspectionsListView';
import { FieldDamInspectionCaptureForm } from '../modules/field/FieldDamInspectionCaptureForm';
import { FieldHomeView } from '../modules/field/FieldHomeView';
import { FieldCaptureView } from '../modules/field/FieldCaptureView';
import { FieldRecordsView } from '../modules/field/FieldRecordsView';
import { FieldSyncView } from '../modules/field/FieldSyncView';
import { FieldProfileView } from '../modules/field/FieldProfileView';
import { FarmerRegistrationWizard } from '../modules/slis/field/FarmerRegistrationWizard';
import { PlotMappingView } from '../modules/slis/field/PlotMappingView';
import { WaterRequestFieldForm } from '../modules/field/WaterRequestFieldForm';
import { FeeCollectionFieldForm } from '../modules/field/FeeCollectionFieldForm';
import { TrainingAttendanceFieldForm } from '../modules/field/TrainingAttendanceFieldForm';
import { CropProductionFieldForm } from '../modules/field/CropProductionFieldForm';

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
