import { useMemo, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import type { Report } from 'json-schema-reporter/model/report';
import CoveragePanel from './CoveragePanel';
import DiagnosticsPanel from './DiagnosticsPanel';
import InstancesPanel from './InstancesPanel';
import OverviewPanel from './OverviewPanel';
import { OperatorViewPanel } from './OperatorViewPanel';

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
  const refs = useReportSectionRefs();

  const navigationCallbacks = useMemo(
    () => ({
      schema: () => scrollSection(refs.diagnostics),
      example: () => scrollSection(refs.instances),
      performance: () => scrollSection(refs.overview),
    }),
    [refs]
  );
  return (
    <section>
      <ReportSummaryHeader report={report} meta={meta} />

      <OperatorViewPanel
        report={report}
        onNavigateSchemaQuality={navigationCallbacks.schema}
        onNavigateExampleReliability={navigationCallbacks.example}
        onNavigatePerformance={navigationCallbacks.performance}
      />
      <section ref={refs.overview}>
        <OverviewPanel report={report} />
      </section>
      <section ref={refs.diagnostics}>
        <DiagnosticsPanel
          report={report}
          focusedCanonPath={focusedCanonPath}
          onSelectCanonPath={setFocusedCanonPath}
        />
      </section>
      <section ref={refs.instances}>
        <InstancesPanel report={report} />
      </section>
      <section>
        <CoveragePanel
          report={report}
          focusedCanonPath={focusedCanonPath}
          onSelectCanonPath={setFocusedCanonPath}
        />
      </section>
    </section>
  );
}

function ReportSummaryHeader({
  report,
  meta,
}: {
  report: Report;
  meta: Report['meta'];
}): JSX.Element {
  return (
    <div className="report-summary-bar">
      <SummaryItem label="Schema" value={report.schemaId} />
      <SummaryItem label="Schema Hash" value={report.schemaHash ?? 'n/a'} />
      <SummaryItem
        label="Tool"
        value={`${meta.toolName} ${meta.toolVersion}`}
      />
      <SummaryItem label="Engine" value={meta.engineVersion ?? 'n/a'} />
      <SummaryItem label="Timestamp" value={formatTimestamp(meta.timestamp)} />
      {typeof meta.seed !== 'undefined' ? (
        <SummaryItem label="Seed" value={meta.seed} />
      ) : null}
    </div>
  );
}
function useReportSectionRefs(): {
  overview: React.RefObject<HTMLElement>;
  diagnostics: React.RefObject<HTMLElement>;
  instances: React.RefObject<HTMLElement>;
} {
  const overview = useRef<HTMLElement>(null!);
  const diagnostics = useRef<HTMLElement>(null!);
  const instances = useRef<HTMLElement>(null!);
  return { overview, diagnostics, instances };
}

function scrollSection(ref: React.RefObject<HTMLElement>): void {
  ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
