export interface BranchCoverageOneOfEntry {
  visited: number[];
  total: number;
}

export interface RepairUsageByMotif {
  motifId: string;
  gValid: boolean;
  items: number;
  itemsWithRepair: number;
  actions: number;
  canonPath?: string;
  tiers?: {
    tier1?: number;
    tier2?: number;
    tier3?: number;
    disabled?: number;
  };
}

/**
 * Baseline diag.metrics shape used across pipeline, diagnostics and reporter.
 * Timings and counters are deterministic; SLIs (latency/memory) are
 * environment-dependent and may stay at 0 outside bench harness runs.
 */
export interface DiagMetrics {
  normalizeMs: number;
  composeMs: number;
  generateMs: number;
  repairMs: number;
  validateMs: number;
  compileMs?: number;
  validationsPerRow: number;
  repairPassesPerRow: number;
  repairActionsPerRow: number;
  branchTrialsTried: number;
  patternWitnessTried: number;
  evalTraceChecks: number;
  evalTraceProved: number;
  memoryPeakMB: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  repair_tier1_actions: number;
  repair_tier2_actions: number;
  repair_tier3_actions: number;
  repair_tierDisabled: number;
  nameBfsNodesExpanded?: number;
  nameBfsQueuePeak?: number;
  nameBeamWidthPeak?: number;
  nameEnumResults?: number;
  nameEnumElapsedMs?: number;
  patternPropsHit?: number;
  presencePressureResolved?: number;
  branchCoverageOneOf?: Record<string, BranchCoverageOneOfEntry>;
  enumUsage?: Record<string, Record<string, number>>;
  repairUsageByMotif?: RepairUsageByMotif[];
  /** Optional per-motif counters for G_valid zones (e.g., gValid_simpleObjectRequired_items). */
  [metricName: `gValid_${string}`]: number | undefined;
}
