import * as React from 'react';
import { Download, UploadCloud, ArrowLeft, Activity } from 'lucide-react';
import {
  Button,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@idmis/ui';
import { Link } from '@tanstack/react-router';
import { useCan } from '../../auth';
import { ImportWizard } from '../../imports/ImportWizard';

export type TimeAggregation = 'raw' | 'daily' | 'monthly' | 'yearly';
export type DateRangePreset = '7d' | '30d' | '90d' | '365d';

export interface HydrometMeasurement {
  id: string;
  observedAt: string; // ISO date-time
  dateFormatted: string;
  stageM: number | null; // Stage / water level
  dischargeM3s: number | null; // River discharge
  rainfallMm: number | null; // Precipitation
  tempC: number | null; // Ambient temperature
  quality: 'checked' | 'raw' | 'suspect';
  isBreak: boolean; // Telemetry gap flag
}

// Generate high-density 1-year telemetry dataset with natural seasonal hydrology
export function generateYearlyReadings(): HydrometMeasurement[] {
  const readings: HydrometMeasurement[] = [];
  const baseDate = new Date('2025-11-01T00:00:00Z');

  for (let i = 0; i < 365; i++) {
    const cur = new Date(baseDate);
    cur.setDate(cur.getDate() + i);
    const month = cur.getMonth(); // 0 to 11

    // Simulate dry vs wet rainy season (May-September peak in Northern Nigeria)
    const isRainySeason = month >= 4 && month <= 8;
    const isPeakFlood = month === 7 || month === 8;

    // Simulate occasional sensor offline gaps (breaks)
    const isBreak = i === 42 || i === 43 || i === 180 || i === 181 || i === 182;

    // Simulate suspect telemetry readings
    const isSuspect = i === 112 || i === 245;

    let stage = 1.2 + Math.sin((i / 365) * Math.PI) * 2.8;
    let discharge = 15 + Math.pow(stage, 2.3) * 8.5;
    let rainfall = 0;
    const temp = 28 + Math.cos((i / 365) * 2 * Math.PI) * 6;

    if (isRainySeason) {
      rainfall = (i % 4 === 0 ? 12 : i % 7 === 0 ? 34 : 0) + (isPeakFlood ? 18 : 0);
      stage += rainfall * 0.05;
      discharge += rainfall * 1.8;
    }

    if (isSuspect) {
      stage *= 2.4; // Glitch spike
      discharge *= 2.8;
    }

    const iso = cur.toISOString();
    const dateFormatted = cur.toISOString().split('T')[0];

    readings.push({
      id: `meas-${i + 1}`,
      observedAt: iso,
      dateFormatted,
      stageM: isBreak ? null : Number(stage.toFixed(2)),
      dischargeM3s: isBreak ? null : Number(discharge.toFixed(2)),
      rainfallMm: isBreak ? null : Number(rainfall.toFixed(1)),
      tempC: isBreak ? null : Number(temp.toFixed(1)),
      quality: isSuspect ? 'suspect' : i % 5 === 0 ? 'raw' : 'checked',
      isBreak,
    });
  }

  return readings;
}

export function BlisStationReadingsView() {
  const canImport = useCan('blis.irrigation.write');
  const [selectedStationId] = React.useState<string>('HYD-HJB-001');
  const [parameter, setParameter] = React.useState<'discharge' | 'stage' | 'rainfall' | 'temp'>(
    'discharge',
  );
  const [dateRange, setDateRange] = React.useState<DateRangePreset>('365d');
  const [aggregation, setAggregation] = React.useState<TimeAggregation>('daily');
  const [hoveredPoint, setHoveredPoint] = React.useState<HydrometMeasurement | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);

  const allReadings = React.useMemo(() => generateYearlyReadings(), []);

  // Filter based on Date Range
  const filteredReadings = React.useMemo(() => {
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 365;
    return allReadings.slice(allReadings.length - days);
  }, [allReadings, dateRange]);

  // Aggregate if monthly or yearly
  const displayData = React.useMemo(() => {
    if (aggregation === 'monthly') {
      const grouped: { [key: string]: HydrometMeasurement[] } = {};
      filteredReadings.forEach((r) => {
        const key = r.dateFormatted.substring(0, 7); // YYYY-MM
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      });

      return Object.entries(grouped).map(([monthKey, list]) => {
        const valids = list.filter((x) => !x.isBreak);
        const avgDischarge =
          valids.reduce((acc, c) => acc + (c.dischargeM3s || 0), 0) / (valids.length || 1);
        const avgStage = valids.reduce((acc, c) => acc + (c.stageM || 0), 0) / (valids.length || 1);
        const totalRain = valids.reduce((acc, c) => acc + (c.rainfallMm || 0), 0);
        const avgTemp = valids.reduce((acc, c) => acc + (c.tempC || 0), 0) / (valids.length || 1);

        return {
          id: `month-${monthKey}`,
          observedAt: `${monthKey}-01T00:00:00Z`,
          dateFormatted: monthKey,
          stageM: Number(avgStage.toFixed(2)),
          dischargeM3s: Number(avgDischarge.toFixed(2)),
          rainfallMm: Number(totalRain.toFixed(1)),
          tempC: Number(avgTemp.toFixed(1)),
          quality: 'checked' as const,
          isBreak: valids.length === 0,
        };
      });
    }

    return filteredReadings;
  }, [filteredReadings, aggregation]);

  // Compute metrics
  const validValues = displayData
    .map((d) =>
      parameter === 'discharge'
        ? d.dischargeM3s
        : parameter === 'stage'
          ? d.stageM
          : parameter === 'rainfall'
            ? d.rainfallMm
            : d.tempC,
    )
    .filter((v): v is number => v !== null);

  const maxValue = validValues.length > 0 ? Math.max(...validValues) : 100;
  const minValue = validValues.length > 0 ? Math.min(...validValues) : 0;
  const avgValue =
    validValues.length > 0 ? validValues.reduce((a, b) => a + b, 0) / validValues.length : 0;
  const suspectCount = displayData.filter((d) => d.quality === 'suspect').length;
  const breakCount = displayData.filter((d) => d.isBreak).length;

  const getParamUnit = () => {
    switch (parameter) {
      case 'discharge':
        return 'm³/s';
      case 'stage':
        return 'meters';
      case 'rainfall':
        return 'mm';
      case 'temp':
        return '°C';
    }
  };

  const getParamLabel = () => {
    switch (parameter) {
      case 'discharge':
        return 'River Stage-Discharge Rate';
      case 'stage':
        return 'River Stage / Gauge Water Level';
      case 'rainfall':
        return 'Daily Precipitation Depth';
      case 'temp':
        return 'Ambient Air Temperature';
    }
  };

  // Export filtered readings to CSV
  const handleExportCSV = () => {
    const headers = [
      'Date',
      'Stage (m)',
      'Discharge (m3/s)',
      'Rainfall (mm)',
      'Temperature (C)',
      'Quality Flag',
    ];
    const rows = displayData.map((r) => [
      r.dateFormatted,
      r.stageM ?? '',
      r.dischargeM3s ?? '',
      r.rainfallMm ?? '',
      r.tempC ?? '',
      r.isBreak ? 'DATA_GAP_BREAK' : r.quality.toUpperCase(),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `hydromet_readings_${selectedStationId}_${parameter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              to="/blis/stations"
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Hydromet Stations
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-bold text-slate-700">Time-Series Hydrographs</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Wudil River Gauging Station (HYD-HJB-001)
            </h1>
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-mono text-xs">
              ADCP Telemetry Live
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Hadejia River Reach · Catchment: Hadejia-Jama'are Basin · Lat: 11.8124°N, Lon: 8.8412°E
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="min-h-[44px] gap-2 px-3 text-xs"
            onClick={handleExportCSV}
          >
            <Download className="w-4 h-4 text-slate-600" />
            Export CSV
          </Button>

          {canImport && (
            <Button
              className="bg-teal-700 hover:bg-teal-800 text-white min-h-[44px] gap-2 px-4 shadow-sm text-xs"
              onClick={() => setIsImportModalOpen(true)}
            >
              <UploadCloud className="w-4 h-4" />
              Import Telemetry CSV
            </Button>
          )}
        </div>
      </div>

      {/* Control Bar: Parameter, Range & Aggregation */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Parameter Selector */}
        <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto">
          <button
            type="button"
            onClick={() => setParameter('discharge')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all min-h-[40px] ${
              parameter === 'discharge'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Discharge (m³/s)
          </button>
          <button
            type="button"
            onClick={() => setParameter('stage')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all min-h-[40px] ${
              parameter === 'stage'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Water Level (m)
          </button>
          <button
            type="button"
            onClick={() => setParameter('rainfall')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all min-h-[40px] ${
              parameter === 'rainfall'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Rainfall (mm)
          </button>
          <button
            type="button"
            onClick={() => setParameter('temp')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all min-h-[40px] ${
              parameter === 'temp'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Temperature (°C)
          </button>
        </div>

        {/* Aggregation & Range Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
            {(['7d', '30d', '90d', '365d'] as DateRangePreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDateRange(preset)}
                className={`px-3 py-2 text-xs font-bold transition-all min-h-[38px] ${
                  dateRange === preset
                    ? 'bg-white text-teal-800 shadow-sm border-x border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {preset.toUpperCase()}
              </button>
            ))}
          </div>

          <Select value={aggregation} onValueChange={(val: TimeAggregation) => setAggregation(val)}>
            <SelectTrigger className="h-10 min-w-[130px] text-xs">
              <SelectValue placeholder="Aggregation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="raw">Raw Readings</SelectItem>
              <SelectItem value="daily">Daily Mean</SelectItem>
              <SelectItem value="monthly">Monthly Aggregate</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Status Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Peak Observed
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1">
            {maxValue.toFixed(2)}{' '}
            <span className="text-xs font-normal text-slate-500">{getParamUnit()}</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Low / Baseflow
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1">
            {minValue.toFixed(2)}{' '}
            <span className="text-xs font-normal text-slate-500">{getParamUnit()}</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Period Mean
          </div>
          <div className="text-xl font-bold text-teal-800 mt-1">
            {avgValue.toFixed(2)}{' '}
            <span className="text-xs font-normal text-slate-500">{getParamUnit()}</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Telemetry Gaps (Breaks)
          </div>
          <div className="text-xl font-bold text-slate-600 mt-1 flex items-center gap-1.5">
            {breakCount} <span className="text-xs font-normal text-slate-400">breaks</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Flagged Suspect
          </div>
          <div className="text-xl font-bold text-rose-600 mt-1 flex items-center gap-1.5">
            {suspectCount} <span className="text-xs font-normal text-rose-400">outliers</span>
          </div>
        </div>
      </div>

      {/* Main Hydrograph Time-Series Canvas */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-700" />
              {getParamLabel()}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Continuous vector-rendered telemetry sequence with data breaks and QA markers.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-teal-600 rounded-full inline-block" />
              Valid Hydrograph
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              Suspect Flag
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t border-dashed border-slate-400 inline-block" />
              Telemetry Gap (Break)
            </span>
          </div>
        </div>

        {/* SVG Time-Series Chart Area */}
        <div className="relative w-full h-80 bg-slate-50/50 rounded-xl border border-slate-100 p-4 select-none overflow-hidden">
          <svg
            className="w-full h-full overflow-visible"
            viewBox="0 0 1000 300"
            preserveAspectRatio="none"
          >
            {/* Horizontal Grid lines */}
            <line x1="0" y1="50" x2="1000" y2="50" stroke="#e2e8f0" strokeDasharray="3 3" />
            <line x1="0" y1="125" x2="1000" y2="125" stroke="#e2e8f0" strokeDasharray="3 3" />
            <line x1="0" y1="200" x2="1000" y2="200" stroke="#e2e8f0" strokeDasharray="3 3" />
            <line x1="0" y1="275" x2="1000" y2="275" stroke="#cbd5e1" />

            {/* Render Hydrograph Segments (breaks represented as distinct disconnected segments) */}
            {(() => {
              const segments: { x: number; y: number; point: HydrometMeasurement }[][] = [];
              let currentSegment: { x: number; y: number; point: HydrometMeasurement }[] = [];

              displayData.forEach((pt, index) => {
                const val =
                  parameter === 'discharge'
                    ? pt.dischargeM3s
                    : parameter === 'stage'
                      ? pt.stageM
                      : parameter === 'rainfall'
                        ? pt.rainfallMm
                        : pt.tempC;

                const x = (index / (displayData.length - 1 || 1)) * 1000;

                if (pt.isBreak || val === null) {
                  if (currentSegment.length > 0) {
                    segments.push(currentSegment);
                    currentSegment = [];
                  }
                } else {
                  // Normalize y between height 275 and 40
                  const ratio = (val - minValue) / (maxValue - minValue || 1);
                  const y = 275 - ratio * 230;
                  currentSegment.push({ x, y, point: pt });
                }
              });

              if (currentSegment.length > 0) {
                segments.push(currentSegment);
              }

              return (
                <>
                  {/* Paths */}
                  {segments.map((seg, idx) => {
                    const pathStr = seg
                      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                      .join(' ');

                    return (
                      <g key={`seg-${idx}`}>
                        <path
                          d={pathStr}
                          fill="none"
                          stroke="#0d9488"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {/* Shaded Area under curve */}
                        <path
                          d={`${pathStr} L ${seg[seg.length - 1].x.toFixed(1)} 275 L ${seg[0].x.toFixed(1)} 275 Z`}
                          fill="url(#hydroGradient)"
                          opacity="0.15"
                        />
                      </g>
                    );
                  })}

                  {/* Suspect Points & Hover Targets */}
                  {segments.flat().map((pt, i) => {
                    const isSuspect = pt.point.quality === 'suspect';
                    return (
                      <g key={`pt-${i}`}>
                        {isSuspect && (
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="6"
                            fill="#f43f5e"
                            stroke="#ffffff"
                            strokeWidth="2"
                            className="cursor-pointer animate-pulse"
                            onMouseEnter={() => setHoveredPoint(pt.point)}
                          />
                        )}
                        {/* Interactive invisible hover hitboxes */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="8"
                          fill="transparent"
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredPoint(pt.point)}
                        />
                      </g>
                    );
                  })}
                </>
              );
            })()}

            <defs>
              <linearGradient id="hydroGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d9488" />
                <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>

          {/* Hover Tooltip Overlay */}
          {hoveredPoint && (
            <div className="absolute top-4 right-4 bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs space-y-1 pointer-events-none border border-slate-700 animate-in fade-in">
              <div className="font-bold text-teal-400">{hoveredPoint.dateFormatted}</div>
              <div>
                Discharge:{' '}
                <span className="font-mono font-bold text-white">
                  {hoveredPoint.dischargeM3s !== null ? `${hoveredPoint.dischargeM3s} m³/s` : 'GAP'}
                </span>
              </div>
              <div>
                Water Level:{' '}
                <span className="font-mono text-white">
                  {hoveredPoint.stageM !== null ? `${hoveredPoint.stageM} m` : 'GAP'}
                </span>
              </div>
              <div>
                Rainfall:{' '}
                <span className="font-mono text-white">
                  {hoveredPoint.rainfallMm !== null ? `${hoveredPoint.rainfallMm} mm` : '0 mm'}
                </span>
              </div>
              <div className="pt-1 border-t border-slate-700 flex items-center justify-between gap-4">
                <span className="text-slate-400">QA Status:</span>
                <span
                  className={`font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded ${
                    hoveredPoint.quality === 'checked'
                      ? 'bg-emerald-950 text-emerald-400'
                      : hoveredPoint.quality === 'raw'
                        ? 'bg-sky-950 text-sky-400'
                        : 'bg-rose-950 text-rose-400'
                  }`}
                >
                  {hoveredPoint.quality}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* X-Axis Timeline Labels */}
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-2">
          <span>{displayData[0]?.dateFormatted || 'Start'}</span>
          <span>{displayData[Math.floor(displayData.length / 2)]?.dateFormatted || 'Mid'}</span>
          <span>{displayData[displayData.length - 1]?.dateFormatted || 'Latest'}</span>
        </div>
      </div>

      {/* Historical Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="font-bold text-slate-800 text-sm">
            Telemetry Time-Series Observation Ledger ({displayData.length} entries)
          </div>
        </div>

        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase tracking-wider sticky top-0">
              <tr>
                <th className="py-2.5 px-4">Observation Date</th>
                <th className="py-2.5 px-4">Water Level (m)</th>
                <th className="py-2.5 px-4">Discharge (m³/s)</th>
                <th className="py-2.5 px-4">Rainfall (mm)</th>
                <th className="py-2.5 px-4">Temperature (°C)</th>
                <th className="py-2.5 px-4">Quality & Gap Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {displayData
                .slice(-15)
                .reverse()
                .map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-900">
                      {r.dateFormatted}
                    </td>
                    <td className="py-2.5 px-4">
                      {r.stageM !== null ? (
                        `${r.stageM.toFixed(2)} m`
                      ) : (
                        <span className="text-slate-400">---</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-teal-800">
                      {r.dischargeM3s !== null ? (
                        `${r.dischargeM3s.toFixed(2)} m³/s`
                      ) : (
                        <span className="text-slate-400">---</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {r.rainfallMm !== null ? (
                        `${r.rainfallMm} mm`
                      ) : (
                        <span className="text-slate-400">---</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {r.tempC !== null ? (
                        `${r.tempC} °C`
                      ) : (
                        <span className="text-slate-400">---</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {r.isBreak ? (
                        <Badge className="bg-slate-100 text-slate-600 border-slate-300">
                          Data Gap (Break)
                        </Badge>
                      ) : r.quality === 'checked' ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                          Checked QA
                        </Badge>
                      ) : r.quality === 'raw' ? (
                        <Badge className="bg-sky-100 text-sky-800 border-sky-300">
                          Raw Telemetry
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-100 text-rose-800 border-rose-300">
                          Flagged Suspect
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* In-Page Telemetry Import Modal */}
      {isImportModalOpen && (
        <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900">
                Import Hydromet Logger Measurements (CSV)
              </DialogTitle>
            </DialogHeader>
            <ImportWizard
              initialDatasetId="blis.station"
              onCancel={() => setIsImportModalOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
