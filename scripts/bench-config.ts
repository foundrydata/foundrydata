import {
  BENCH_BUDGETS as SHARED_BENCH_BUDGETS,
  BENCH_SEEDS as SHARED_BENCH_SEEDS,
  DEFAULT_ITERATIONS as SHARED_DEFAULT_ITERATIONS,
  benchProfileFixtures,
} from '../packages/core/test/fixtures/bench-profiles.js';
import type { BenchProfile, IterationConfig } from './bench-types.js';

export const BENCH_SEEDS = SHARED_BENCH_SEEDS;
export const BENCH_BUDGETS = SHARED_BENCH_BUDGETS;
export const DEFAULT_ITERATIONS: IterationConfig = {
  warmup: SHARED_DEFAULT_ITERATIONS.warmup,
  measured: SHARED_DEFAULT_ITERATIONS.measured,
};

export const profiles = benchProfileFixtures.map<BenchProfile>((fixture) => ({
  id: fixture.id,
  label: fixture.label,
  schemaPath: fixture.schemaPath,
  generateCount: fixture.generateCount,
})) as readonly BenchProfile[];
