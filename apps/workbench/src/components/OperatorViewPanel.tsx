import type { JSX } from 'react';
import type { Report } from 'json-schema-reporter/model/report';
import {
  buildOperatorView,
  type OperatorIndicator,
  type OperatorLevel,
} from '../operator/operatorView';

interface OperatorViewPanelProps {
  report: Report;
  onNavigateSchemaQuality?: () => void;
  onNavigateExampleReliability?: () => void;
  onNavigatePerformance?: () => void;
}

export function OperatorViewPanel({
  report,
  onNavigateSchemaQuality,
  onNavigateExampleReliability,
  onNavigatePerformance,
}: OperatorViewPanelProps): JSX.Element {
  const view = buildOperatorView(report);
  const handleSchemaClick = (): void => {
    onNavigateSchemaQuality?.();
  };
  const handleExampleClick = (): void => {
    onNavigateExampleReliability?.();
  };
  const handlePerformanceClick = (): void => {
    onNavigatePerformance?.();
  };
  return (
    <section className="panel operator-view">
      <h2>Operator view</h2>
      <div className="operator-overall">
        <StatusBadge level={view.overallStatus.level} />
        <div>
          <h3>{view.overallStatus.title}</h3>
          <p>{view.overallStatus.summary}</p>
          {view.overallStatus.actionHint ? (
            <p>
              <strong>What to do:</strong> {view.overallStatus.actionHint}
            </p>
          ) : null}
        </div>
      </div>

      <div className="operator-grid">
        <IndicatorCard
          indicator={view.schemaQuality}
          onClick={handleSchemaClick}
        />
        <IndicatorCard
          indicator={view.exampleReliability}
          onClick={handleExampleClick}
        />
        <IndicatorCard
          indicator={view.performance}
          onClick={handlePerformanceClick}
        />
      </div>
    </section>
  );
}

function IndicatorCard({
  indicator,
  onClick,
}: {
  indicator: OperatorIndicator;
  onClick?: () => void;
}): JSX.Element {
  return (
    <div
      className={`operator-card operator-${indicator.level}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className="operator-card-header">
        <StatusBadge level={indicator.level} />
        <h3>{indicator.title}</h3>
      </div>
      <p>{indicator.summary}</p>
      {indicator.actionHint ? (
        <p>
          <strong>What to do:</strong> {indicator.actionHint}
        </p>
      ) : null}
    </div>
  );
}

function StatusBadge({ level }: { level: OperatorLevel }): JSX.Element {
  const label =
    level === 'ok' ? 'OK' : level === 'limited' ? 'Limited' : 'Blocked';
  return <span className={`status-badge status-${level}`}>{label}</span>;
}
