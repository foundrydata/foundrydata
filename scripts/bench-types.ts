import type { MetricsSnapshot } from '../packages/core/src/index.js';

export interface IterationConfig {
  warmup: number;
  measured: number;
}

export interface BenchProfile {
  id: string;
  label: string;
  schemaPath: URL;
  generateCount: number;
  iterations?: IterationConfig;
}

export interface SingleRunResult {
  seed: number;
  latencyMs: number;
  memoryPeakMB: number;
  metrics: MetricsSnapshot;
}

export interface ProfileSummary {
  id: string;
  label: string;
  warmupCount: number;
  measuredCount: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  memoryPeakMB: number;
  runs: readonly SingleRunResult[];
}

export interface GateSummary {
  p95LatencyMs: number;
  memoryPeakMB: number;
}

export interface RunProfileOverrides {
  iterations?: IterationConfig;
  seeds?: readonly number[];
  generateCount?: number;
  schema?: unknown;
}
