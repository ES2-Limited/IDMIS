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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Institutional Hierarchy & Water User Associations
          </h2>
          <p className="text-xs text-slate-500">
            River Basin Development Authorities (RBDAs), state ministry desks, schemes, sectors, and
            WUAs.
          </p>
        </div>
        <Button className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-10 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5">
          <Plus className="h-4 w-4" />
          Add Organisation
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
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
                  className="p-4 bg-white flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <button className="h-6 w-6 rounded-md hover:bg-slate-200 flex items-center justify-center text-slate-600">
                      {isRbdaExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <div className="h-10 w-10 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center font-extrabold">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-sm">{rbda.name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 uppercase">
                          {rbda.code}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500">{rbda.address}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-500">
                      {schemes.length} Schemes
                    </span>
                    <StatusChip status="approved">Active</StatusChip>
                  </div>
                </div>

                {/* Schemes Level */}
                {isRbdaExpanded && schemes.length > 0 && (
                  <div className="pl-10 pr-4 py-3 space-y-2.5 border-t border-slate-100 bg-slate-50/30">
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
                            className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/80"
                          >
                            <div className="flex items-center gap-2.5">
                              {sectors.length > 0 ? (
                                <button className="h-5 w-5 rounded flex items-center justify-center text-slate-500">
                                  {isSchemeExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              ) : (
                                <div className="w-5" />
                              )}
                              <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center">
                                <Layers className="h-4 w-4" />
                              </div>
                              <div>
                                <span className="font-extrabold text-slate-800 text-xs">
                                  {scheme.name}
                                </span>
                                <span className="ml-2 text-[10px] font-bold text-amber-600">
                                  [{scheme.code}]
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-slate-500">
                                {sectors.length} Sectors
                              </span>
                              <Button
                                variant="ghost"
                                className="h-7 text-xs font-bold cursor-pointer"
                              >
                                Manage
                              </Button>
                            </div>
                          </div>

                          {/* Sector Level */}
                          {isSchemeExpanded && sectors.length > 0 && (
                            <div className="pl-12 pr-4 py-2 border-t border-slate-100 bg-slate-50/50 space-y-1.5">
                              {sectors.map((sector) => (
                                <div
                                  key={sector.id}
                                  className="p-2.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between"
                                >
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-3.5 w-3.5 text-teal-600" />
                                    <span className="text-xs font-bold text-slate-800">
                                      {sector.name}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-slate-500 font-mono">
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
