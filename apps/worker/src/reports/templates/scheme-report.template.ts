import { escapeHtml } from '../escape-html';

export interface SchemeReportData {
  schemeName: string;
  schemeCode: string;
  stateName: string;
  generatedAt: string;
  year?: number;
  seasonName?: string;
  farmers: {
    total: number;
    male: number;
    female: number;
  };
  areaByService: Array<{
    serviceType: string;
    areaHa: number;
    plotsCount: number;
  }>;
  cropping: {
    totalCultivatedHa: number;
    totalYieldMt: number;
  };
  feeRecovery: {
    totalBilledNgn: number;
    totalCollectedNgn: number;
    recoveryRatePct: number;
  };
  waterRequests: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
  };
}

export function renderSchemeReportHtml(data: SchemeReportData): string {
  const areaRows = data.areaByService.length
    ? data.areaByService
        .map(
          (row) => `
        <tr>
          <td>${escapeHtml(row.serviceType)}</td>
          <td class="text-right">${escapeHtml(row.areaHa.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} ha</td>
          <td class="text-right">${escapeHtml(row.plotsCount.toLocaleString('en-US'))}</td>
        </tr>`,
        )
        .join('')
    : '<tr><td colspan="3" class="text-center muted">No service area data available</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(data.schemeName)} - Scheme Report</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #1a202c;
      font-size: 12px;
      line-height: 1.5;
      margin: 0;
      padding: 0;
    }
    .header {
      border-bottom: 2px solid #2b6cb0;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0 0 4px 0;
      font-size: 20px;
      color: #2b6cb0;
    }
    .header .subtitle {
      font-size: 13px;
      color: #4a5568;
    }
    .meta-bar {
      display: flex;
      justify-content: space-between;
      background: #edf2f7;
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 20px;
      font-size: 11px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px;
      background: #ffffff;
    }
    .card-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #718096;
      margin-bottom: 6px;
      font-weight: 600;
    }
    .stat-number {
      font-size: 22px;
      font-weight: 700;
      color: #2d3748;
    }
    .stat-subtext {
      font-size: 11px;
      color: #718096;
      margin-top: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 11px;
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
    .muted { color: #a0aec0; }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: #2d3748;
      margin: 16px 0 8px 0;
      padding-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
    }
    .footer {
      margin-top: 30px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: 10px;
      color: #a0aec0;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(data.schemeName)} (${escapeHtml(data.schemeCode)})</h1>
    <div class="subtitle">State: ${escapeHtml(data.stateName)} | TRIMING IDMIS 2.0 Official Scheme Report</div>
  </div>

  <div class="meta-bar">
    <div><strong>Reporting Period:</strong> ${escapeHtml(data.year ? String(data.year) : 'All Time')}${data.seasonName ? ` / Season: ${escapeHtml(data.seasonName)}` : ''}</div>
    <div><strong>Generated On:</strong> ${escapeHtml(data.generatedAt)}</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Total Registered Farmers</div>
      <div class="stat-number">${escapeHtml(data.farmers.total.toLocaleString('en-US'))}</div>
      <div class="stat-subtext">Male: ${escapeHtml(data.farmers.male.toLocaleString('en-US'))} | Female: ${escapeHtml(data.farmers.female.toLocaleString('en-US'))}</div>
    </div>
    <div class="card">
      <div class="card-title">Irrigation Fee Recovery</div>
      <div class="stat-number">${escapeHtml(data.feeRecovery.recoveryRatePct.toFixed(1))}%</div>
      <div class="stat-subtext">Collected: ₦${escapeHtml(data.feeRecovery.totalCollectedNgn.toLocaleString('en-US'))} / ₦${escapeHtml(data.feeRecovery.totalBilledNgn.toLocaleString('en-US'))}</div>
    </div>
    <div class="card">
      <div class="card-title">Water Requests Handled</div>
      <div class="stat-number">${escapeHtml(data.waterRequests.total.toLocaleString('en-US'))}</div>
      <div class="stat-subtext">Approved: ${escapeHtml(data.waterRequests.approved.toLocaleString('en-US'))} | Rejected: ${escapeHtml(data.waterRequests.rejected.toLocaleString('en-US'))}</div>
    </div>
  </div>

  <div class="section-title">Irrigation Service Area Breakdown</div>
  <table>
    <thead>
      <tr>
        <th>Service Type</th>
        <th class="text-right">Total Area</th>
        <th class="text-right">Plots Count</th>
      </tr>
    </thead>
    <tbody>
      ${areaRows}
    </tbody>
  </table>

  <div class="section-title">Agricultural Production Summary</div>
  <div class="grid">
    <div class="card">
      <div class="card-title">Total Cultivated Area</div>
      <div class="stat-number">${escapeHtml(data.cropping.totalCultivatedHa.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))} ha</div>
    </div>
    <div class="card">
      <div class="card-title">Total Estimated Yield</div>
      <div class="stat-number">${escapeHtml(data.cropping.totalYieldMt.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))} MT</div>
    </div>
  </div>

  <div class="footer">
    Federal Ministry of Water Resources and Sanitation — TRIMING Project IDMIS 2.0 &bull; Confidential &bull; Generated for Authorized Personnel Only
  </div>
</body>
</html>`;
}
