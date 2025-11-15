import type { JSX } from 'react';
import type { InstanceResult, Report } from 'json-schema-reporter/model/report';

interface InstancesPanelProps {
  report: Report;
}

const OUTCOME_ORDER: Record<InstanceResult['outcome'], number> = {
  invalid: 0,
  'valid-repaired': 1,
  'valid-unchanged': 2,
};

const ORDERED_OUTCOMES: InstanceResult['outcome'][] = [
  'invalid',
  'valid-repaired',
  'valid-unchanged',
];

const OUTCOME_LABEL: Record<InstanceResult['outcome'], string> = {
  invalid: 'Invalid',
  'valid-repaired': 'Valid (repaired)',
  'valid-unchanged': 'Valid (unchanged)',
};

type OutcomeCount = Record<InstanceResult['outcome'], number>;

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    console.warn('Unable to stringify value', error);
    return String(value);
  }
}

function buildOutcomeCount(instances: InstanceResult[]): OutcomeCount {
  return instances.reduce<OutcomeCount>(
    (acc, instance) => {
      acc[instance.outcome] += 1;
      return acc;
    },
    { invalid: 0, 'valid-repaired': 0, 'valid-unchanged': 0 }
  );
}

function InstanceStats({ counts }: { counts: OutcomeCount }): JSX.Element {
  return (
    <div className="instance-stats">
      {ORDERED_OUTCOMES.map((outcomeKey) => (
        <div key={outcomeKey} className="instance-stat">
          <span className={`badge ${outcomeKey}`}>
            {OUTCOME_LABEL[outcomeKey]}
          </span>
          <strong>{counts[outcomeKey]}</strong>
        </div>
      ))}
    </div>
  );
}

function InstanceData({ data }: { data: unknown }): JSX.Element {
  return (
    <div className="instance-section">
      <h4>Data</h4>
      <pre>{formatJson(data)}</pre>
    </div>
  );
}

function InstanceErrors({
  errors,
}: {
  errors?: InstanceResult['validationErrors'];
}): JSX.Element | null {
  if (!errors || !errors.length) {
    return null;
  }
  return (
    <div className="instance-section">
      <h4>Validation errors</h4>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Instance Path</th>
              <th>Schema Path</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((err, idx) => (
              <tr key={`err-${idx}`}>
                <td>{err.keyword}</td>
                <td>{err.instancePath ?? '—'}</td>
                <td>{err.schemaPath ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InstanceRepairs({
  actions,
}: {
  actions?: InstanceResult['repairActions'];
}): JSX.Element | null {
  if (!actions || !actions.length) {
    return null;
  }
  return (
    <div className="instance-section">
      <h4>Repair actions</h4>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Canon Path</th>
              <th>Original Path</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((action, idx) => (
              <tr key={`repair-${idx}`}>
                <td>{action.keyword}</td>
                <td>{action.canonPath ?? '—'}</td>
                <td>{action.origPath ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InstanceDiagnostics({
  diagnostics,
}: {
  diagnostics?: InstanceResult['diagnostics'];
}): JSX.Element | null {
  if (!diagnostics || !diagnostics.length) {
    return null;
  }
  return (
    <div className="instance-section">
      <h4>Diagnostics</h4>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Canon Path</th>
            </tr>
          </thead>
          <tbody>
            {diagnostics.map((diag, idx) => (
              <tr key={`diag-${idx}`}>
                <td>{diag.code}</td>
                <td>{diag.canonPath ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InstanceNotes({ notes }: { notes?: string }): JSX.Element | null {
  if (!notes) {
    return null;
  }
  return (
    <div className="instance-section">
      <h4>Notes</h4>
      <pre>{notes}</pre>
    </div>
  );
}

function InstanceItem({ instance }: { instance: InstanceResult }): JSX.Element {
  const errorCount = instance.validationErrors?.length ?? 0;
  const repairCount = instance.repairActions?.length ?? 0;
  const diagCount = instance.diagnostics?.length ?? 0;
  return (
    <details className="instance-item">
      <summary>
        <span>#${instance.index}</span>
        <span className={`outcome-badge outcome-${instance.outcome}`}>
          {OUTCOME_LABEL[instance.outcome]}
        </span>
        <span>errors: {errorCount}</span>
        <span>repairs: {repairCount}</span>
        {diagCount ? <span>diagnostics: {diagCount}</span> : null}
      </summary>
      <div className="instance-body">
        <InstanceData data={instance.data} />
        <InstanceErrors errors={instance.validationErrors} />
        <InstanceRepairs actions={instance.repairActions} />
        <InstanceDiagnostics diagnostics={instance.diagnostics} />
        <InstanceNotes notes={instance.notes} />
      </div>
    </details>
  );
}

export default function InstancesPanel({
  report,
}: InstancesPanelProps): JSX.Element {
  const instances = report.instances ?? [];
  if (!instances.length) {
    return (
      <section className="panel">
        <h2>Instances</h2>
        <p>No instances were generated.</p>
      </section>
    );
  }

  const sortedInstances = [...instances].sort(
    (a, b) =>
      OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome] || a.index - b.index
  );
  const counts = buildOutcomeCount(instances);

  return (
    <section className="panel">
      <h2>Instances</h2>
      <InstanceStats counts={counts} />
      <div className="instance-list">
        {sortedInstances.map((instance) => (
          <InstanceItem key={instance.index} instance={instance} />
        ))}
      </div>
    </section>
  );
}
