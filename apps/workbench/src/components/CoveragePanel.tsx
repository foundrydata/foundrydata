import type { JSX } from 'react';
import type {
  Report,
  CoverageEntrySnapshot,
} from 'json-schema-reporter/model/report';

interface CoveragePanelProps {
  report: Report;
  focusedCanonPath?: string | null;
  onSelectCanonPath?: (canonPath: string) => void;
}

interface CoverageTableProps {
  entries: CoverageEntrySnapshot[];
  focusedCanonPath?: string | null;
  onSelectCanonPath?: (canonPath: string) => void;
}

function EnumeratedKeys({ keys }: { keys: string[] }): JSX.Element {
  if (!keys.length) {
    return <span>0</span>;
  }
  return (
    <details className="details">
      <summary>{keys.length} key(s)</summary>
      <pre>{keys.join('\n')}</pre>
    </details>
  );
}

function Provenance({
  provenance,
}: {
  provenance?: CoverageEntrySnapshot['provenance'];
}): JSX.Element {
  if (!provenance || provenance.length === 0) {
    return <span>—</span>;
  }
  return <span>{provenance.join(', ')}</span>;
}

function CoverageTable({
  entries,
  focusedCanonPath,
  onSelectCanonPath,
}: CoverageTableProps): JSX.Element {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Canon Path</th>
            <th>Universe</th>
            <th>Enumerated Keys</th>
            <th>Provenance</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.canonPath}
              className={
                entry.canonPath === focusedCanonPath ? 'focused-row' : undefined
              }
              onClick={() => onSelectCanonPath?.(entry.canonPath)}
              style={{ cursor: onSelectCanonPath ? 'pointer' : 'default' }}
            >
              <td>{entry.canonPath || '(root)'}</td>
              <td>{entry.hasUniverse ?? 'unknown'}</td>
              <td>
                {entry.enumeratedKeys ? (
                  <EnumeratedKeys keys={entry.enumeratedKeys} />
                ) : (
                  0
                )}
              </td>
              <td>
                <Provenance provenance={entry.provenance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CoveragePanel({
  report,
  focusedCanonPath,
  onSelectCanonPath,
}: CoveragePanelProps): JSX.Element {
  const snapshot = report.compose?.coverageIndexSnapshot ?? [];
  if (!snapshot.length) {
    return (
      <section className="panel">
        <h2>Coverage</h2>
        <p>No coverage snapshot recorded.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Coverage</h2>
      <CoverageTable
        entries={snapshot}
        focusedCanonPath={focusedCanonPath}
        onSelectCanonPath={onSelectCanonPath}
      />
    </section>
  );
}
