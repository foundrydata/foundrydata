/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */
import type {
  CoverageDimension,
  CoverageMode,
  CoverageReport,
  CoverageReportMode,
  CoverageTarget,
  CoverageTargetReport,
  CoverageMetrics,
  CoverageThresholds,
  PlannerCapHit,
  UnsatisfiedHint,
} from '@foundrydata/shared';
import { COVERAGE_REPORT_VERSION_V1 } from '@foundrydata/shared';

import type {
  CoverageGraph,
  CoveragePlannerConfig,
  TestUnit,
} from './index.js';
import {
  resolveCoveragePlannerConfig,
  applyPlannerCaps,
  planTestUnits,
  assignTestUnitSeeds,
  DEFAULT_PLANNER_DIMENSIONS_ENABLED,
} from './index.js';
import { analyzeCoverage, type CoverageAnalyzerInput } from './analyzer.js';
import {
  evaluateCoverage,
  type CoverageEvaluatorInput,
  applyReportModeToCoverageTargets,
} from './evaluator.js';

import type { NormalizeResult } from '../transform/schema-normalizer.js';
import type { ComposeResult } from '../transform/composition-engine.js';
import type {
  PipelineOptions,
  PipelineStageOverrides,
} from '../pipeline/types.js';

export interface CoverageRuntimePlanInput {
  canonicalSchema: unknown;
  normalizeResult?: NormalizeResult;
  composeResult: ComposeResult;
  coverageOptions?: PipelineOptions['coverage'];
  generateOptions?: PipelineOptions['generate'];
  testOverrides?: PipelineStageOverrides['coverageTestOverrides'];
}

export interface CoverageRuntimePlanResult {
  mode: CoverageMode;
  dimensionsEnabled: CoverageDimension[];
  graph: CoverageGraph;
  targets: CoverageTarget[];
  plannedTargets: CoverageTarget[];
  plannedTestUnits: TestUnit[];
  plannerCapsHit: PlannerCapHit[];
  unsatisfiedHints: UnsatisfiedHint[];
}

export interface CoverageRuntimeEvaluationRunInfo {
  seed: number;
  maxInstances: number;
  actualInstances: number;
  startedAtIso: string;
  durationMs: number;
}

export interface CoverageRuntimeEvaluationEngineInfo {
  foundryVersion: string;
  ajvMajor: number;
}

export interface CoverageRuntimeEvaluationInput {
  mode: CoverageMode;
  dimensionsEnabled: CoverageDimension[];
  coverageOptions?: PipelineOptions['coverage'];
  targets: CoverageTargetReport[];
  plannerCapsHit?: PlannerCapHit[];
  unsatisfiedHints?: UnsatisfiedHint[];
  runInfo: CoverageRuntimeEvaluationRunInfo;
  engineInfo: CoverageRuntimeEvaluationEngineInfo;
}

export interface CoverageRuntimeEvaluationResult {
  metrics: CoverageMetrics;
  report: CoverageReport;
  uncoveredTargets: CoverageTargetReport[];
}

export function shouldRunCoverageAnalyzer(
  coverageOptions?: PipelineOptions['coverage']
): boolean {
  const mode = coverageOptions?.mode ?? 'off';
  return mode === 'measure' || mode === 'guided';
}

export function resolveCoverageDimensions(
  userDimensions?: CoverageDimension[]
): CoverageDimension[] {
  if (Array.isArray(userDimensions) && userDimensions.length > 0) {
    return userDimensions;
  }
  return [...DEFAULT_PLANNER_DIMENSIONS_ENABLED];
}

