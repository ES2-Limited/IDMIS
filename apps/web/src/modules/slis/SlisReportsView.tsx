import * as React from 'react';
import {
  FileSpreadsheet,
  Download,
  Filter,
  Users,
  Waves,
  CreditCard,
  Building2,
  TrendingUp,
  PieChart,
} from 'lucide-react';
import {
  Button,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@idmis/ui';
import { useScope } from '../../shell/ScopeContext';
import { useSlisReports } from './hooks';
import { useOrganisations } from '../core/hooks';

export interface SectorReportRow {
  sectorId: string;
  sectorName: string;
  schemeId: string;
  schemeName: string;
  farmersCount: number;
  femaleFarmersCount: number;
  householdsCount: number;
  totalAreaHa: number;
  activePlotsCount: number;
}

export function SlisReportsView() {
  const { currentScope } = useScope();
  const [selectedReport, setSelectedReport] = React.useState<
    'farmers_by_sector' | 'wua_summaries' | 'fee_billing'
  >('farmers_by_sector');
  const [schemeFilter, setSchemeFilter] = React.useState('all');

  const schemeId = currentScope.type === 'scheme' ? currentScope.id : undefined;

  const { farmersByScope, areaByService, feeRecovery, wuaSummaries } = useSlisReports(schemeId);

  const { organisations } = useOrganisations();
  const schemesList = React.useMemo(() => {
    return (organisations || []).filter((o) => o.type === 'scheme');
  }, [organisations]);

  // 1. Farmers by sector rows from real API: /slis/reports/farmers-by-scope
  const sectorRows: SectorReportRow[] = React.useMemo(() => {
    if (!farmersByScope?.items || farmersByScope.items.length === 0) {
      return [];
    }

    // Group items by sectorId to aggregate male + female
    const map = new Map<string, SectorReportRow>();
    for (const item of farmersByScope.items) {
      const key = `${item.schemeId}_${item.sectorId || 'unassigned'}`;
      let row = map.get(key);
      if (!row) {
        row = {
          sectorId: item.sectorId || 'N/A',
          sectorName: item.sectorName || 'Main Distribution Sector',
          schemeId: item.schemeId,
          schemeName: item.schemeName || currentScope.name || 'Scheme',
          farmersCount: 0,
          femaleFarmersCount: 0,
          householdsCount: 0,
          totalAreaHa: 0,
          activePlotsCount: 0,
        };
        map.set(key, row);
      }
      row.farmersCount += item.farmerCount;
      if (item.gender === 'female') {
        row.femaleFarmersCount += item.farmerCount;
      }
    }

    // Connect plot area from areaByService if available
    const totalArea = areaByService?.totalAreaHa ? parseFloat(areaByService.totalAreaHa) : 0;
    const totalPlots = areaByService?.totalPlots ?? 0;

    const result = Array.from(map.values());
    if (result.length === 1 && result[0]) {
      result[0].totalAreaHa = totalArea;
      result[0].activePlotsCount = totalPlots;
    } else if (result.length > 1 && totalArea > 0) {
      const totalAllFarmers = result.reduce((sum, r) => sum + r.farmersCount, 0);
      result.forEach((r) => {
        const ratio = totalAllFarmers > 0 ? r.farmersCount / totalAllFarmers : 1 / result.length;
        r.totalAreaHa = Math.round(totalArea * ratio * 10) / 10;
        r.activePlotsCount = Math.round(totalPlots * ratio);
      });
    }

    return result;
  }, [farmersByScope, areaByService, currentScope.name]);

  const filteredSectorRows = React.useMemo(() => {
    if (schemeFilter === 'all') return sectorRows;
    return sectorRows.filter(
      (r) =>
        r.schemeId === schemeFilter ||
        r.schemeName.toLowerCase().includes(schemeFilter.toLowerCase()),
    );
  }, [sectorRows, schemeFilter]);

  // 2. Real WUA summaries rows from /slis/reports/wua-summaries
  const filteredWuaRows = React.useMemo(() => {
    const items = wuaSummaries?.items || [];
    if (schemeFilter === 'all') return items;
    return items.filter(
      (w) =>
        w.schemeId === schemeFilter ||
        (w.schemeName && w.schemeName.toLowerCase().includes(schemeFilter.toLowerCase())),
    );
  }, [wuaSummaries, schemeFilter]);

  // 3. Real Fee Recovery rows from /slis/reports/fee-recovery
  const filteredFeeRows = React.useMemo(() => {
    const items = feeRecovery?.items || [];
    if (schemeFilter === 'all') return items;
    return items.filter(
      (f) =>
        f.schemeId === schemeFilter ||
        (f.schemeName && f.schemeName.toLowerCase().includes(schemeFilter.toLowerCase())),
    );
  }, [feeRecovery, schemeFilter]);

  // Aggregate stats from live data
  const totalFarmers = farmersByScope?.totalFarmers ?? 0;
  const femaleFarmers = React.useMemo(() => {
    return (
      farmersByScope?.items
        ?.filter((i) => i.gender === 'female')
        .reduce((sum, i) => sum + i.farmerCount, 0) ?? 0
    );
  }, [farmersByScope]);

  const totalAreaHa = areaByService?.totalAreaHa ? parseFloat(areaByService.totalAreaHa) : 0;
  const totalPlots = areaByService?.totalPlots ?? 0;
  const totalBilled = feeRecovery?.totalBilledNgn ? parseFloat(feeRecovery.totalBilledNgn) : 0;
  const totalCollected = feeRecovery?.totalCollectedNgn
    ? parseFloat(feeRecovery.totalCollectedNgn)
    : 0;
  const overallCollectionRate = feeRecovery?.overallRecoveryRatePct ?? '0';

  const femalePercentage =
    totalFarmers > 0 ? ((femaleFarmers / totalFarmers) * 100).toFixed(1) : '0';

  const handleExportCSV = () => {
    let headers: string[];
    let rows: (string | number)[][];

    if (selectedReport === 'farmers_by_sector') {
      headers = [
        'Sector ID',
        'Sector Name',
        'Scheme Name',
        'Total Farmers',
        'Female Farmers',
        'Total Farmland (ha)',
        'Active Plots',
      ];
      rows = filteredSectorRows.map((r) => [
        r.sectorId,
        `"${r.sectorName}"`,
        `"${r.schemeName}"`,
        r.farmersCount,
        r.femaleFarmersCount,
        r.totalAreaHa.toFixed(2),
        r.activePlotsCount,
      ]);
    } else if (selectedReport === 'wua_summaries') {
      headers = [
        'WUA Name',
        'Reg No',
        'Level',
        'Scheme',
        'Operational',
        'Maintenance Fund',
        'Farmers',
        'Officers',
      ];
      rows = filteredWuaRows.map((w) => [
        `"${w.wuaName}"`,
        w.regNo || '—',
        w.level,
        `"${w.schemeName || '—'}"`,
        w.isOperational ? 'Yes' : 'No',
        w.hasMaintenanceFund ? 'Yes' : 'No',
        w.farmerCount,
        w.officerCount,
      ]);
    } else {
      headers = [
        'WUA Name',
        'Scheme',
        'Season',
        'Billed (NGN)',
        'Collected (NGN)',
        'Recovery Rate (%)',
      ];
      rows = filteredFeeRows.map((f) => [
        `"${f.wuaName || '—'}"`,
        `"${f.schemeName || '—'}"`,
        `"${f.seasonName || '—'}"`,
        f.billedNgn,
        f.collectedNgn,
        f.recoveryRatePct || '0.00',
      ]);
    }

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `slis_${selectedReport}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5 animate-in fade-in-50">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
              SLIS Operational Reports
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-bold text-slate-600">
              {currentScope.name || 'All Schemes'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Scheme Land & Water Summaries
          </h2>
          <p className="text-xs text-slate-500">
            Sector-level demographic breakdowns, Water Users Association (WUA) operational
            summaries, and fee collection reconciliation from verified server records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleExportCSV}
            className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold gap-1.5 shadow-xs"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV / Excel
          </Button>
        </div>
      </div>

      {/* Report Selector Tabs & Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 border border-slate-200 p-1 rounded-xl bg-slate-50 text-xs font-bold">
          <button
            onClick={() => setSelectedReport('farmers_by_sector')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedReport === 'farmers_by_sector'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/50'
            }`}
          >
            <Users className="h-3.5 w-3.5" /> Farmers by Sector & Unit
          </button>
          <button
            onClick={() => setSelectedReport('wua_summaries')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedReport === 'wua_summaries'
                ? 'bg-white text-teal-800 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/50'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" /> WUA Summaries & Operations
          </button>
          <button
            onClick={() => setSelectedReport('fee_billing')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedReport === 'fee_billing'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 font-semibold hover:bg-slate-200/50'
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" /> Fee Collection vs Billing
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <div className="w-56 sm:w-64">
            <Select value={schemeFilter} onValueChange={(val: string) => setSchemeFilter(val)}>
              <SelectTrigger
                aria-label="Filter by scheme"
                className="h-8.5 min-h-[34px] w-full bg-slate-50 border-slate-200 text-xs font-semibold rounded-lg hover:border-teal-600 transition-all shadow-2xs cursor-pointer"
              >
                <SelectValue placeholder="All Schemes" />
              </SelectTrigger>
              <SelectContent className="rounded-xl shadow-xl border-slate-200">
                <SelectItem value="all" className="text-xs font-medium py-2">
                  All Schemes
                </SelectItem>
                {schemesList.map((scheme) => (
                  <SelectItem
                    key={scheme.id}
                    value={scheme.id}
                    className="text-xs font-medium py-2"
                  >
                    {scheme.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Aggregate KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Total Farmers
          </span>
          <span className="text-xl font-black text-slate-900 mt-1 block">
            {totalFarmers.toLocaleString()}
          </span>
          <span className="text-[11px] text-teal-700 font-semibold flex items-center gap-1 mt-0.5">
            <PieChart className="h-3 w-3" /> {femalePercentage}% Female ({femaleFarmers})
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Command Area
          </span>
          <span className="text-xl font-black text-slate-900 mt-1 block">
            {totalAreaHa > 0 ? `${totalAreaHa.toFixed(1)} ha` : '0.0 ha'}
          </span>
          <span className="text-[11px] text-slate-500 font-semibold mt-0.5 block">
            {totalPlots > 0 ? `${totalPlots} digitized plots` : 'No plots recorded'}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            WUAs In Scope
          </span>
          <span className="text-xl font-black text-blue-900 mt-1 block">
            {wuaSummaries?.totalWuas ?? 0}
          </span>
          <span className="text-[11px] text-blue-700 font-semibold flex items-center gap-1 mt-0.5">
            <Waves className="h-3 w-3" />{' '}
            {wuaSummaries?.items?.filter((w) => w.isOperational).length ?? 0} Operational
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
            Fee Collection Rate
          </span>
          <span className="text-xl font-black text-emerald-700 mt-1 block">
            {overallCollectionRate}%
          </span>
          <span className="text-[11px] text-emerald-800 font-semibold flex items-center gap-1 mt-0.5">
            <TrendingUp className="h-3 w-3" /> ₦{(totalCollected / 1000000).toFixed(2)}M / ₦
            {(totalBilled / 1000000).toFixed(2)}M
          </span>
        </div>
      </div>

      {/* Main Report Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-teal-700" />
            <h3 className="font-extrabold text-sm text-slate-900">
              {selectedReport === 'farmers_by_sector'
                ? 'Farmers and Landholding Distribution by Sector & Unit'
                : selectedReport === 'wua_summaries'
                  ? 'Water Users Association (WUA) Operational & Governance Summaries'
                  : 'Fee Collection, Invoiced Billing and Recovery Comparison'}
            </h3>
          </div>
          <Badge variant="outline" className="text-[10px] font-bold text-slate-500">
            {selectedReport === 'farmers_by_sector'
              ? `${filteredSectorRows.length} Sectors Listed`
              : selectedReport === 'wua_summaries'
                ? `${filteredWuaRows.length} WUAs Listed`
                : `${filteredFeeRows.length} Billings Listed`}
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {/* Mode 1: Farmers by Sector */}
                {selectedReport === 'farmers_by_sector' && (
                  <>
                    <th className="py-3 px-4">Sector Identifier</th>
                    <th className="py-3 px-4">Scheme</th>
                    <th className="py-3 px-4">Registered Farmers</th>
                    <th className="py-3 px-4">Female Participation</th>
                    <th className="py-3 px-4">Total Farmland</th>
                    <th className="py-3 px-4 text-right">Avg Parcel Size</th>
                  </>
                )}

                {/* Mode 2: WUA Summaries */}
                {selectedReport === 'wua_summaries' && (
                  <>
                    <th className="py-3 px-4">WUA Name</th>
                    <th className="py-3 px-4">Registration No.</th>
                    <th className="py-3 px-4">Level</th>
                    <th className="py-3 px-4">Scheme</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Maint. Fund</th>
                    <th className="py-3 px-4 text-right">Active Farmers</th>
                  </>
                )}

                {/* Mode 3: Fee Collection vs Billing */}
                {selectedReport === 'fee_billing' && (
                  <>
                    <th className="py-3 px-4">WUA Entity</th>
                    <th className="py-3 px-4">Scheme</th>
                    <th className="py-3 px-4">Season</th>
                    <th className="py-3 px-4">Invoiced Billing</th>
                    <th className="py-3 px-4">Collected (Paid)</th>
                    <th className="py-3 px-4 text-right">Recovery Rate</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Tab 1: Farmers by Sector */}
              {selectedReport === 'farmers_by_sector' &&
                (filteredSectorRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <FileSpreadsheet className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <span className="font-bold text-slate-700 block text-xs">
                        No Sector Data Available
                      </span>
                      <span className="text-[11px] text-slate-400">
                        No approved farmers found for this scope.
                      </span>
                    </td>
                  </tr>
                ) : (
                  filteredSectorRows.map((row) => {
                    const avgParcelSize =
                      row.activePlotsCount > 0
                        ? (row.totalAreaHa / row.activePlotsCount).toFixed(2)
                        : '0.00';

                    return (
                      <tr key={row.sectorId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {row.sectorId}
                          </span>
                          <div className="font-bold text-slate-800 mt-1">{row.sectorName}</div>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-500">{row.schemeName}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {row.farmersCount.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded">
                            {row.farmersCount > 0
                              ? ((row.femaleFarmersCount / row.farmersCount) * 100).toFixed(1)
                              : '0'}
                            % ({row.femaleFarmersCount})
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {row.totalAreaHa > 0 ? `${row.totalAreaHa.toFixed(1)} ha` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-800">
                          {avgParcelSize !== '0.00' ? `${avgParcelSize} ha` : '—'}
                        </td>
                      </tr>
                    );
                  })
                ))}

              {/* Tab 2: WUA Summaries */}
              {selectedReport === 'wua_summaries' &&
                (filteredWuaRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Building2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <span className="font-bold text-slate-700 block text-xs">
                        No WUA Data Available
                      </span>
                      <span className="text-[11px] text-slate-400">
                        No Water Users Associations found for this scope.
                      </span>
                    </td>
                  </tr>
                ) : (
                  filteredWuaRows.map((w) => (
                    <tr key={w.wuaId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">{w.wuaName}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{w.regNo || '—'}</td>
                      <td className="py-3.5 px-4 capitalize font-medium text-slate-600">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {w.level}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-600">
                        {w.schemeName || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant="outline"
                          className={
                            w.isOperational
                              ? 'border-emerald-300 text-emerald-800 bg-emerald-50 text-[10px]'
                              : 'border-slate-300 text-slate-600 bg-slate-50 text-[10px]'
                          }
                        >
                          {w.isOperational ? 'Operational' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant="outline"
                          className={
                            w.hasMaintenanceFund
                              ? 'border-blue-300 text-blue-800 bg-blue-50 text-[10px]'
                              : 'border-slate-200 text-slate-500 bg-slate-50 text-[10px]'
                          }
                        >
                          {w.hasMaintenanceFund ? 'Funded' : 'No Fund'}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {w.farmerCount.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ))}

              {/* Tab 3: Fee Collection vs Billing */}
              {selectedReport === 'fee_billing' &&
                (filteredFeeRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <CreditCard className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <span className="font-bold text-slate-700 block text-xs">
                        No Fee Recovery Data Available
                      </span>
                      <span className="text-[11px] text-slate-400">
                        No billing or collection records found in the database.
                      </span>
                    </td>
                  </tr>
                ) : (
                  filteredFeeRows.map((f, idx) => (
                    <tr
                      key={`${f.schemeId}_${idx}`}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {f.wuaName || 'Apex Federation'}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-600">
                        {f.schemeName || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-600">
                        {f.seasonName || 'Current Season'}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        ₦{parseFloat(f.billedNgn).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-800">
                        ₦{parseFloat(f.collectedNgn).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Badge
                          variant="outline"
                          className={`font-mono text-[10px] font-bold ${
                            f.recoveryRatePct && parseFloat(f.recoveryRatePct) >= 90
                              ? 'border-emerald-300 text-emerald-800 bg-emerald-50'
                              : f.recoveryRatePct && parseFloat(f.recoveryRatePct) >= 70
                                ? 'border-amber-300 text-amber-800 bg-amber-50'
                                : 'border-rose-300 text-rose-800 bg-rose-50'
                          }`}
                        >
                          {f.recoveryRatePct ? `${f.recoveryRatePct}%` : '0.00%'}
                        </Badge>
                      </td>
                    </tr>
                  ))
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
