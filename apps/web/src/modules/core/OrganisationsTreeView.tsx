import * as React from 'react';
import {
  Building2,
  ChevronRight,
  ChevronDown,
  Layers,
  MapPin,
  Users2,
  Plus,
  RefreshCw,
  Landmark,
  Eye,
} from 'lucide-react';
import {
  Button,
  StatusChip,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@idmis/ui';
import type { OrgType, OrganisationResponse } from '@idmis/contracts';
import { useOrganisations, useWuas } from './hooks';
import { CreateOrganisationDialog } from './CreateOrganisationDialog';
import { CreateWuaDialog } from './CreateWuaDialog';
import { useScope } from '../../shell/ScopeContext';

export function OrganisationsTreeView() {
  const { currentScope } = useScope();

  // Query organisations filtered by selected state/scope
  const {
    organisations: serverOrgs,
    isLoading: isLoadingOrgs,
    isFetching: isFetchingOrgs,
    refetch: refetchOrgs,
    createOrganisation,
    isCreating,
  } = useOrganisations(
    currentScope.type === 'state' ? { stateId: currentScope.id } : undefined,
  );
  const {
    wuas: serverWuas,
    isLoading: isLoadingWuas,
    isFetching: isFetchingWuas,
    refetch: refetchWuas,
    createWua,
    isCreating: isCreatingWua,
  } = useWuas();

  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [addOrgDefaults, setAddOrgDefaults] = React.useState<{
    parentId?: string | null;
    type?: OrgType;
  }>({});

  // WUA Attach state
  const [wuaAttachTarget, setWuaAttachTarget] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  // Manage / Details Modal state
  const [selectedOrgDetails, setSelectedOrgDetails] = React.useState<OrganisationResponse | null>(null);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isFetching = isFetchingOrgs || isFetchingWuas;
  const isLoading = isLoadingOrgs || isLoadingWuas;

  // Pure live data from server
  const organisations = serverOrgs ?? [];
  const wuas = serverWuas ?? [];

  // Build tree hierarchy: root RBDAs -> Schemes -> Sectors
  const rootOrgs = organisations.filter((o) => !o.parentId);
  const getChildren = (parentId: string) => organisations.filter((o) => o.parentId === parentId);
  const getWuasForOrg = (orgId: string) => wuas.filter((w) => w.organisationId === orgId);

  const handleRefresh = () => {
    refetchOrgs();
    refetchWuas();
  };

  const handleOpenAddScheme = (rbdaId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAddOrgDefaults({ parentId: rbdaId, type: 'scheme' });
    setIsAddOpen(true);
    setExpanded((prev) => ({ ...prev, [rbdaId]: true }));
  };

  const handleOpenAddSector = (schemeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAddOrgDefaults({ parentId: schemeId, type: 'sector' });
    setIsAddOpen(true);
    setExpanded((prev) => ({ ...prev, [schemeId]: true }));
  };

  const handleOpenAttachWua = (orgId: string, orgName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setWuaAttachTarget({ id: orgId, name: orgName });
  };

  const handleOpenDetails = (org: OrganisationResponse, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOrgDetails(org);
  };

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              Institutional Hierarchy & Water User Associations
            </h2>
            {isLoading && (
              <RefreshCw className="h-4 w-4 animate-spin text-teal-600" aria-label="Loading..." />
            )}
          </div>
          <p className="text-xs text-slate-500">
            River Basin Development Authorities (RBDAs), state ministry desks, schemes, sectors, and
            WUAs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="h-10 rounded-xl text-xs font-semibold gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setAddOrgDefaults({});
              setIsAddOpen(true);
            }}
            className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-10 rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Add Organisation
          </Button>
        </div>
      </div>

      <CreateOrganisationDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        onSubmitOrg={createOrganisation}
        parentOrganisations={organisations.map((o) => ({
          id: o.id,
          name: o.name,
          code: o.code,
          type: o.type,
        }))}
        defaultParentId={addOrgDefaults.parentId}
        defaultType={addOrgDefaults.type}
        isLoading={isCreating}
      />

      {wuaAttachTarget && (
        <CreateWuaDialog
          open={Boolean(wuaAttachTarget)}
          onOpenChange={(open) => !open && setWuaAttachTarget(null)}
          onSubmitWua={createWua}
          organisationId={wuaAttachTarget.id}
          organisationName={wuaAttachTarget.name}
          isLoading={isCreatingWua}
        />
      )}

      {selectedOrgDetails && (
        <Dialog open={Boolean(selectedOrgDetails)} onOpenChange={(open) => !open && setSelectedOrgDetails(null)}>
          <DialogContent className="max-w-md p-6">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
                  {selectedOrgDetails.type}
                </span>
                <span className="font-mono text-[11px] text-slate-500">[{selectedOrgDetails.code}]</span>
              </div>
              <DialogTitle className="text-lg font-black text-slate-900 tracking-tight">
                {selectedOrgDetails.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Institutional metadata, geographical boundaries, and command attributes.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Short Name</span>
                  <span className="font-bold text-slate-800">{selectedOrgDetails.shortName ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Headquarters / Address</span>
                  <span className="font-bold text-slate-800 text-right truncate max-w-[200px]">{selectedOrgDetails.address ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Phone</span>
                  <span className="font-bold text-slate-800">{selectedOrgDetails.phone ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Email</span>
                  <span className="font-bold text-slate-800">{selectedOrgDetails.email ?? '—'}</span>
                </div>
                {selectedOrgDetails.irrigableAreaHa !== undefined && selectedOrgDetails.irrigableAreaHa !== null && (
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">Irrigable Area</span>
                    <span className="font-bold text-teal-700">{Number(selectedOrgDetails.irrigableAreaHa).toLocaleString()} Hectares</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Created On</span>
                  <span className="font-medium text-slate-600">{new Date(selectedOrgDetails.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-6 shadow-xs space-y-4">
        <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">
          River Basin Hierarchy Tree
        </div>

        <div className="space-y-3">
          {rootOrgs.map((rbda) => {
            const isRbdaExpanded = !!expanded[rbda.id];
            const schemes = getChildren(rbda.id);

            return (
              <div
                key={rbda.id}
                className="rounded-xl border border-slate-200/90 bg-slate-50/50 overflow-hidden"
              >
                {/* RBDA Level */}
                <div
                  onClick={() => toggleExpand(rbda.id)}
                  className="p-3 sm:p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
                    <button
                      type="button"
                      aria-label="Toggle expansion"
                      className="h-7 w-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 mt-0.5 sm:mt-0"
                    >
                      {isRbdaExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center font-extrabold shrink-0">
                      <Building2 className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <span className="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight">
                          {rbda.name}
                        </span>
                        <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-teal-100 text-teal-800 uppercase shrink-0">
                          {rbda.code}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 block truncate mt-0.5">
                        {rbda.address}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2.5 pl-9 sm:pl-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <span className="text-[11px] font-bold text-slate-500">
                      {schemes.length} Schemes
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => handleOpenAddScheme(rbda.id, e)}
                      className="h-7 px-2.5 text-[11px] font-bold gap-1 text-teal-700 border-teal-200 hover:bg-teal-50 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      Add Scheme
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleOpenDetails(rbda, e)}
                      className="h-7 px-2 text-[11px] font-bold text-slate-600 hover:text-teal-700 cursor-pointer"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Details
                    </Button>
                    <StatusChip status="approved">Active</StatusChip>
                  </div>
                </div>

                {/* Schemes Level */}
                {isRbdaExpanded && schemes.length > 0 && (
                  <div className="pl-3 sm:pl-9 pr-3 sm:pr-4 py-2.5 sm:py-3 space-y-2 border-t border-slate-100 bg-slate-50/40">
                    {schemes.map((scheme) => {
                      const isSchemeExpanded = !!expanded[scheme.id];
                      const sectors = getChildren(scheme.id);

                      return (
                        <div
                          key={scheme.id}
                          className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs"
                        >
                          {/* Schemes and Associated WUAs */}
                          <div
                            onClick={() => toggleExpand(scheme.id)}
                            className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 cursor-pointer hover:bg-slate-50/80"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {sectors.length > 0 || getWuasForOrg(scheme.id).length > 0 ? (
                                <button
                                  type="button"
                                  aria-label="Toggle scheme expansion"
                                  className="h-6 w-6 rounded flex items-center justify-center text-slate-500 shrink-0"
                                >
                                  {isSchemeExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              ) : (
                                <div className="w-6 shrink-0" />
                              )}
                              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
                                <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              </div>
                              <div className="min-w-0 flex-1 truncate">
                                <span className="font-extrabold text-slate-800 text-xs">
                                  {scheme.name}
                                </span>
                                <span className="ml-1.5 text-[10px] font-bold text-amber-600 shrink-0">
                                  [{scheme.code}]
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-2 pl-8 sm:pl-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-100 flex-wrap">
                              <span className="text-[10px] sm:text-[11px] font-medium text-slate-500">
                                {sectors.length} Sectors • {getWuasForOrg(scheme.id).length} WUAs
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => handleOpenAddSector(scheme.id, e)}
                                className="h-6 sm:h-7 px-2 text-[10px] sm:text-[11px] font-bold gap-1 text-amber-700 border-amber-200 hover:bg-amber-50 cursor-pointer"
                              >
                                <Plus className="h-3 w-3" />
                                Add Sector
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => handleOpenAttachWua(scheme.id, scheme.name, e)}
                                className="h-6 sm:h-7 px-2 text-[10px] sm:text-[11px] font-bold gap-1 text-teal-700 border-teal-200 hover:bg-teal-50 cursor-pointer"
                              >
                                <Users2 className="h-3 w-3" />
                                Attach WUA
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleOpenDetails(scheme, e)}
                                className="h-6 sm:h-7 px-2 text-[10px] sm:text-[11px] font-bold cursor-pointer hover:text-teal-700"
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Manage
                              </Button>
                            </div>
                          </div>

                          {/* Nested Items: Sectors & WUAs */}
                          {isSchemeExpanded && (
                            <div className="pl-6 sm:pl-10 pr-3 sm:pr-4 py-3 border-t border-slate-100 bg-slate-50/60 space-y-3">
                              {/* Sectors */}
                              {sectors.length > 0 && (
                                <div className="space-y-1.5">
                                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    Sectors ({sectors.length})
                                  </div>
                                  {sectors.map((sector) => (
                                    <div
                                      key={sector.id}
                                      className="p-2 sm:p-2.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between gap-2"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <MapPin className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                                        <span className="text-xs font-bold text-slate-800 truncate">
                                          {sector.name}
                                        </span>
                                      </div>
                                      <span className="text-[10px] sm:text-[11px] text-slate-500 font-mono shrink-0">
                                        {sector.code}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Water User Associations */}
                              {getWuasForOrg(scheme.id).length > 0 && (
                                <div className="space-y-1.5 pt-1">
                                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                      <Users2 className="h-3 w-3 text-teal-600" />
                                      Water User Associations ({getWuasForOrg(scheme.id).length})
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => handleOpenAttachWua(scheme.id, scheme.name, e)}
                                      className="h-6 px-1.5 text-[10px] font-bold text-teal-700 hover:text-teal-800 cursor-pointer"
                                    >
                                      <Plus className="h-2.5 w-2.5 mr-0.5" />
                                      Attach WUA
                                    </Button>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {getWuasForOrg(scheme.id).map((wua) => (
                                      <div
                                        key={wua.id}
                                        className="p-2.5 rounded-xl border border-slate-200 bg-white space-y-1 shadow-2xs"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-xs font-extrabold text-slate-900 truncate">
                                            {wua.name}
                                          </span>
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
                                            {wua.level}
                                          </span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-mono">
                                          {wua.regNo ?? 'Unregistered'}
                                        </div>
                                        {wua.bankAccountLast4 && (
                                          <div className="flex items-center gap-1 text-[10px] text-slate-600 font-medium pt-0.5">
                                            <Landmark className="h-3 w-3 text-slate-400" />
                                            <span>
                                              {wua.bankName ?? 'Bank'}: •••• {wua.bankAccountLast4}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
