import { escapeHtml } from '../escape-html';

export interface IndicatorRowData {
  code: string;
  name: string;
  periodYear: number;
  periodQuarter: number;
  target?: number | null;
  value?: number | null;
  endTarget?: number | null;
  pctOfEndTarget?: number | null;
  status: string;
}

export interface IndicatorMatrixReportData {
  scopeTitle: string;
  scopeType: string;
  generatedAt: string;
  year?: number;
  quarter?: number;
  totalIndicators: number;
  onTrackCount: number;
  offTrackCount: number;
  indicators: IndicatorRowData[];
}

export function renderIndicatorMatrixReportHtml(data: IndicatorMatrixReportData): string {
  const rows = data.indicators.length
    ? data.indicators
        .map(
          (ind) => `
        <tr>
          <td class="font-mono"><strong>${escapeHtml(ind.code)}</strong></td>
          <td>${escapeHtml(ind.name)}</td>
          <td class="text-right">${ind.target != null ? escapeHtml(ind.target.toLocaleString('en-US')) : '<span class="muted">-</span>'}</td>
          <td class="text-right"><strong>${ind.value != null ? escapeHtml(ind.value.toLocaleString('en-US')) : '<span class="muted">-</span>'}</strong></td>
          <td class="text-right">${ind.endTarget != null ? escapeHtml(ind.endTarget.toLocaleString('en-US')) : '<span class="muted">-</span>'}</td>
          <td class="text-right">${ind.pctOfEndTarget != null ? `${escapeHtml(ind.pctOfEndTarget.toFixed(1))}%` : '<span class="muted">-</span>'}</td>
          <td class="text-center"><span class="badge badge-${escapeHtml(ind.status.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}">${escapeHtml(ind.status.replace(/_/g, ' '))}</span></td>
        </tr>`,
        )
        .join('')
    : '<tr><td colspan="7" class="text-center muted">No indicator matrix data found for this period</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>M&E Indicator Matrix - ${escapeHtml(data.scopeTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #1a202c;
      font-size: 11px;
      line-height: 1.4;
      margin: 0;
      padding: 0;
    }
    .header {
      border-bottom: 2px solid #2b6cb0;
      padding-bottom: 10px;
      margin-bottom: 16px;
    }
    .header h1 {
      margin: 0 0 4px 0;
      font-size: 18px;
      color: #2b6cb0;
    }
    .header .subtitle {
      font-size: 12px;
      color: #4a5568;
    }
    .meta-bar {
      display: flex;
      justify-content: space-between;
      background: #edf2f7;
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 16px;
      font-size: 11px;
    }
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 10px;
      background: #ffffff;
    }
    .card-title {
      font-size: 10px;
      text-transform: uppercase;
      color: #718096;
      font-weight: 600;
    }
    .stat-number {
      font-size: 20px;
      font-weight: 700;
      color: #2d3748;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    th, td {
      padding: 6px 8px;
      border-bottom: 1px solid #e2e8f0;
      text-align: left;
    }
    th {
      background: #f7fafc;
      color: #4a5568;
      font-weight: 600;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .muted { color: #a0aec0; }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .badge-on_track, .badge-on-track { background: #c6f6d5; color: #22543d; }
    .badge-off_track, .badge-off-track { background: #fed7d7; color: #742a2a; }
    .badge-not_available, .badge-not-available { background: #edf2f7; color: #4a5568; }
    .footer {
      margin-top: 24px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      font-size: 9px;
      color: #a0aec0;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Monitoring & Evaluation Indicator Matrix</h1>
    <div class="subtitle">Scope: ${escapeHtml(data.scopeTitle)} (${escapeHtml(data.scopeType.toUpperCase())})</div>
  </div>

  <div class="meta-bar">
    <div><strong>Reporting Period:</strong> Year ${escapeHtml(data.year ? String(data.year) : 'All')}${data.quarter ? ` / Q${escapeHtml(String(data.quarter))}` : ''}</div>
    <div><strong>Generated On:</strong> ${escapeHtml(data.generatedAt)}</div>
  </div>

  <div class="summary-cards">
    <div class="card">
      <div class="card-title">Total Indicators</div>
      <div class="stat-number">${escapeHtml(data.totalIndicators.toLocaleString('en-US'))}</div>
    </div>
    <div class="card">
      <div class="card-title">On Track</div>
      <div class="stat-number" style="color: #276749;">${escapeHtml(data.onTrackCount.toLocaleString('en-US'))}</div>
    </div>
    <div class="card">
      <div class="card-title">Off Track / Lagging</div>
      <div class="stat-number" style="color: #9b2c2c;">${escapeHtml(data.offTrackCount.toLocaleString('en-US'))}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 12%;">Code</th>
        <th style="width: 38%;">Indicator Name</th>
        <th style="width: 10%;" class="text-right">Target</th>
        <th style="width: 10%;" class="text-right">Actual Value</th>
        <th style="width: 10%;" class="text-right">End Target</th>
        <th style="width: 10%;" class="text-right">% of End</th>
        <th style="width: 10%;" class="text-center">Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">
    TRIMING IDMIS 2.0 &bull; Monitoring & Evaluation Directorate &bull; Confidential
  </div>
</body>
</html>`;
}
