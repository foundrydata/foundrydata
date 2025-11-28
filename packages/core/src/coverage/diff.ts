import type {
  CoverageDimension,
  CoverageReport,
  CoverageTargetReport,
} from '@foundrydata/shared';

import { evaluateCoverage, type CoverageEvaluatorResult } from './evaluator.js';

export type CoverageTargetDiffKind =
  | 'unchanged'
  | 'added'
  | 'removed'
  | 'statusChanged';

export interface CoverageTargetDiffEntry {
  kind: CoverageTargetDiffKind;
  /**
   * Target as seen in the baseline report (A) when applicable.
   */
  from?: CoverageTargetReport;
  /**
   * Target as seen in the comparison report (B) when applicable.
   */
  to?: CoverageTargetReport;
}

export interface CoverageTargetsDiff {
  /**
   * All targets present in at least one of the reports, classified
   * into unchanged / added / removed / statusChanged.
   */
  targets: CoverageTargetDiffEntry[];
  /**
   * Subset of targets considered newly uncovered in the comparison
   * report B, as required by the SPEC multi-run diff section.
   */
  newlyUncovered: CoverageTargetDiffEntry[];
}

export interface CoverageMetricDelta {
  from: number;
  to: number;
  delta: number;
}

export interface OperationCoverageDelta extends CoverageMetricDelta {
  operationKey: string;
}

export interface CoverageDiffSummary {
  /**
   * Delta on metrics.overall computed over the common universe
   * of targets (unchanged + statusChanged) and dimensions enabled
   * on both reports.
   */
  overall: CoverageMetricDelta;
  /**
   * Per-operation deltas over the same common universe.
   */
  byOperation: {
    common: OperationCoverageDelta[];
    regressions: OperationCoverageDelta[];
    improvements: OperationCoverageDelta[];
  };
  /**
   * Operations that only appear (with at least one metric-contributing
   * target) in the baseline report A.
   */
  operationsOnlyInA: string[];
  /**
   * Operations that only appear in the comparison report B.
   */
  operationsOnlyInB: string[];
  /**
   * Newly uncovered targets in B (either added and uncovered, or
   * regressed from hit:true → hit:false).
   */
  newlyUncovered: CoverageTargetDiffEntry[];
}

export interface CoverageReportsDiff {
  targets: CoverageTargetsDiff;
  summary: CoverageDiffSummary;
}

function makeTargetKey(target: CoverageTargetReport): string {
  const { id, dimension, kind, canonPath, operationKey } = target;

  return [id, dimension, kind, canonPath, operationKey ?? ''].join('|');
}

interface TargetIndexEntry {
  key: string;
  target: CoverageTargetReport;
}

function indexTargetsById(
  targets: CoverageTargetReport[]
): Map<string, TargetIndexEntry> {
  const index = new Map<string, TargetIndexEntry>();

  for (const target of targets) {
    const key = makeTargetKey(target);

    // If the same id appears multiple times with different shapes,
    // we keep the first and let callers handle this as a higher-level
    // incompatibility if needed. The diff stage itself remains
    // conservative and deterministic.
    if (!index.has(target.id)) {
      index.set(target.id, { key, target });
    }
  }

  return index;
}

// eslint-disable-next-line max-lines-per-function
export function diffCoverageTargets(
  reportA: CoverageReport,
  reportB: CoverageReport
): CoverageTargetsDiff {
  const indexA = indexTargetsById(reportA.targets);
  const indexB = indexTargetsById(reportB.targets);

  const targets: CoverageTargetDiffEntry[] = [];
  const newlyUncovered: CoverageTargetDiffEntry[] = [];

  // Classify targets that are present in A.
  for (const [id, entryA] of indexA) {
    const entryB = indexB.get(id);

    if (!entryB) {
      const diffEntry: CoverageTargetDiffEntry = {
        kind: 'removed',
        from: entryA.target,
      };
      targets.push(diffEntry);
      continue;
    }

    if (entryA.key === entryB.key) {
      if (
        entryA.target.status === entryB.target.status &&
        entryA.target.hit === entryB.target.hit
      ) {
        targets.push({
          kind: 'unchanged',
          from: entryA.target,
          to: entryB.target,
        });
      } else {
        const diffEntry: CoverageTargetDiffEntry = {
          kind: 'statusChanged',
          from: entryA.target,
          to: entryB.target,
        };

        targets.push(diffEntry);

        // eslint-disable-next-line max-depth
        if (!entryB.target.hit && entryA.target.hit) {
          newlyUncovered.push(diffEntry);
        }
      }
    } else {
      // Same id but different identifying shape. At this stage we treat
      // them as independent removed/added targets; higher-level
      // validation of report compatibility (version, engine major,
      // operationsScope, etc.) is handled elsewhere.
      targets.push({ kind: 'removed', from: entryA.target });
      targets.push({ kind: 'added', to: entryB.target });

      if (!entryB.target.hit) {
        newlyUncovered.push({ kind: 'added', to: entryB.target });
      }
    }

    indexB.delete(id);
  }

  // Remaining targets exist only in B and are therefore added.
  for (const [, entryB] of indexB) {
    const diffEntry: CoverageTargetDiffEntry = {
      kind: 'added',
      to: entryB.target,
    };

    targets.push(diffEntry);

    if (!entryB.target.hit) {
      newlyUncovered.push(diffEntry);
    }
  }

  return { targets, newlyUncovered };
}