export function planCoverageForPipeline(
  input: CoverageRuntimePlanInput
): CoverageRuntimePlanResult | undefined {
  const coverageMode = normalizeCoverageMode(input.coverageOptions?.mode);
  if (!shouldRunCoverageAnalyzer(input.coverageOptions)) {
    return undefined;
  }

  const dimensionsEnabled = resolveCoverageDimensions(
    input.coverageOptions?.dimensionsEnabled
  );

  const analyzerInput: CoverageAnalyzerInput = {
    canonSchema: input.canonicalSchema,
    ptrMap: input.normalizeResult?.ptrMap ?? new Map<string, string>(),
    coverageIndex: input.composeResult.coverageIndex,
    planDiag: input.composeResult.diag,
    dimensionsEnabled,
  };

  const analyzerResult = analyzeCoverage(analyzerInput);

  let plannedTargets = analyzerResult.targets;
  let plannedTestUnits: TestUnit[] = [];
  const plannerCapsHit: PlannerCapHit[] = [];
  const unsatisfiedHints: UnsatisfiedHint[] = [];

  if (coverageMode === 'guided') {
    const requestedCount = input.generateOptions?.count;
    if (
      typeof requestedCount === 'number' &&
      Number.isFinite(requestedCount) &&
      requestedCount > 0
    ) {
      const plannerConfig: CoveragePlannerConfig = resolveCoveragePlannerConfig(
        {
          maxInstances: requestedCount,
          dimensionsEnabled,
          dimensionPriority: input.coverageOptions?.planner?.dimensionPriority,
          softTimeMs: input.coverageOptions?.planner?.softTimeMs,
          caps: input.coverageOptions?.planner?.caps,
        }
      );

      const capsResult = applyPlannerCaps(
        analyzerResult.targets,
        plannerConfig
      );
      plannedTargets = capsResult.updatedTargets;
      plannerCapsHit.push(...capsResult.capsHit);

      const plannerResult = planTestUnits({
        graph: analyzerResult.graph,
        targets: plannedTargets,
        config: plannerConfig,
        canonSchema: input.canonicalSchema,
        coverageIndex: input.composeResult.coverageIndex,
        planDiag: input.composeResult.diag,
        extraHints: input.testOverrides?.extraPlannerHints ?? [],
      });

      const units = plannerResult.testUnits;
      if (Array.isArray(units) && units.length > 0) {
        const generateSeed = input.generateOptions?.seed;
        const masterSeed =
          typeof generateSeed === 'number' && Number.isFinite(generateSeed)
            ? generateSeed
            : 0;
        plannedTestUnits = assignTestUnitSeeds(units, { masterSeed });
      }

      const { conflictingHints } = plannerResult;
      if (Array.isArray(conflictingHints) && conflictingHints.length > 0) {
        unsatisfiedHints.push(...conflictingHints);
      }
    }
  }

  return {
    mode: coverageMode,
    dimensionsEnabled,
    graph: analyzerResult.graph,
    targets: analyzerResult.targets,
    plannedTargets,
    plannedTestUnits,
    plannerCapsHit,
    unsatisfiedHints,
  };
}

export function evaluateCoverageAndBuildReport(
  input: CoverageRuntimeEvaluationInput
): CoverageRuntimeEvaluationResult {
  const coverageDimensions = input.dimensionsEnabled;
  const coverageReportMode: CoverageReportMode =
    input.coverageOptions?.reportMode ?? 'full';

  const thresholds: CoverageThresholds | undefined =
    typeof input.coverageOptions?.minCoverage === 'number'
      ? { overall: input.coverageOptions.minCoverage }
      : undefined;

  const evaluatorInput: CoverageEvaluatorInput = {
    targets: input.targets,
    dimensionsEnabled: coverageDimensions,
    excludeUnreachable: input.coverageOptions?.excludeUnreachable ?? false,
    thresholds,
  };

  const evaluation = evaluateCoverage(evaluatorInput);

  const reportArrays = applyReportModeToCoverageTargets({
    reportMode: coverageReportMode,
    targets: input.targets,
    uncoveredTargets: evaluation.uncoveredTargets,
  });

  const coverageReport: CoverageReport = {
    version: COVERAGE_REPORT_VERSION_V1,
    reportMode: coverageReportMode,
    engine: {
      foundryVersion: input.engineInfo.foundryVersion,
      coverageMode: input.mode,
      ajvMajor: input.engineInfo.ajvMajor,
    },
    run: {
      seed: input.runInfo.seed,
      masterSeed: input.runInfo.seed,
      maxInstances: input.runInfo.maxInstances,
      actualInstances: input.runInfo.actualInstances,
      dimensionsEnabled: coverageDimensions,
      excludeUnreachable: evaluatorInput.excludeUnreachable,
      startedAt: input.runInfo.startedAtIso,
      durationMs: input.runInfo.durationMs,
    },
    metrics: evaluation.metrics,
    targets: reportArrays.targets,
    uncoveredTargets: reportArrays.uncoveredTargets,
    unsatisfiedHints: input.unsatisfiedHints ?? [],
    diagnostics: {
      plannerCapsHit: input.plannerCapsHit ?? [],
      notes: [],
    },
  };

  return {
    metrics: evaluation.metrics,
    report: coverageReport,
    uncoveredTargets: evaluation.uncoveredTargets,
  };
}

function normalizeCoverageMode(mode: CoverageMode | undefined): CoverageMode {
  if (mode === 'measure' || mode === 'guided') {
    return mode;
  }
  return 'off';
}
