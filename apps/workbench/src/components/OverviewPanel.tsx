import type { JSX } from 'react';
import type {
  Report,
  MetricsSnapshot,
} from 'json-schema-reporter/model/report';

interface OverviewPanelProps {
  report: Report;
}

type SummaryTimings = NonNullable<Report['summary']['timings']>;

function TimingsTable({
  timings,
}: {
  timings?: Report['summary']['timings'];
}): JSX.Element | null {
  if (!timings) {
    return null;
  }

  const entries: Array<{ key: keyof SummaryTimings; label: string }> = [
    { key: 'normalizeMs', label: 'Normalize' },
    { key: 'composeMs', label: 'Compose' },
    { key: 'generateMs', label: 'Generate' },
    { key: 'repairMs', label: 'Repair' },
    { key: 'validateMs', label: 'Validate' },
  ];

  if (typeof timings.compileMs === 'number') {
    entries.push({ key: 'compileMs', label: 'Compile' });
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Phase</th>
            <th>Duration (ms)</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.key as string}>
              <td>{entry.label}</td>
              <td>{timings[entry.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricsTable({
  metrics,
}: {
  metrics?: MetricsSnapshot;
}): JSX.Element | null {
  if (!metrics) {
    return null;
  }

  const metricEntries: Array<[string, number | undefined]> = [
    ['Validations / row', metrics.validationsPerRow],
    ['Repair passes / row', metrics.repairPassesPerRow],
    ['Memory peak (MB)', metrics.memoryPeakMB],
    ['p50 latency (ms)', metrics.p50LatencyMs],
    ['p95 latency (ms)', metrics.p95LatencyMs],
  ];

  if (typeof metrics.evalTraceChecks === 'number') {
    metricEntries.push(['Eval trace checks', metrics.evalTraceChecks]);
  }
  if (typeof metrics.evalTraceProved === 'number') {
    metricEntries.push(['Eval trace proved', metrics.evalTraceProved]);
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {metricEntries.map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{typeof value === 'number' ? value : 'n/a'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OverviewPanel({
  report,
}: OverviewPanelProps): JSX.Element {
  const { summary, metrics } = report;
  return (
    <section className="panel">
      <h2>Overview</h2>
      <div className="key-values">
        <div>
          <span className="label">Total Instances</span>
          <strong>{summary.totalInstances}</strong>
        </div>
        <div>
          <span className="label">Valid (unchanged)</span>
          <strong>{summary.validUnchanged}</strong>
        </div>
        <div>
          <span className="label">Valid (repaired)</span>
          <strong>{summary.validRepaired}</strong>
        </div>
        <div>
          <span className="label">Invalid</span>
          <strong>{summary.invalid}</strong>
        </div>
      </div>

      <h3>Timings</h3>
      <TimingsTable timings={summary.timings} />

      <h3>Metrics</h3>
      <MetricsTable metrics={metrics} />
    </section>
  );
}
