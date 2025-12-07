import type { DiagnosticEnvelope } from '../../src/diag/validate.js';
import type { MetricsSnapshot } from '../../src/util/metrics.js';
import type {
  PipelineResult,
  PipelineStatus,
} from '../../src/pipeline/types.js';

const NON_DETERMINISTIC_METRIC_KEYS = new Set([
  'normalizeMs',
  'composeMs',
  'generateMs',
  'repairMs',
  'validateMs',
  'compileMs',
  'p50LatencyMs',
  'p95LatencyMs',
  'memoryPeakMB',
  'nameEnumElapsedMs',
]);

export type DeterminismView = {
  status: PipelineStatus;
  timeline: PipelineResult['timeline'];
  errors: Array<{ stage: string; message: string }>;
  metrics?: Partial<MetricsSnapshot>;
  artifacts: {
    generated: PipelineResult['artifacts']['generated'];
    repaired: PipelineResult['artifacts']['repaired'];
    repairActions: PipelineResult['artifacts']['repairActions'];
    validationDiagnostics: Array<Omit<DiagnosticEnvelope, 'metrics'>>;
    repairDiagnostics: Array<Omit<DiagnosticEnvelope, 'metrics'>>;
  };
};

export interface DeterminismCompareOptions {
  /**
   * Include deterministic metrics in the normalized view.
   * Defaults to true to allow equality checks between runs
   * that both collect metrics. Toggle to false when comparing
   * runs where metrics instrumentation differs (on vs off).
   */
  includeMetrics?: boolean;
}

function sanitizeDiagnosticMetrics(
  diagnostics: DiagnosticEnvelope[] | undefined
): Array<Omit<DiagnosticEnvelope, 'metrics'>> {
  if (!diagnostics) {
    return [];
  }
  return diagnostics.map(({ metrics: _metrics, ...rest }) => rest);
}

function sanitizeMetrics(
  metrics: MetricsSnapshot | undefined
): Partial<MetricsSnapshot> | undefined {
  if (!metrics) {
    return metrics;
  }
  const sanitized: Partial<MetricsSnapshot> = {};
  for (const [key, value] of Object.entries(metrics)) {
    if (NON_DETERMINISTIC_METRIC_KEYS.has(key)) {
      continue;
    }
    const typedKey = key as keyof MetricsSnapshot;
    sanitized[typedKey] = value;
  }
  return sanitized;
}

/**
 * Normalize a PipelineResult into a deterministic view by removing
 * non-deterministic metrics (timings + SLIs) and stripping diagnostic
 * metrics payloads. Use this for deep equality checks between runs.
 */
export function normalizePipelineResultForDeterminism(
  result: PipelineResult,
  options: DeterminismCompareOptions = {}
): DeterminismView {
  const includeMetrics = options.includeMetrics ?? true;

  return {
    status: result.status,
    timeline: result.timeline,
    errors: result.errors.map((error) => ({
      stage: error.stage,
      message: error.message,
    })),
    metrics: includeMetrics ? sanitizeMetrics(result.metrics) : undefined,
    artifacts: {
      generated: result.artifacts.generated,
      repaired: result.artifacts.repaired,
      repairActions: result.artifacts.repairActions,
      validationDiagnostics: sanitizeDiagnosticMetrics(
        result.artifacts.validationDiagnostics
      ),
      repairDiagnostics: sanitizeDiagnosticMetrics(
        result.artifacts.repairDiagnostics
      ),
    },
  };
}
