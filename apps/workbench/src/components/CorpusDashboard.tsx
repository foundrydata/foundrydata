/* eslint-disable max-lines-per-function */
import type { JSX } from 'react';
import type { CorpusRunReport, CorpusSchemaResult } from '../types/corpus';

interface CorpusDashboardProps {
  summary: CorpusRunReport;
}

export default function CorpusDashboard({
  summary,
}: CorpusDashboardProps): JSX.Element {
  return (
    <section className="panel bench-dashboard">
      <h2>Corpus run</h2>
      <CorpusMeta summary={summary} />
      <CorpusTotals summary={summary.summary} />
      <CorpusSchemaTable schemas={summary.results} />
    </section>
  );
}

function CorpusMeta({ summary }: { summary: CorpusRunReport }): JSX.Element {
  return (
    <div className="bench-meta">
      <div>
        <span className="label">Mode</span>
        <strong>{summary.mode}</strong>
      </div>
      <div>
        <span className="label">Seed</span>
        <strong>{summary.seed}</strong>
      </div>
      <div>
        <span className="label">Instances per schema</span>
        <strong>{summary.instancesPerSchema}</strong>
      </div>
    </div>
  );
}

function CorpusTotals({
  summary,
}: {
  summary: CorpusRunReport['summary'];
}): JSX.Element {
  return (
    <div className="bench-totals">
      <h3>Totals</h3>
      <div className="key-values">
        <div>
          <span className="label">Schemas</span>
          <strong>{summary.totalSchemas}</strong>
        </div>
        <div>
          <span className="label">Schemas with success</span>
          <strong>{summary.schemasWithSuccess}</strong>
        </div>
        <div>
          <span className="label">Instances tried</span>
          <strong>{summary.totalInstancesTried}</strong>
        </div>
        <div>
          <span className="label">Instances valid</span>
          <strong>{summary.totalInstancesValid}</strong>
        </div>
        <div>
          <span className="label">Schemas with UNSAT diag</span>
          <strong>{summary.unsatCount}</strong>
        </div>
        <div>
          <span className="label">Schemas with fail-fast diag</span>
          <strong>{summary.failFastCount}</strong>
        </div>
        <div>
          <span className="label">Regex capped</span>
          <strong>{summary.caps.regexCapped}</strong>
        </div>
        <div>
          <span className="label">Name automaton capped</span>
          <strong>{summary.caps.nameAutomatonCapped}</strong>
        </div>
        <div>
          <span className="label">SMT timeouts</span>
          <strong>{summary.caps.smtTimeouts}</strong>
        </div>
      </div>
    </div>
  );
}

function CorpusSchemaTable({
  schemas,
}: {
  schemas: CorpusSchemaResult[];
}): JSX.Element {
  if (!schemas.length) {
    return <p>No schemas are present in this corpus run.</p>;
  }
  const sorted = [...schemas].sort(compareSchemas);
  return (
    <div className="table-scroll">
      <table className="bench-schema-table">
        <thead>
          <tr>
            <th>Id</th>
            <th>Mode</th>
            <th>Schema path</th>
            <th>Instances tried</th>
            <th>Instances valid</th>
            <th>UNSAT</th>
            <th>Fail-fast</th>
            <th>Regex capped</th>
            <th>Name automaton capped</th>
            <th>SMT timeouts</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((schema) => (
            <tr key={schema.id}>
              <td className="schema-id">{schema.id}</td>
              <td>{schema.mode}</td>
              <td
                className="schema-id schema-path-cell"
                title={schema.schemaPath}
              >
                {formatSchemaPathDisplay(schema.schemaPath)}
              </td>
              <td>{schema.instancesTried}</td>
              <td>{schema.instancesValid}</td>
              <td>{schema.unsat ? 'yes' : 'no'}</td>
              <td>{schema.failFast ? 'yes' : 'no'}</td>
              <td>{schema.caps?.regexCapped ?? 0}</td>
              <td>{schema.caps?.nameAutomatonCapped ?? 0}</td>
              <td>{schema.caps?.smtTimeouts ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function compareSchemas(a: CorpusSchemaResult, b: CorpusSchemaResult): number {
  if (a.unsat !== b.unsat) {
    return a.unsat ? -1 : 1;
  }
  if (a.failFast !== b.failFast) {
    return a.failFast ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

function formatSchemaPathDisplay(path: string | undefined): string {
  if (!path) {
    return '—';
  }
  const profilesIndex = path.lastIndexOf('profiles/');
  if (profilesIndex >= 0) {
    return path.slice(profilesIndex + 9);
  }
  const parts = path.split(/[/\\]/);
  if (parts.length > 3) {
    return parts.slice(-3).join('/');
  }
  return path;
}
