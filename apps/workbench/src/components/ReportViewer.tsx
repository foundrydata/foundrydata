import { useState } from 'react';
import type { JSX, ReactNode } from 'react';
import type { Report } from 'json-schema-reporter/model/report';
import CoveragePanel from './CoveragePanel';
import DiagnosticsPanel from './DiagnosticsPanel';
import InstancesPanel from './InstancesPanel';
import OverviewPanel from './OverviewPanel';

interface ReportViewerProps {
  report: Report;
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return 'n/a';
  }
  const parsed = Number.isNaN(Date.parse(value)) ? undefined : new Date(value);
  return parsed ? parsed.toLocaleString() : value;
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value?: ReactNode;
}): JSX.Element {
  return (
    <div className="summary-item">
      <strong>{label}</strong>
      <span>{value ?? '—'}</span>
    </div>
  );
}

export default function ReportViewer({
  report,
}: ReportViewerProps): JSX.Element {
  const meta = report.meta;
  const [focusedCanonPath, setFocusedCanonPath] = useState<string | null>(null);
  return (
    <section>
      <div className="report-summary-bar">
        <SummaryItem label="Schema" value={report.schemaId} />
        <SummaryItem label="Schema Hash" value={report.schemaHash ?? 'n/a'} />
        <SummaryItem
          label="Tool"
          value={`${meta.toolName} ${meta.toolVersion}`}
        />
        <SummaryItem label="Engine" value={meta.engineVersion ?? 'n/a'} />
        <SummaryItem
          label="Timestamp"
          value={formatTimestamp(meta.timestamp)}
        />
        {typeof meta.seed !== 'undefined' ? (
          <SummaryItem label="Seed" value={meta.seed} />
        ) : null}
      </div>

      <OverviewPanel report={report} />
      <DiagnosticsPanel
        report={report}
        focusedCanonPath={focusedCanonPath}
        onSelectCanonPath={setFocusedCanonPath}
      />
      <InstancesPanel report={report} />
      <CoveragePanel
        report={report}
        focusedCanonPath={focusedCanonPath}
        onSelectCanonPath={setFocusedCanonPath}
      />
    </section>
  );
}