// eslint-disable-next-line max-lines-per-function
export function diffCoverageReports(
  reportA: CoverageReport,
  reportB: CoverageReport
): CoverageReportsDiff {
  const targetsDiff = diffCoverageTargets(reportA, reportB);

  const commonTargetsA: CoverageTargetReport[] = [];
  const commonTargetsB: CoverageTargetReport[] = [];

  for (const entry of targetsDiff.targets) {
    if (entry.kind === 'unchanged' || entry.kind === 'statusChanged') {
      if (entry.from) {
        commonTargetsA.push(entry.from);
      }
      if (entry.to) {
        commonTargetsB.push(entry.to);
      }
    }
  }

  const commonDimensions = intersectDimensions(
    reportA.run.dimensionsEnabled,
    reportB.run.dimensionsEnabled
  );

  const coverageA = evaluateOnCommonUniverse(
    commonTargetsA,
    commonDimensions,
    reportA.run.excludeUnreachable
  );
  const coverageB = evaluateOnCommonUniverse(
    commonTargetsB,
    commonDimensions,
    reportB.run.excludeUnreachable
  );

  const overall: CoverageMetricDelta = {
    from: coverageA.metrics.overall,
    to: coverageB.metrics.overall,
    delta: coverageB.metrics.overall - coverageA.metrics.overall,
  };

  const {
    deltas: byOperationDeltas,
    operationsOnlyInA,
    operationsOnlyInB,
  } = computeOperationDeltas(
    coverageA.metrics.byOperation,
    coverageB.metrics.byOperation
  );

  const regressions = byOperationDeltas.filter((d) => d.delta < 0);
  const improvements = byOperationDeltas.filter((d) => d.delta > 0);

  const summary: CoverageDiffSummary = {
    overall,
    byOperation: {
      common: byOperationDeltas,
      regressions,
      improvements,
    },
    operationsOnlyInA,
    operationsOnlyInB,
    newlyUncovered: targetsDiff.newlyUncovered,
  };

  return {
    targets: targetsDiff,
    summary,
  };
}

function evaluateOnCommonUniverse(
  targets: CoverageTargetReport[],
  dimensionsEnabled: CoverageDimension[],
  excludeUnreachable: boolean
): CoverageEvaluatorResult {
  return evaluateCoverage({
    targets,
    dimensionsEnabled,
    excludeUnreachable,
  });
}

function intersectDimensions(
  dimsA: readonly CoverageDimension[],
  dimsB: readonly CoverageDimension[]
): CoverageDimension[] {
  const setB = new Set<CoverageDimension>(dimsB);
  const common: CoverageDimension[] = [];

  for (const dim of dimsA) {
    if (setB.has(dim) && !common.includes(dim)) {
      common.push(dim);
    }
  }

  return common;
}

function computeOperationDeltas(
  byOpA: Record<string, number>,
  byOpB: Record<string, number>
): {
  deltas: OperationCoverageDelta[];
  operationsOnlyInA: string[];
  operationsOnlyInB: string[];
} {
  const opsA = Object.keys(byOpA);
  const opsB = Object.keys(byOpB);

  const setA = new Set(opsA);
  const setB = new Set(opsB);

  const commonOps: string[] = [];
  for (const op of opsA) {
    if (setB.has(op)) {
      commonOps.push(op);
    }
  }

  commonOps.sort();

  const operationsOnlyInA = opsA.filter((op) => !setB.has(op)).sort();
  const operationsOnlyInB = opsB.filter((op) => !setA.has(op)).sort();

  const deltas: OperationCoverageDelta[] = commonOps.map((operationKey) => {
    const from = byOpA[operationKey] ?? 0;
    const to = byOpB[operationKey] ?? 0;
    return {
      operationKey,
      from,
      to,
      delta: to - from,
    };
  });

  return {
    deltas,
    operationsOnlyInA,
    operationsOnlyInB,
  };
}
