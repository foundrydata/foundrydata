import type {
  CoverageDimension,
  CoverageStatus,
  CoveragePolarity,
  CoverageTargetKind,
  CoverageTarget,
  CoverageTargetReport,
  CoverageMetrics,
} from '@foundrydata/shared';

export type {
  CoverageDimension,
  CoverageStatus,
  CoveragePolarity,
  CoverageTargetKind,
  CoverageTarget,
  CoverageTargetReport,
  CoverageMetrics,
};

export {
  createCoverageAccumulator,
  type CoverageAccumulator,
  createStreamingCoverageAccumulator,
  type StreamingCoverageAccumulator,
  type InstanceCoverageState,
  type CoverageEvent,
  type SchemaNodeHitEvent,
  type PropertyPresentHitEvent,
  type OneOfBranchHitEvent,
  type AnyOfBranchHitEvent,
  type ConditionalPathHitEvent,
  type EnumValueHitEvent,
} from './events.js';

export {
  evaluateCoverage,
  type CoverageEvaluatorInput,
  type CoverageEvaluatorResult,
  applyReportModeToCoverageTargets,
  type CoverageReportArraysInput,
  type CoverageReportArrays,
} from './evaluator.js';

export {
  diffCoverageTargets,
  diffCoverageReports,
  type CoverageTargetDiffKind,
  type CoverageTargetDiffEntry,
  type CoverageTargetsDiff,
  type CoverageReportsDiff,
  type CoverageDiffSummary,
  type CoverageMetricDelta,
  type OperationCoverageDelta,
  type CoverageDiffCompatibilityIssue,
  type CoverageDiffCompatibilityIssueKind,
  checkCoverageDiffCompatibility,
} from './diff.js';

export type CoverageGraphNodeKind =
  | 'schema'
  | 'property'
  | 'branch'
  | 'constraint'
  | 'enum'
  | 'operation';

export interface CoverageGraphNode {
  /**
   * Stable identifier for the graph node, scoped to the canonical
   * view of the schema and OpenAPI mapping. This is separate from
   * CoverageTarget.id, which is scoped to coverage dimensions.
   */
  id: string;
  kind: CoverageGraphNodeKind;
  /**
   * Canonical JSON Pointer for schema-linked nodes.
   */
  canonPath: string;
  /**
   * Optional operation key for API-linked nodes.
   */
  operationKey?: string;
  /**
   * Free-form diagnostics metadata, for example counts of
   * attached targets or UNSAT hints.
   */
  meta?: Record<string, unknown>;
}

export type CoverageGraphEdgeKind =
  | 'structural'
  | 'logical'
  | 'reference'
  | 'operation';

export interface CoverageGraphEdge {
  from: string;
  to: string;
  kind: CoverageGraphEdgeKind;
  meta?: Record<string, unknown>;
}

export interface CoverageGraph {
  nodes: CoverageGraphNode[];
  edges: CoverageGraphEdge[];
}
