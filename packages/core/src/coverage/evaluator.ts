import type {
  CoverageDimension,
  CoverageStatus,
  CoverageTargetReport,
} from '@foundrydata/shared';
import {
  COVERAGE_STATUSES,
  DIAGNOSTIC_TARGET_KINDS,
} from '@foundrydata/shared';
import type {
  CoverageMetrics,
  CoverageReportStatus,
  CoverageThresholds,
} from '@foundrydata/shared';
import type { CoverageReportMode } from '@foundrydata/shared';

const DIAGNOSTIC_KIND_SET = new Set<string>(
  DIAGNOSTIC_TARGET_KINDS as readonly string[]
);

export interface CoverageEvaluatorInput {
  targets: CoverageTargetReport[];
  dimensionsEnabled: CoverageDimension[];
  excludeUnreachable: boolean;
  thresholds?: CoverageThresholds;
}

export interface CoverageEvaluatorResult {
  metrics: CoverageMetrics;
  uncoveredTargets: CoverageTargetReport[];
}

function getOperationKeysForTarget(target: CoverageTargetReport): string[] {
  if (typeof target.operationKey === 'string' && target.operationKey) {
    return [target.operationKey];
  }
  const maybeMeta = target.meta as { operationKeys?: unknown } | undefined;
  const metaOps = maybeMeta?.operationKeys;
  if (!Array.isArray(metaOps)) return [];
  const result: string[] = [];
  for (const value of metaOps) {
    if (typeof value === 'string' && value) {
      result.push(value);
    }
  }
  return result;
}

// eslint-disable-next-line max-lines-per-function, complexity
export function evaluateCoverage(
  input: CoverageEvaluatorInput
): CoverageEvaluatorResult {
  const enabledDimensions = new Set<CoverageDimension>(input.dimensionsEnabled);
  const rawStatusCounts: Record<string, number> = {};

  let overallTotal = 0;
  let overallHit = 0;

  const totalByDimension = new Map<string, number>();
  const hitByDimension = new Map<string, number>();

  const totalByOperation = new Map<string, number>();
  const hitByOperation = new Map<string, number>();

  const uncoveredTargets: CoverageTargetReport[] = [];

  for (const target of input.targets) {
    const status = normalizeStatus(target.status);

    rawStatusCounts[status] = (rawStatusCounts[status] ?? 0) + 1;

    if (
      !target.hit &&
      (status === 'active' ||
        status === 'unreachable' ||
        status === 'deprecated')
    ) {
      uncoveredTargets.push(target);
    }

    const dimensionEnabled = enabledDimensions.has(target.dimension);
    const isDiagnosticKind = DIAGNOSTIC_KIND_SET.has(target.kind);
    const isDeprecatedEffective = isDiagnosticKind || status === 'deprecated';

    const includeStatus =
      status === 'active' ||
      (status === 'unreachable' && !input.excludeUnreachable);

    const includeInMetrics =
      dimensionEnabled && !isDeprecatedEffective && includeStatus;

    if (!includeInMetrics) continue;

    overallTotal += 1;
    if (target.hit) {
      overallHit += 1;
    }

    const dimKey = target.dimension;
    totalByDimension.set(dimKey, (totalByDimension.get(dimKey) ?? 0) + 1);
    if (target.hit) {
      hitByDimension.set(dimKey, (hitByDimension.get(dimKey) ?? 0) + 1);
    }

    const opKeys = getOperationKeysForTarget(target);
    for (const opKey of opKeys) {
      totalByOperation.set(opKey, (totalByOperation.get(opKey) ?? 0) + 1);
      if (target.hit) {
        hitByOperation.set(opKey, (hitByOperation.get(opKey) ?? 0) + 1);
      }
    }
  }

  const overall = computeRatio(overallHit, overallTotal);

  const byDimension: Record<string, number> = {};
  for (const dim of input.dimensionsEnabled) {
    const total = totalByDimension.get(dim) ?? 0;
    if (total <= 0) continue;
    const hit = hitByDimension.get(dim) ?? 0;
    byDimension[dim] = computeRatio(hit, total);
  }

  const byOperation: Record<string, number> = {};
  const operationKeys = Array.from(totalByOperation.keys()).sort();
  for (const opKey of operationKeys) {
    const total = totalByOperation.get(opKey) ?? 0;
    if (total <= 0) continue;
    const hit = hitByOperation.get(opKey) ?? 0;
    byOperation[opKey] = computeRatio(hit, total);
  }

  const targetsByStatus: Record<string, number> = {};
  for (const status of COVERAGE_STATUSES) {
    targetsByStatus[status] = rawStatusCounts[status] ?? 0;
  }

  const thresholds = input.thresholds;
  const coverageStatus = computeCoverageStatus(overall, thresholds);

  const metrics: CoverageMetrics = {
    coverageStatus,
    overall,
    byDimension,
    byOperation,
    targetsByStatus,
    ...(thresholds ? { thresholds } : {}),
  };

  return {
    metrics,
    uncoveredTargets,
  };
}

function normalizeStatus(status: CoverageStatus | undefined): CoverageStatus {
  if (status === 'unreachable' || status === 'deprecated') {
    return status;
  }
  return 'active';
}

function computeCoverageStatus(
  overall: number,
  thresholds?: CoverageThresholds
): CoverageReportStatus {
  const overallThreshold = thresholds?.overall;
  if (typeof overallThreshold !== 'number') {
    return 'ok';
  }
  return overall >= overallThreshold ? 'ok' : 'minCoverageNotMet';
}

function computeRatio(hit: number, total: number): number {
  if (total <= 0) return 1;
  return hit / total;
}

const SUMMARY_MAX_UNCOVERED_TARGETS = 200;

export interface CoverageReportArraysInput {
  reportMode: CoverageReportMode;
  targets: CoverageTargetReport[];
  uncoveredTargets: CoverageTargetReport[];
}

export interface CoverageReportArrays {
  targets: CoverageTargetReport[];
  uncoveredTargets: CoverageTargetReport[];
}

export function applyReportModeToCoverageTargets(
  input: CoverageReportArraysInput
): CoverageReportArrays {
  const sortedUncovered = sortUncoveredTargets(input.uncoveredTargets);

  if (input.reportMode === 'full') {
    return {
      targets: input.targets,
      uncoveredTargets: sortedUncovered,
    };
  }

  const limit = SUMMARY_MAX_UNCOVERED_TARGETS;
  const truncatedUncovered =
    sortedUncovered.length > limit
      ? sortedUncovered.slice(0, limit)
      : sortedUncovered;

  return {
    targets: [],
    uncoveredTargets: truncatedUncovered,
  };
}

function sortUncoveredTargets(
  targets: CoverageTargetReport[]
): CoverageTargetReport[] {
  return [...targets].sort((a, b) => {
    const dimensionCompare = compareStrings(a.dimension, b.dimension);
    if (dimensionCompare !== 0) return dimensionCompare;

    const weightA = typeof a.weight === 'number' ? a.weight : 0;
    const weightB = typeof b.weight === 'number' ? b.weight : 0;
    if (weightA !== weightB) {
      return weightB - weightA;
    }

    const kindCompare = compareStrings(a.kind, b.kind);
    if (kindCompare !== 0) return kindCompare;

    const pathCompare = compareStrings(a.canonPath, b.canonPath);
    if (pathCompare !== 0) return pathCompare;

    const opKeyCompare = compareStrings(
      a.operationKey ?? '',
      b.operationKey ?? ''
    );
    if (opKeyCompare !== 0) return opKeyCompare;

    return compareStrings(a.id, b.id);
  });
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
