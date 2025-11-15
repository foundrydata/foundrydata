/* eslint-disable max-lines-per-function */
import type { JSX } from 'react';
import type {
  BenchRunSummary,
  BenchSchemaSummary,
  BenchLevel,
} from '../types/bench';

interface BenchDashboardProps {
  summary: BenchRunSummary;
}

export default function BenchDashboard({
  summary,
}: BenchDashboardProps): JSX.Element {
  return (
    <section className="panel bench-dashboard">
      <h2>Bench run</h2>
      <BenchMeta summary={summary} />
      <BenchTotals totals={summary.totals} />
      <LevelLegend />
      <BenchSchemaTable schemas={summary.schemas} />
      <p className="bench-hint">
        For deeper inspection of one schema, open the corresponding{' '}
        <code>*.report.json</code> via the single report loader above.
      </p>
    </section>
  );
}

function LevelLegend(): JSX.Element {
  return (
    <div className="bench-level-legend">
      <strong>Legend:</strong>
      <span>
        <LevelBadge level="ok" /> Stable
      </span>
      <span>
        <LevelBadge level="limited" /> Usable with warnings (see diagnostics)
      </span>
      <span>
        <LevelBadge level="blocked" /> Failed or blocked (see notes column)
      </span>
    </div>
  );
}

function BenchMeta({ summary }: { summary: BenchRunSummary }): JSX.Element {
  return (
    <div className="bench-meta">
      <div>
        <span className="label">Run ID</span>
        <strong>{summary.runId}</strong>
      </div>
      <div>
        <span className="label">Generated at</span>
        <strong>{new Date(summary.generatedAt).toLocaleString()}</strong>
      </div>
      <div>
        <span className="label">Tool</span>
        <strong>
          {summary.toolName} {summary.toolVersion}
        </strong>
      </div>
      {summary.engineVersion ? (
        <div>
          <span className="label">Engine</span>
          <strong>{summary.engineVersion}</strong>
        </div>
      ) : null}
      <div>
        <span className="label">Config</span>
        <strong>{summary.configPath}</strong>
      </div>
      <div>
        <span className="label">Output dir</span>
        <strong>{summary.outDir}</strong>
      </div>
    </div>
  );
}

function BenchTotals({
  totals,
}: {
  totals: BenchRunSummary['totals'];
}): JSX.Element {
  return (
    <div className="bench-totals">
      <h3>Totals</h3>
      <div className="key-values">
        <div>
          <span className="label">Schemas</span>
          <strong>{totals.schemas}</strong>
        </div>
        <div>
          <span className="label">Instances</span>
          <strong>{totals.instances}</strong>
        </div>
        <div>
          <span className="label">Invalid instances</span>
          <strong>{totals.invalidInstances}</strong>
        </div>
        <div>
          <span className="label">Compose fatal</span>
          <strong>{totals.composeFatal}</strong>
        </div>
        <div>
          <span className="label">Compose warnings</span>
          <strong>{totals.composeWarn}</strong>
        </div>
        <div>
          <span className="label">Run-level diag</span>
          <strong>{totals.composeRunLevel}</strong>
        </div>
        <div>
          <span className="label">Validate errors</span>
          <strong>{totals.validateErrors}</strong>
        </div>
      </div>
    </div>
  );
}

function BenchSchemaTable({
  schemas,
}: {
  schemas: BenchSchemaSummary[];
}): JSX.Element {
  if (!schemas.length) {
    return <p>No schemas are present in this bench run.</p>;
  }
  const sorted = [...schemas].sort(compareBenchSchemas);
  return (
    <div className="table-scroll">
      <table className="bench-schema-table">
        <thead>
          <tr>
            <th>Level</th>
            <th>Id</th>
            <th>Schema ID</th>
            <th>Total instances</th>
            <th>Invalid</th>
            <th>Compose fatal</th>
            <th>Compose warnings</th>
            <th>Validate errors</th>
            <th>Run-level diag</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((schema) => (
            <tr
              key={schema.id}
              className={
                schema.level === 'blocked' ? 'bench-row-blocked' : undefined
              }
            >
              <td>
                <LevelBadge level={schema.level} />
              </td>
              <td className="schema-id">{schema.id}</td>
              <td className="schema-id" title={schema.schemaPath}>
                {schema.schemaId}
              </td>
              <td>{schema.summary.totalInstances}</td>
              <td>{schema.summary.invalid}</td>
              <td>{schema.summary.diagnosticsCount.composeFatal}</td>
              <td>{schema.summary.diagnosticsCount.composeWarn}</td>
              <td>{schema.summary.diagnosticsCount.validateErrors}</td>
              <td>{schema.summary.diagnosticsCount.composeRunLevel}</td>
              <td className="notes-cell">{schema.error ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function compareBenchSchemas(
  a: BenchSchemaSummary,
  b: BenchSchemaSummary
): number {
  const order: BenchLevel[] = ['blocked', 'limited', 'ok'];
  const ai = order.indexOf(a.level);
  const bi = order.indexOf(b.level);
  if (ai !== bi) {
    return ai - bi;
  }
  return a.id.localeCompare(b.id);
}

function LevelBadge({ level }: { level: BenchLevel }): JSX.Element {
  const label =
    level === 'ok' ? 'OK' : level === 'limited' ? 'Limited' : 'Blocked';
  return (
    <span className={`bench-level-badge bench-level-${level}`}>{label}</span>
  );
}
