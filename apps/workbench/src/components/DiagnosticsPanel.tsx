/* eslint-disable max-lines */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import type {
  DiagnosticEnvelope,
  Report,
} from 'json-schema-reporter/model/report';

type DiagnosticKind = 'fatal' | 'warn' | 'run';

interface UiDiagnostic {
  kind: DiagnosticKind;
  diag: DiagnosticEnvelope;
}

type ComposeDiagnostics = {
  fatal?: DiagnosticEnvelope[];
  warn?: DiagnosticEnvelope[];
  run?: DiagnosticEnvelope[];
};

interface DiagnosticsPanelProps {
  report: Report;
  focusedCanonPath?: string | null;
  onSelectCanonPath?: (canonPath: string) => void;
}

interface FiltersState {
  searchQuery: string;
  showWarn: boolean;
  showFatal: boolean;
  showRun: boolean;
  onlyFocusedPath: boolean;
}

interface DiagnosticsFiltersProps {
  filters: FiltersState;
  focusedCanonPath?: string | null;
  onChange: (next: Partial<FiltersState>) => void;
}

interface DiagnosticsTableProps {
  diagnostics: UiDiagnostic[];
  focusedCanonPath?: string | null;
  onSelectCanonPath?: (canonPath: string) => void;
}

function formatDetailsPreview(details: unknown): string {
  if (details === null || typeof details === 'undefined') {
    return '';
  }
  if (typeof details === 'string') {
    return details;
  }
  try {
    const serialized = JSON.stringify(details);
    return serialized.length > 160
      ? `${serialized.slice(0, 157)}…`
      : serialized;
  } catch (error) {
    console.warn('Unable to stringify diagnostic details', error);
    return String(details);
  }
}

function DiagnosticsFilters({
  filters,
  focusedCanonPath,
  onChange,
}: DiagnosticsFiltersProps): JSX.Element {
  const toggleDefs: Array<{
    key: keyof Pick<FiltersState, 'showWarn' | 'showFatal' | 'showRun'>;
    label: string;
  }> = [
    { key: 'showWarn', label: 'Warn' },
    { key: 'showFatal', label: 'Fatal' },
    { key: 'showRun', label: 'Run' },
  ];
  return (
    <div className="diagnostics-filters">
      <input
        type="text"
        placeholder="Search code, path, details..."
        value={filters.searchQuery}
        onChange={(event) => onChange({ searchQuery: event.target.value })}
      />
      {toggleDefs.map(({ key, label }) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={filters[key]}
            onChange={(event) => onChange({ [key]: event.target.checked })}
          />
          {label}
        </label>
      ))}
      {focusedCanonPath && (
        <label>
          <input
            type="checkbox"
            checked={filters.onlyFocusedPath}
            onChange={(event) =>
              onChange({ onlyFocusedPath: event.target.checked })
            }
          />
          Only focused path ({focusedCanonPath})
        </label>
      )}
    </div>
  );
}

function DiagnosticsTable(props: DiagnosticsTableProps): JSX.Element {
  return (
    <div className="table-scroll">
      <table>
        <DiagnosticsTableHeader />
        <DiagnosticsTableBody {...props} />
      </table>
    </div>
  );
}

function DiagnosticsTableHeader(): JSX.Element {
  return (
    <thead>
      <tr>
        <th>Kind</th>
        <th>Code</th>
        <th>Canon Path</th>
        <th>Details</th>
      </tr>
    </thead>
  );
}

