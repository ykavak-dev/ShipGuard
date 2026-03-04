import type { ScanResult, Finding, Rule } from '../scanner';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return '#ef4444';
    case 'medium': return '#f59e0b';
    case 'low': return '#6b7280';
    default: return '#9ca3af';
  }
}

function severityBg(severity: string): string {
  switch (severity) {
    case 'critical': return '#fef2f2';
    case 'medium': return '#fffbeb';
    case 'low': return '#f9fafb';
    default: return '#f9fafb';
  }
}

export function generateHtmlReport(
  scanResult: ScanResult,
  score: number,
  threshold: number,
  rules: Rule[],
): string {
  const allFindings: Finding[] = [
    ...scanResult.critical,
    ...scanResult.medium,
    ...scanResult.low,
  ];

  const counts = {
    critical: scanResult.critical.length,
    medium: scanResult.medium.length,
    low: scanResult.low.length,
    total: allFindings.length,
  };

  const passed = score >= threshold;
  const now = new Date().toISOString();
  const meta = scanResult.metadata;

  const ruleMap = new Map(rules.map(r => [r.id, r]));

  const findingsJson = JSON.stringify(allFindings.map((f, i) => ({
    idx: i,
    severity: f.severity,
    ruleId: f.ruleId,
    filePath: f.filePath,
    line: f.line || 0,
    message: f.message,
    category: f.category,
    ruleDescription: ruleMap.get(f.ruleId)?.description || '',
  })));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ShipGuard Security Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
  .container { max-width: 1100px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 24px; font-weight: 700; }
  h2 { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0; }
  .header-right { text-align: right; color: #64748b; font-size: 14px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
  .card-value { font-size: 36px; font-weight: 700; }
  .card-label { font-size: 14px; color: #64748b; margin-top: 4px; }
  .score-section { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; }
  .score-bar-bg { background: #e2e8f0; border-radius: 99px; height: 24px; overflow: hidden; margin: 12px 0; }
  .score-bar-fill { height: 100%; border-radius: 99px; transition: width 0.3s; }
  .score-info { display: flex; justify-content: space-between; font-size: 14px; color: #64748b; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; color: #fff; }
  .badge-pass { background: #22c55e; }
  .badge-fail { background: #ef4444; }
  .filters { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 16px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  .filters label { font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
  .filters input[type="checkbox"] { width: 16px; height: 16px; }
  .sort-select { font-size: 14px; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  th { background: #f1f5f9; text-align: left; padding: 12px 16px; font-size: 13px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; }
  td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
  tr.clickable { cursor: pointer; }
  tr.clickable:hover { background: #f8fafc; }
  .sev-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
  .detail-row { display: none; }
  .detail-row.open { display: table-row; }
  .detail-cell { padding: 12px 16px 16px 40px; background: #f8fafc; font-size: 13px; }
  .detail-cell p { margin-bottom: 6px; }
  .detail-cell .label { color: #64748b; font-weight: 600; }
  .meta { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-top: 24px; }
  .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 12px; }
  .meta-item .label { font-size: 12px; color: #64748b; }
  .meta-item .value { font-size: 16px; font-weight: 600; }
  .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 32px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <h1>ShipGuard Security Report</h1>
    </div>
    <div class="header-right">
      <div>${escapeHtml(now)}</div>
      <span class="badge ${passed ? 'badge-pass' : 'badge-fail'}">${passed ? 'PASSED' : 'FAILED'}</span>
    </div>
  </div>

  <div class="score-section">
    <h2>Risk Score</h2>
    <div class="score-bar-bg">
      <div class="score-bar-fill" style="width:${score}%;background:${scoreColor(score)}"></div>
    </div>
    <div class="score-info">
      <span>Score: <strong>${score}</strong>/100</span>
      <span>Threshold: ${threshold}</span>
    </div>
  </div>

  <div class="cards">
    <div class="card">
      <div class="card-value" style="color:${severityColor('critical')}">${counts.critical}</div>
      <div class="card-label">Critical</div>
    </div>
    <div class="card">
      <div class="card-value" style="color:${severityColor('medium')}">${counts.medium}</div>
      <div class="card-label">Medium</div>
    </div>
    <div class="card">
      <div class="card-value" style="color:${severityColor('low')}">${counts.low}</div>
      <div class="card-label">Low</div>
    </div>
    <div class="card">
      <div class="card-value" style="color:#1e293b">${counts.total}</div>
      <div class="card-label">Total</div>
    </div>
  </div>

  <div class="filters">
    <strong style="font-size:14px">Filter:</strong>
    <label><input type="checkbox" checked data-sev="critical"> Critical</label>
    <label><input type="checkbox" checked data-sev="medium"> Medium</label>
    <label><input type="checkbox" checked data-sev="low"> Low</label>
    <span style="margin-left:auto">
      <select class="sort-select" id="sortSelect">
        <option value="severity">Sort by Severity</option>
        <option value="file">Sort by File</option>
        <option value="rule">Sort by Rule</option>
      </select>
    </span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:100px">Severity</th>
        <th>Rule</th>
        <th>File</th>
        <th style="width:60px">Line</th>
      </tr>
    </thead>
    <tbody id="findingsBody"></tbody>
  </table>

  ${meta ? `
  <div class="meta">
    <h2>Scan Metadata</h2>
    <div class="meta-grid">
      <div class="meta-item"><div class="label">Duration</div><div class="value">${meta.durationMs}ms</div></div>
      <div class="meta-item"><div class="label">Files Scanned</div><div class="value">${meta.filesScanned}</div></div>
      <div class="meta-item"><div class="label">Files Skipped</div><div class="value">${meta.filesSkipped}</div></div>
      <div class="meta-item"><div class="label">Rules Loaded</div><div class="value">${meta.rulesLoaded}</div></div>
      <div class="meta-item"><div class="label">Started</div><div class="value">${escapeHtml(meta.startedAt)}</div></div>
      <div class="meta-item"><div class="label">Completed</div><div class="value">${escapeHtml(meta.completedAt)}</div></div>
    </div>
  </div>` : ''}

  <div class="footer">Generated by ShipGuard v2.0.0</div>
</div>

<script>
(function(){
  var findings = ${findingsJson};
  var sevOrder = {critical:0, medium:1, low:2};
  var body = document.getElementById('findingsBody');
  var filters = document.querySelectorAll('[data-sev]');
  var sortSel = document.getElementById('sortSelect');

  function esc(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  function sevColor(s) {
    return s === 'critical' ? '${severityColor('critical')}' : s === 'medium' ? '${severityColor('medium')}' : '${severityColor('low')}';
  }

  function sevBg(s) {
    return s === 'critical' ? '${severityBg('critical')}' : s === 'medium' ? '${severityBg('medium')}' : '${severityBg('low')}';
  }

  function render() {
    var checked = {};
    filters.forEach(function(cb) { checked[cb.dataset.sev] = cb.checked; });

    var visible = findings.filter(function(f) { return checked[f.severity]; });

    var sort = sortSel.value;
    visible.sort(function(a, b) {
      if (sort === 'severity') return (sevOrder[a.severity] || 0) - (sevOrder[b.severity] || 0);
      if (sort === 'file') return a.filePath.localeCompare(b.filePath);
      return a.ruleId.localeCompare(b.ruleId);
    });

    var html = '';
    visible.forEach(function(f) {
      html += '<tr class="clickable" data-idx="' + f.idx + '">';
      html += '<td><span class="sev-badge" style="background:' + sevBg(f.severity) + ';color:' + sevColor(f.severity) + '">' + esc(f.severity) + '</span></td>';
      html += '<td>' + esc(f.ruleId) + '</td>';
      html += '<td>' + esc(f.filePath) + '</td>';
      html += '<td>' + (f.line || '-') + '</td>';
      html += '</tr>';
      html += '<tr class="detail-row" data-detail="' + f.idx + '">';
      html += '<td colspan="4" class="detail-cell">';
      html += '<p><span class="label">Message:</span> ' + esc(f.message) + '</p>';
      html += '<p><span class="label">Category:</span> ' + esc(f.category) + '</p>';
      if (f.ruleDescription) html += '<p><span class="label">Rule:</span> ' + esc(f.ruleDescription) + '</p>';
      html += '</td></tr>';
    });

    body.innerHTML = html;
  }

  filters.forEach(function(cb) { cb.addEventListener('change', render); });
  sortSel.addEventListener('change', render);

  body.addEventListener('click', function(e) {
    var row = e.target.closest('tr.clickable');
    if (!row) return;
    var idx = row.dataset.idx;
    var detail = document.querySelector('tr[data-detail="' + idx + '"]');
    if (detail) detail.classList.toggle('open');
  });

  render();
})();
</script>
</body>
</html>`;
}
