import type { DiagMetrics, CoverageReport } from '@foundrydata/shared';

export type ReporterPlatformViewV1 = {
  version: 'reporter-platform-view/v1';
  engine: {
    name: 'foundrydata';
    version: string;
    ajvMajor: number;
  };
  run: {
    seed?: number;
    registryFingerprint?: string;
    metricsEnabled?: boolean;
    coverage?: {
      mode: 'off' | 'measure' | 'guided';
      dimensionsEnabled?: string[];
      excludeUnreachable?: boolean;
      operationsScope?: 'all' | 'selected';
      selectedOperations?: string[];
    };
  };
  metrics: {
    repairUsageByMotif?: RepairUsageByMotifEntry[];
    coverage?: CoverageSummary;
  };
};

export type RepairUsageByMotifEntry = {
  motif: string;
  canonPath?: string;
  items: number;
  itemsWithRepair: number;
  actions: number;
  tiers?: {
    tier1?: number;
    tier2?: number;
    tier3?: number;
    disabled?: number;
  };
};

export type CoverageSummary = {
  coverageStatus?: 'ok' | 'minCoverageNotMet' | 'error';
  overall?: number;
  byDimension?: Record<string, number>;
  byOperation?: Record<string, number>;
  thresholds?: { overall?: number };
  targetsByStatus?: Record<string, number>;
  planning?: {
    plannedTargetsTotal?: number;
    unplannedTargetsTotal?: number;
    plannerCapsHit?: Array<{
      dimension: string;
      scopeType?: 'schema' | 'operation';
      scopeKey?: string;
      totalTargets: number;
      plannedTargets: number;
      unplannedTargets: number;
    }>;
  };
};

export interface BuildPlatformViewInput {
  metrics?: DiagMetrics;
  coverageReport?: CoverageReport;
  seed?: number;
  registryFingerprint?: string;
  engineVersion?: string;
  ajvMajor?: number;
  metricsEnabled?: boolean;
}

/**
 * Build the derived Reporter/Platform View (v1) from diag.metrics +
 * coverage-report/v1. This is a pure transformation; it does not mutate
 * inputs and does not introduce new semantics beyond the source payloads.
 */
export function buildReporterPlatformView(
  input: BuildPlatformViewInput
): ReporterPlatformViewV1 {
  const coverage = input.coverageReport;

  return {
    version: 'reporter-platform-view/v1',
    engine: buildEngineMetadata(coverage, input),
    run: buildRunMetadata(coverage, input),
    metrics: {
      repairUsageByMotif: deriveRepairUsageByMotif(input.metrics),
      coverage: deriveCoverageSummary(coverage),
    },
  };
}

function buildEngineMetadata(
  coverage: CoverageReport | undefined,
  input: Pick<BuildPlatformViewInput, 'engineVersion' | 'ajvMajor'>
): ReporterPlatformViewV1['engine'] {
  const version =
    coverage?.engine.foundryVersion ?? input.engineVersion ?? 'unknown';
  const ajvMajor = coverage?.engine.ajvMajor ?? input.ajvMajor ?? 0;
  return {
    name: 'foundrydata',
    version,
    ajvMajor,
  };
}

function buildRunMetadata(
  coverage: CoverageReport | undefined,
  input: Pick<
    BuildPlatformViewInput,
    'seed' | 'registryFingerprint' | 'metricsEnabled'
  >
): ReporterPlatformViewV1['run'] {
  const coverageMeta = coverage
    ? {
        mode: coverage.engine.coverageMode,
        dimensionsEnabled: coverage.run.dimensionsEnabled,
        excludeUnreachable: coverage.run.excludeUnreachable,
        operationsScope: coverage.run.operationsScope,
        selectedOperations: normalizeSelectedOperations(
          coverage.run.selectedOperations
        ),
      }
    : { mode: 'off' as const };

  return {
    seed: input.seed ?? coverage?.run.seed,
    registryFingerprint:
      input.registryFingerprint ?? coverage?.run.registryFingerprint,
    metricsEnabled: coverage?.run.metricsEnabled ?? input.metricsEnabled,
    coverage: coverageMeta,
  };
}

function deriveRepairUsageByMotif(
  metrics?: DiagMetrics
): RepairUsageByMotifEntry[] | undefined {
  const usage = metrics?.repairUsageByMotif;
  if (!Array.isArray(usage) || usage.length === 0) {
    return undefined;
  }
  const normalized = usage.map((entry) => {
    const items = clampNonNegative(entry.items);
    const actions = clampNonNegative(entry.actions);
    const itemsWithRepair =
      actions === 0
        ? 0
        : clampNonNegative(Math.min(entry.itemsWithRepair, items));
    return {
      motif: entry.motifId,
      canonPath: undefined,
      items,
      itemsWithRepair,
      actions,
    };
  });

  normalized.sort((a, b) => {
    const canonA: string = a.canonPath ?? '';
    const canonB: string = b.canonPath ?? '';
    if (canonA !== canonB) return canonA.localeCompare(canonB);
    return a.motif.localeCompare(b.motif);
  });
  return normalized;
}

function deriveCoverageSummary(
  coverage?: CoverageReport
): CoverageSummary | undefined {
  if (!coverage) return undefined;
  const planning = derivePlanningSummary(coverage);

  return {
    coverageStatus: coverage.metrics.coverageStatus ?? 'ok',
    overall: coverage.metrics.overall,
    byDimension: coverage.metrics.byDimension,
    byOperation: coverage.metrics.byOperation,
    thresholds: coverage.metrics.thresholds
      ? { overall: coverage.metrics.thresholds.overall }
      : undefined,
    targetsByStatus: coverage.metrics.targetsByStatus,
    planning,
  };
}

function derivePlanningSummary(
  coverage: CoverageReport
): CoverageSummary['planning'] | undefined {
  const caps = coverage.diagnostics?.plannerCapsHit ?? [];
  if (!Array.isArray(caps) || caps.length === 0) {
    return undefined;
  }
  let plannedTargetsTotal = 0;
  let unplannedTargetsTotal = 0;
  for (const cap of caps) {
    plannedTargetsTotal += clampNonNegative(cap.plannedTargets);
    unplannedTargetsTotal += clampNonNegative(cap.unplannedTargets);
  }
  return {
    plannedTargetsTotal,
    unplannedTargetsTotal,
    plannerCapsHit: caps.map((cap) => ({
      dimension: cap.dimension,
      scopeType: cap.scopeType,
      scopeKey: cap.scopeKey,
      totalTargets: cap.totalTargets,
      plannedTargets: cap.plannedTargets,
      unplannedTargets: cap.unplannedTargets,
    })),
  };
}

function normalizeSelectedOperations(
  operations?: string[]
): string[] | undefined {
  if (!Array.isArray(operations) || operations.length === 0) {
    return undefined;
  }
  const unique = Array.from(
    new Set(
      operations.filter(
        (op): op is string => typeof op === 'string' && op.length > 0
      )
    )
  );
  unique.sort((a, b) => a.localeCompare(b));
  return unique.length > 0 ? unique : undefined;
}

function clampNonNegative(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value;
}
