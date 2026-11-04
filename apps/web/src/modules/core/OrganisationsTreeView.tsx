import * as React from 'react';
import { Building2, ChevronRight, ChevronDown, Layers, MapPin, Plus } from 'lucide-react';
import { Button, StatusChip } from '@idmis/ui';
import { mockOrganisations } from '../../mocks/coreData';

export function OrganisationsTreeView() {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({
    '018f3a60-0001-7000-8000-000000000001': true, // HJRBDA expanded
    '018f3a60-0003-7000-8000-000000000003': true, // KRIS expanded
  });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Build tree hierarchy: root RBDAs -> Schemes -> Sectors
  const rootOrgs = mockOrganisations.filter((o) => !o.parentId);
  const getChildren = (parentId: string) =>
    mockOrganisations.filter((o) => o.parentId === parentId);

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            Institutional Hierarchy & Water User Associations
          </h2>
          <p className="text-xs text-slate-500">
            River Basin Development Authorities (RBDAs), state ministry desks, schemes, sectors, and
            WUAs.
          </p>
        </div>
        <Button className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-10 rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-1.5 w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Add Organisation
        </Button>
      </div>

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
                          <div
                            onClick={() => toggleExpand(scheme.id)}
                            className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 cursor-pointer hover:bg-slate-50/80"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {sectors.length > 0 ? (
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

                            <div className="flex items-center justify-between sm:justify-end gap-2 pl-8 sm:pl-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                              <span className="text-[10px] sm:text-[11px] font-medium text-slate-500">
                                {sectors.length} Sectors
                              </span>
                              <Button
                                variant="ghost"
                                className="h-6 sm:h-7 px-2 text-[11px] font-bold cursor-pointer hover:text-teal-700"
                              >
                                Manage
                              </Button>
                            </div>
                          </div>

                          {/* Sector Level */}
                          {isSchemeExpanded && sectors.length > 0 && (
                            <div className="pl-6 sm:pl-10 pr-3 sm:pr-4 py-2 border-t border-slate-100 bg-slate-50/60 space-y-1.5">
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
