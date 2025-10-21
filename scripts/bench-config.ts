import type { BenchProfile, IterationConfig } from './bench-types.js';

export const BENCH_SEEDS = [1, 42, 4242] as const;

export const BENCH_BUDGETS = {
  p95LatencyMs: 120,
  memoryPeakMB: 512,
} as const;

export const DEFAULT_ITERATIONS: IterationConfig = {
  warmup: 5,
  measured: 20,
} as const;

export const profiles: readonly BenchProfile[] = [
  {
    id: 'simple',
    label: 'Simple profile',
    schemaPath: new URL('../profiles/simple.json', import.meta.url),
    generateCount: 64,
  },
  {
    id: 'medium',
    label: 'Medium profile',
    schemaPath: new URL('../profiles/medium.json', import.meta.url),
    generateCount: 48,
  },
  {
    id: 'pathological',
    label: 'Pathological profile',
    schemaPath: new URL('../profiles/pathological.json', import.meta.url),
    generateCount: 16,
  },
] as const;
