export type CoverageDimension =
  | 'structure'
  | 'branches'
  | 'enum'
  | 'boundaries'
  | 'operations';

export type CoverageMode = 'off' | 'measure' | 'guided';

export const COVERAGE_DIMENSIONS: readonly CoverageDimension[] = [
  'structure',
  'branches',
  'enum',
  'boundaries',
  'operations',
] as const;

export type CoverageStatus = 'active' | 'unreachable' | 'deprecated';

export const COVERAGE_STATUSES: readonly CoverageStatus[] = [
  'active',
  'unreachable',
  'deprecated',
] as const;

export type CoveragePolarity = 'positive' | 'negative';

export type CoverageTargetKind =
  | 'SCHEMA_NODE'
  | 'PROPERTY_PRESENT'
  | 'ONEOF_BRANCH'
  | 'ANYOF_BRANCH'
  | 'CONDITIONAL_PATH'
  | 'ENUM_VALUE_HIT'
  | 'NUMERIC_MIN_HIT'
  | 'NUMERIC_MAX_HIT'
  | 'STRING_MIN_LENGTH_HIT'
  | 'STRING_MAX_LENGTH_HIT'
  | 'ARRAY_MIN_ITEMS_HIT'
  | 'ARRAY_MAX_ITEMS_HIT'
  | 'OP_REQUEST_COVERED'
  | 'OP_RESPONSE_COVERED'
  | 'SCHEMA_REUSED_COVERED';

export const DIAGNOSTIC_TARGET_KINDS = ['SCHEMA_REUSED_COVERED'] as const;

export type DiagnosticCoverageTargetKind =
  (typeof DIAGNOSTIC_TARGET_KINDS)[number];

export interface CoverageTargetBase {
  /**
   * Stable identifier scoped to a FoundryData major version and
   * coverage-report format major version.
   */
  id: string;
  /**
   * Coverage dimension in which this target lives.
   */
  dimension: CoverageDimension;
  /**
   * Target kind, e.g. SCHEMA_NODE, PROPERTY_PRESENT, ONEOF_BRANCH.
   */
  kind: CoverageTargetKind;
  /**
   * Canonical JSON Pointer for the schema node.
   */
  canonPath: string;
  /**
   * Optional operation key for API-linked targets.
   */
  operationKey?: string;
  /**
   * Additional parameters that identify the logical sub-target
   * (branch index, enum index, boundary representative, etc.).
   */
  params?: Record<string, unknown>;
  /**
   * Reachability / metrics status.
   *
   * - 'active' (default) contributes to metrics.
   * - 'unreachable' is derived from existing UNSAT diagnostics.
   * - 'deprecated' is used for diagnostic-only targets that never
   *   contribute to metrics denominators.
   */
  status?: CoverageStatus;
  /**
   * Reserved for future risk-based coverage weighting.
   */
  weight?: number;
  /**
   * Reserved for future positive/negative coverage semantics.
   */
  polarity?: CoveragePolarity;
  /**
   * Diagnostics-only annotations.
   */
  meta?: Record<string, unknown>;
}

export type DeprecatedCoverageTarget = CoverageTargetBase & {
  kind: DiagnosticCoverageTargetKind;
  status: 'deprecated';
};

export type ActiveCoverageTarget = CoverageTargetBase & {
  kind: Exclude<CoverageTargetKind, DiagnosticCoverageTargetKind>;
};

export type CoverageTarget = DeprecatedCoverageTarget | ActiveCoverageTarget;

export type CoverageTargetReport = CoverageTarget & {
  hit: boolean;
};
