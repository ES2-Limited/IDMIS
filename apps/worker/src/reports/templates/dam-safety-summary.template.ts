import { escapeHtml } from '../escape-html';

export interface DamSafetyRow {
  damCode: string;
  damName: string;
  stateName?: string;
  hazardClass?: string;
  lastInspectedOn?: string;
  meetsStandard: boolean;
  nextDueOn?: string;
  isOverdue: boolean;
}

export interface DamSafetySummaryReportData {
  scopeTitle: string;
  generatedAt: string;
  totalDams: number;
  meetingStandardCount: number;
  notMeetingStandardCount: number;
  overdueCount: number;
  dams: DamSafetyRow[];
}

export function renderDamSafetySummaryReportHtml(data: DamSafetySummaryReportData): string {
  const rows = data.dams.length
    ? data.dams
        .map((dam) => {
          let statusBadge = '<span class="badge badge-success">Meeting Standard</span>';
          if (dam.isOverdue) {
            statusBadge = '<span class="badge badge-danger">Inspection Overdue</span>';
          } else if (!dam.meetsStandard) {
            statusBadge = '<span class="badge badge-warning">Deficiencies Noted</span>';
          }

          return `
        <tr>
          <td class="font-mono"><strong>${escapeHtml(dam.damCode)}</strong></td>
          <td>${escapeHtml(dam.damName)}</td>
          <td>${escapeHtml(dam.hazardClass || 'Unclassified')}</td>
          <td>${escapeHtml(dam.lastInspectedOn || 'Never Inspected')}</td>
          <td>${escapeHtml(dam.nextDueOn || 'Not Scheduled')}</td>
          <td class="text-center">${statusBadge}</td>
        </tr>`;
        })
        .join('')
    : '<tr><td colspan="6" class="text-center muted">No dam assets found matching criteria</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Dam Safety Summary - ${escapeHtml(data.scopeTitle)}</title>
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
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
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
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .text-center { text-align: center; }
    .muted { color: #a0aec0; }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .badge-success { background: #c6f6d5; color: #22543d; }
    .badge-warning { background: #feebc8; color: #7b341e; }
    .badge-danger { background: #fed7d7; color: #742a2a; }
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
    <h1>Dam Safety & Surveillance Summary</h1>
    <div class="subtitle">Scope: ${escapeHtml(data.scopeTitle)} | BLIS Infrastructure Safety Directorate</div>
  </div>

  <div class="meta-bar">
    <div><strong>Target Assets:</strong> ${escapeHtml(data.totalDams.toLocaleString('en-US'))} Dams</div>
    <div><strong>Generated On:</strong> ${escapeHtml(data.generatedAt)}</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Total Dams</div>
      <div class="stat-number">${escapeHtml(data.totalDams.toLocaleString('en-US'))}</div>
    </div>
    <div class="card">
      <div class="card-title">Meeting Standard</div>
      <div class="stat-number" style="color: #276749;">${escapeHtml(data.meetingStandardCount.toLocaleString('en-US'))}</div>
    </div>
    <div class="card">
      <div class="card-title">Deficiencies Noted</div>
      <div class="stat-number" style="color: #c05621;">${escapeHtml(data.notMeetingStandardCount.toLocaleString('en-US'))}</div>
    </div>
    <div class="card">
      <div class="card-title">Inspection Overdue</div>
      <div class="stat-number" style="color: #9b2c2c;">${escapeHtml(data.overdueCount.toLocaleString('en-US'))}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 14%;">Code</th>
        <th style="width: 26%;">Dam Name</th>
        <th style="width: 16%;">Hazard Class</th>
        <th style="width: 14%;">Last Inspected</th>
        <th style="width: 14%;">Next Due</th>
        <th style="width: 16%;" class="text-center">Safety Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="footer">
    TRIMING IDMIS 2.0 &bull; Basin and Land Information System (BLIS) &bull; Safety Directorate
  </div>
</body>
</html>`;
}
