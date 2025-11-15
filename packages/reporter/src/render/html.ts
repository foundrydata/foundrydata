/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import {
  CoverageEntrySnapshot,
  DiagnosticEnvelope,
  InstanceResult,
  Report,
} from '../model/report.js';

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDiagnosticGroup(
  title: string,
  diagnostics?: DiagnosticEnvelope[]
): string {
  if (!diagnostics?.length) {
    return `<div class="diag-group"><h4>${title}</h4><p class="empty">No entries</p></div>`;
  }
  const items = diagnostics
    .map(
      (diag) =>
        `<li><span class="code">${escapeHtml(diag.code)}</span> @ ${escapeHtml(diag.canonPath)}<pre>${escapeHtml(
          diag.details ? JSON.stringify(diag.details, null, 2) : '—'
        )}</pre></li>`
    )
    .join('');
  return `<div class="diag-group"><h4>${title}</h4><ul>${items}</ul></div>`;
}

function renderCoverageTable(entries?: CoverageEntrySnapshot[]): string {
  if (!entries?.length) {
    return '<p class="empty">No coverage entries captured.</p>';
  }
  const rows = entries
    .map((entry) => {
      const enumerated = entry.enumeratedKeys?.join(', ') ?? '—';
      const provenance = entry.provenance?.join(', ') ?? '—';
      return `<tr><td>${escapeHtml(entry.canonPath)}</td><td>${escapeHtml(entry.hasUniverse ?? '—')}</td><td>${escapeHtml(
        enumerated
      )}</td><td>${escapeHtml(provenance)}</td></tr>`;
    })
    .join('');
  return `<table><thead><tr><th>canonPath</th><th>hasUniverse</th><th>enumeratedKeys</th><th>provenance</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderInstance(instance: InstanceResult): string {
  const badgeClass = `badge badge-${instance.outcome}`;
  const errors = instance.validationErrors?.length ?? 0;
  const repairs = instance.repairActions?.length ?? 0;
  const diagnostics = instance.diagnostics
    ?.map(
      (diag) =>
        `<li>${escapeHtml(diag.code)} @ ${escapeHtml(diag.canonPath)}</li>`
    )
    .join('');
  return `<article class="instance">
    <header>
      <h3>Instance #${instance.index}</h3>
      <span class="${badgeClass}">${escapeHtml(instance.outcome)}</span>
    </header>
    <pre>${escapeHtml(JSON.stringify(instance.data, null, 2))}</pre>
    <p class="stats">validation errors: ${errors} · repair actions: ${repairs}</p>
    ${instance.notes ? `<p class="notes">${escapeHtml(instance.notes)}</p>` : ''}
    ${diagnostics ? `<ul class="instance-diag">${diagnostics}</ul>` : ''}
  </article>`;
}

export function renderHtmlReport(report: Report): string {
  const summary = report.summary;
  const timings = summary.timings;
  const composeDiag = report.compose?.result?.diag;

  const styles = `body{font-family:system-ui,Segoe UI,sans-serif;margin:0;padding:2rem;background:#f7f7f8;color:#111}
header.hero{margin-bottom:2rem}
section{background:#fff;border-radius:0.75rem;padding:1.5rem;margin-bottom:1.5rem;box-shadow:0 1px 4px rgba(15,23,42,.08)}
h1{margin:0 0 .5rem 0;font-size:2rem}
.badge{display:inline-flex;align-items:center;padding:0.2rem 0.6rem;border-radius:999px;font-size:0.85rem;font-weight:600;text-transform:capitalize}
.badge-valid-unchanged{background:#d1fae5;color:#047857}
.badge-valid-repaired{background:#fef3c7;color:#92400e}
.badge-invalid{background:#fee2e2;color:#b91c1c}
table{width:100%;border-collapse:collapse;margin-top:0.5rem}
th,td{border:1px solid #e5e7eb;padding:0.5rem;text-align:left;font-size:0.9rem}
pre{background:#0f172a;color:#e0e7ff;padding:0.75rem;border-radius:0.5rem;overflow:auto;font-size:0.85rem}
ul{padding-left:1.25rem}
.diag-group{margin-bottom:1rem}
.diag-group ul{padding-left:1rem}
.diag-group li{margin-bottom:0.5rem}
.diag-group pre{margin-top:0.35rem}
.instances{display:grid;gap:1rem}
@media(min-width:900px){.instances{grid-template-columns:repeat(2,minmax(0,1fr));}}
.empty{color:#6b7280;font-style:italic}
`;

  const timingRows = timings
    ? ['normalize', 'compose', 'generate', 'repair', 'validate', 'compile']
        .map((step) => {
          const value = (timings as Record<string, number | undefined>)[
            `${step}Ms` as keyof typeof timings
          ];
          if (step === 'compile') {
            return timings.compileMs !== undefined
              ? `<tr><td>${step}</td><td>${timings.compileMs}</td></tr>`
              : '';
          }
          return `<tr><td>${step}</td><td>${value ?? 'n/a'}</td></tr>`;
        })
        .join('')
    : '<tr><td colspan="2">No timings provided</td></tr>';

  const diagSummary = summary.diagnosticsCount;
  const instanceCards = report.instances.map(renderInstance).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>JSON Schema Report – ${escapeHtml(report.schemaId)}</title>
  <style>${styles}</style>
</head>
<body>
  <header class="hero">
    <h1>JSON Schema Report – ${escapeHtml(report.schemaId)}</h1>
    <p>Tool ${escapeHtml(report.meta.toolName)} ${escapeHtml(report.meta.toolVersion)} · Engine ${escapeHtml(
      report.meta.engineVersion ?? 'n/a'
    )}</p>
    <p>Timestamp ${escapeHtml(report.meta.timestamp)} · Seed ${escapeHtml(report.meta.seed ?? 'n/a')}</p>
    <p>${summary.totalInstances} instances · ${summary.validUnchanged} unchanged · ${summary.validRepaired} repaired · ${
      summary.invalid
    } invalid</p>
  </header>

  <section>
    <h2>Timings</h2>
    <table>
      <thead><tr><th>Step</th><th>Duration (ms)</th></tr></thead>
      <tbody>${timingRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Diagnostics Summary</h2>
    <ul>
      <li>Normalize notes: ${diagSummary.normalizeNotes}</li>
      <li>Compose fatal: ${diagSummary.composeFatal}</li>
      <li>Compose warn: ${diagSummary.composeWarn}</li>
      <li>Compose unsat hints: ${diagSummary.composeUnsatHints}</li>
      <li>Compose run-level: ${diagSummary.composeRunLevel}</li>
      <li>Repair budget exhausted: ${diagSummary.repairBudgetExhausted}</li>
      <li>Validate errors: ${diagSummary.validateErrors}</li>
    </ul>
    <div class="diag-grid">
      ${renderDiagnosticGroup('fatal', composeDiag?.fatal)}
      ${renderDiagnosticGroup('warn', composeDiag?.warn)}
      ${renderDiagnosticGroup('unsatHints', composeDiag?.unsatHints)}
      ${renderDiagnosticGroup('run', composeDiag?.run)}
    </div>
  </section>

  <section>
    <h2>Coverage Index Snapshot</h2>
    ${renderCoverageTable(report.compose?.coverageIndexSnapshot)}
  </section>

  <section>
    <h2>Instances</h2>
    <div class="instances">
      ${instanceCards}
    </div>
  </section>
</body>
</html>`;
}
