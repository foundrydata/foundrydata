import type {
  CoverageDimension,
  CoverageMode,
  CoverageTargetReport,
} from '../coverage/index.js';

export type PlannerCapScopeType = 'schema' | 'operation';

export interface PlannerCapHit {
  /**
   * Coverage dimension affected by the planner cap
   * (e.g. "branches", "enum", "structure", "boundaries").
   */
  dimension: CoverageDimension | string;
  /**
   * Scope in which the cap was applied: whole schema
   * or a single operation.
   */
  scopeType: PlannerCapScopeType;
  /**
   * Schema path or operation key identifying the scope.
   */
  scopeKey: string;
  /**
   * Total logical targets in this scope for the dimension.
   */
  totalTargets: number;
  /**
   * Targets planned before the cap stopped planning.
   */
  plannedTargets: number;
  /**
   * Targets not planned because of the cap.
   */
  unplannedTargets: number;
}

export type UnsatisfiedHintReasonCode =
  | 'CONFLICTING_CONSTRAINTS'
  | 'REPAIR_MODIFIED_VALUE'
  | 'UNREACHABLE_BRANCH'
  | 'PLANNER_CAP'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN';

export interface UnsatisfiedHint {
  kind: string;
  canonPath: string;
  params?: Record<string, unknown>;
  reasonCode: UnsatisfiedHintReasonCode;
  reasonDetail?: string;
}

export type CoverageReportMode = 'full' | 'summary';

export const COVERAGE_REPORT_MODES: readonly CoverageReportMode[] = [
  'full',
  'summary',
] as const;

export type CoverageReportStatus = 'ok' | 'minCoverageNotMet';

export const COVERAGE_REPORT_VERSION_V1 = 'coverage-report/v1' as const;

export interface CoverageReportEngine {
  foundryVersion: string;
  coverageMode: CoverageMode;
  ajvMajor: number;
}

export interface CoverageReportRun {
  seed: number;
  masterSeed: number;
  maxInstances: number;
  actualInstances: number;
  dimensionsEnabled: CoverageDimension[];
  excludeUnreachable: boolean;
  startedAt: string;
  durationMs: number;
  /**
   * Scope of operations for this run when an OpenAPI context is present.
   * 'all' means all operations in the spec were in scope; 'selected' means
   * only a subset was targeted (for example via CLI filters).
   */
  operationsScope?: 'all' | 'selected';
  /**
   * Optional list of operation keys actually in scope when operationsScope === 'selected'.
   */
  selectedOperations?: string[];
}

export interface CoverageThresholds {
  /**
   * In V1, only overall is enforced for coverageStatus.
   */
  overall?: number;
  /**
   * Reserved for future per-dimension thresholds; descriptive only in V1.
   */
  byDimension?: Record<string, number>;
  /**
   * Reserved for future per-operation thresholds; descriptive only in V1.
   */
  byOperation?: Record<string, number>;
}

export interface CoverageMetrics {
  coverageStatus: CoverageReportStatus;
  overall: number;
  byDimension: Record<string, number>;
  byOperation: Record<string, number>;
  targetsByStatus: Record<string, number>;
  thresholds?: CoverageThresholds;
}

export interface CoverageDiagnostics {
  plannerCapsHit: PlannerCapHit[];
  notes: unknown[];
}

export interface CoverageReport {
  version: string;
  reportMode: CoverageReportMode;
  engine: CoverageReportEngine;
  run: CoverageReportRun;
  metrics: CoverageMetrics;
  targets: CoverageTargetReport[];
  uncoveredTargets: CoverageTargetReport[];
  unsatisfiedHints: UnsatisfiedHint[];
  diagnostics: CoverageDiagnostics;
}