function DiagnosticsTableBody({
  diagnostics,
  focusedCanonPath,
  onSelectCanonPath,
}: DiagnosticsTableProps): JSX.Element {
  if (!diagnostics.length) {
    return (
      <tbody>
        <tr>
          <td colSpan={4} style={{ textAlign: 'center', padding: '0.5rem' }}>
            No diagnostics match the active filters.
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {diagnostics.map((item, index) => (
        <tr
          key={`${item.kind}-${item.diag.code}-${item.diag.canonPath}-${index}`}
        >
          <td>{item.kind}</td>
          <td>{item.diag.code}</td>
          <td
            className={
              item.diag.canonPath === focusedCanonPath
                ? 'focused-path'
                : undefined
            }
            onClick={() =>
              item.diag.canonPath && onSelectCanonPath?.(item.diag.canonPath)
            }
            style={{ cursor: onSelectCanonPath ? 'pointer' : 'default' }}
          >
            {item.diag.canonPath || '(root)'}
          </td>
          <td>
            <div className="details-block">
              {formatDetailsPreview(item.diag.details)}
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  );
}

function buildUiDiagnostics(diagRoot?: ComposeDiagnostics): UiDiagnostic[] {
  if (!diagRoot) {
    return [];
  }
  const entries: UiDiagnostic[] = [];
  if (diagRoot.fatal) {
    entries.push(
      ...diagRoot.fatal.map((diag) => ({ kind: 'fatal' as const, diag }))
    );
  }
  if (diagRoot.warn) {
    entries.push(
      ...diagRoot.warn.map((diag) => ({ kind: 'warn' as const, diag }))
    );
  }
  if (diagRoot.run) {
    entries.push(
      ...diagRoot.run.map((diag) => ({ kind: 'run' as const, diag }))
    );
  }
  return entries;
}

function filterDiagnostics(
  diagnostics: UiDiagnostic[],
  filters: FiltersState & { focusedCanonPath?: string | null }
): UiDiagnostic[] {
  const query = filters.searchQuery.trim().toLowerCase();
  const visibility: Record<DiagnosticKind, boolean> = {
    warn: filters.showWarn,
    fatal: filters.showFatal,
    run: filters.showRun,
  };

  return diagnostics.filter((item) => {
    if (!visibility[item.kind]) {
      return false;
    }
    if (
      filters.onlyFocusedPath &&
      filters.focusedCanonPath &&
      item.diag.canonPath !== filters.focusedCanonPath
    ) {
      return false;
    }
    if (!query) {
      return true;
    }
    const { code, canonPath, details } = item.diag;
    const detailsStr = details ? JSON.stringify(details).toLowerCase() : '';
    const haystack =
      `${code ?? ''} ${canonPath ?? ''} ${detailsStr}`.toLowerCase();
    return haystack.includes(query);
  });
}

function useDiagnosticsFilters(): [
  FiltersState,
  (next: Partial<FiltersState>) => void,
] {
  const [filters, setFilters] = useState<FiltersState>({
    searchQuery: '',
    showWarn: true,
    showFatal: true,
    showRun: true,
    onlyFocusedPath: false,
  });

  const update = useCallback((next: Partial<FiltersState>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  }, []);

  return [filters, update];
}

export default function DiagnosticsPanel({
  report,
  focusedCanonPath,
  onSelectCanonPath,
}: DiagnosticsPanelProps): JSX.Element {
  const diagRoot = report.compose?.result?.diag as
    | ComposeDiagnostics
    | undefined;
  const uiDiagnostics = useMemo(() => buildUiDiagnostics(diagRoot), [diagRoot]);
  const [filters, updateFilters] = useDiagnosticsFilters();

  useEffect(() => {
    if (!focusedCanonPath && filters.onlyFocusedPath) {
      updateFilters({ onlyFocusedPath: false });
    }
  }, [focusedCanonPath, filters.onlyFocusedPath, updateFilters]);

  const filteredDiagnostics = useMemo(
    () => filterDiagnostics(uiDiagnostics, { ...filters, focusedCanonPath }),
    [filters, focusedCanonPath, uiDiagnostics]
  );

  if (!uiDiagnostics.length) {
    return (
      <section className="panel">
        <h2>Diagnostics</h2>
        <p>No diagnostics recorded for this report.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Diagnostics</h2>
      <DiagnosticsFilters
        filters={filters}
        focusedCanonPath={focusedCanonPath}
        onChange={updateFilters}
      />
      <DiagnosticsTable
        diagnostics={filteredDiagnostics}
        focusedCanonPath={focusedCanonPath}
        onSelectCanonPath={onSelectCanonPath}
      />
    </section>
  );
}
