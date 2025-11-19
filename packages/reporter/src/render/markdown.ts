/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import {
  CoverageEntrySnapshot,
  InstanceResult,
  Report,
} from '../model/report.js';

function formatDetails(details?: unknown): string {
  if (details === undefined) {
    return '—';
  }
  const serialized = JSON.stringify(details);
  return serialized.length > 120 ? `${serialized.slice(0, 117)}…` : serialized;
}

function renderDiagnosticsList(
  title: string,
  diagnostics:
    | { code: string; canonPath: string; details?: unknown }[]
    | undefined
): string[] {
  if (!diagnostics?.length) {
    return [`- ${title}: none`];
  }
  const lines = [`- ${title}: ${diagnostics.length}`];
  diagnostics.forEach((diag) => {
    lines.push(
      `  - ${diag.code} @ ${diag.canonPath} (${formatDetails(diag.details)})`
    );
  });
  return lines;
}

function renderCoverageSnapshot(
  snapshot: CoverageEntrySnapshot[] | undefined
): string[] {
  if (!snapshot?.length) {
    return ['No coverage entries captured.'];
  }
  const header = '| canonPath | hasUniverse | enumeratedKeys | provenance |';
  const divider = '|---|---|---|---|';
  const rows = snapshot.map((entry) => {
    const enumerated = entry.enumeratedKeys ? entry.enumeratedKeys.length : 0;
    const provenance = entry.provenance?.join(', ') ?? '—';
    const enumeratedLabel = entry.enumeratedKeys?.slice(0, 4).join(', ') ?? '—';
    const keysInfo = `${enumeratedLabel}${enumerated > 4 ? ` (+${enumerated - 4} more)` : ''}`;
    return `| ${entry.canonPath} | ${entry.hasUniverse ?? '—'} | ${keysInfo} | ${provenance} |`;
  });
  return [header, divider, ...rows];
}

function renderInstance(instance: InstanceResult): string[] {
  const lines = [`### Instance #${instance.index} — ${instance.outcome}`];
  lines.push('', '```json');
  lines.push(JSON.stringify(instance.data, null, 2));
  lines.push('```');
  lines.push(
    `- validation errors: ${instance.validationErrors?.length ?? 0} | repair actions: ${
      instance.repairActions?.length ?? 0
    }`
  );
  if (instance.notes) {
    lines.push(`- notes: ${instance.notes}`);
  }
  if (instance.diagnostics?.length) {
    lines.push('- diagnostics:');
    instance.diagnostics.forEach((diag) => {
      lines.push(
        `  - ${diag.code} @ ${diag.canonPath} (${formatDetails(diag.details)})`
      );
    });
  }
  return lines;
}

export function renderMarkdownReport(report: Report): string {
  const lines: string[] = [];
  const summary = report.summary;
  const timings = summary.timings;

  lines.push(`# JSON Schema Report – ${report.schemaId}`, '');
  lines.push(`- Tool: ${report.meta.toolName} ${report.meta.toolVersion}`);
  lines.push(`- Engine: ${report.meta.engineVersion ?? 'n/a'}`);
  lines.push(`- Timestamp: ${report.meta.timestamp}`);
  lines.push(`- Seed: ${report.meta.seed ?? 'n/a'}`);
  lines.push(`- Instances: ${summary.totalInstances}`);
  lines.push(
    `  - valid (unchanged): ${summary.validUnchanged}`,
    `  - valid (repaired): ${summary.validRepaired}`,
    `  - invalid: ${summary.invalid}`
  );

  lines.push('', '## Timings', '', '| Step | Duration (ms) |', '|---|---|');
  const timingRows = [
    ['normalize', timings?.normalizeMs],
    ['compose', timings?.composeMs],
    ['generate', timings?.generateMs],
    ['repair', timings?.repairMs],
    ['validate', timings?.validateMs],
  ];
  timingRows.forEach(([label, value]) => {
    lines.push(`| ${label} | ${value ?? 'n/a'} |`);
  });
  if (timings?.compileMs !== undefined) {
    lines.push(`| compile | ${timings.compileMs} |`);
  }

  lines.push('', '## Diagnostics', '', '### Summary');
  const diag = summary.diagnosticsCount;
  lines.push(`- Normalize notes: ${diag.normalizeNotes}`);
  lines.push(`- Compose fatal: ${diag.composeFatal}`);
  lines.push(`- Compose warn: ${diag.composeWarn}`);
  lines.push(`- Compose unsat hints: ${diag.composeUnsatHints}`);
  lines.push(`- Compose run-level: ${diag.composeRunLevel}`);
  lines.push(`- Repair budget exhausted: ${diag.repairBudgetExhausted}`);
  lines.push(`- Validate errors: ${diag.validateErrors}`);

  const composeDiag = report.compose?.result?.diag;
  lines.push('', '### Compose diagnostics');
  lines.push(
    ...renderDiagnosticsList('fatal', composeDiag?.fatal),
    ...renderDiagnosticsList('warn', composeDiag?.warn),
    ...renderDiagnosticsList('unsatHints', composeDiag?.unsatHints),
    ...renderDiagnosticsList('run', composeDiag?.run)
  );

  lines.push('', '## Coverage Index (snapshot)', '');
  lines.push(...renderCoverageSnapshot(report.compose?.coverageIndexSnapshot));

  lines.push('', '## Instances', '');
  report.instances.forEach((instance, idx) => {
    if (idx > 0) {
      lines.push('');
    }
    lines.push(...renderInstance(instance));
  });

  return lines.join('\n');
}
