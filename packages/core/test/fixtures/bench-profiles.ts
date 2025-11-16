import { createRequire } from 'node:module';

const requireJson = createRequire(import.meta.url);

export const BENCH_SEEDS = [1, 42, 4242] as const;
export const BENCH_BUDGETS = {
  p95LatencyMs: 120,
  memoryPeakMB: 512,
} as const;
export const DEFAULT_ITERATIONS = {
  warmup: 5,
  measured: 20,
} as const;

export interface BenchProfileFixture {
  id: 'simple' | 'medium' | 'pathological';
  label: string;
  schema: Record<string, unknown>;
  schemaPath: URL;
  generateCount: number;
  sampleSize: number;
  metricsBudget?: {
    validationsPerRowP50?: number;
    repairPassesPerRowP50?: number;
  };
}

function loadSchema(filename: string): Record<string, unknown> {
  return requireJson(`../../../../profiles/${filename}`) as Record<
    string,
    unknown
  >;
}

function makeSchemaUrl(filename: string): URL {
  return new URL(`../../../../profiles/${filename}`, import.meta.url);
}

export const benchProfileFixtures: readonly BenchProfileFixture[] = [
  {
    id: 'simple',
    label: 'Simple profile',
    schema: loadSchema('simple.json'),
    schemaPath: makeSchemaUrl('simple.json'),
    generateCount: 64,
    sampleSize: 8,
    metricsBudget: {
      validationsPerRowP50: 3,
      repairPassesPerRowP50: 1,
    },
  },
  {
    id: 'medium',
    label: 'Medium profile',
    schema: loadSchema('medium.json'),
    schemaPath: makeSchemaUrl('medium.json'),
    generateCount: 48,
    sampleSize: 6,
    metricsBudget: {
      validationsPerRowP50: 3,
      repairPassesPerRowP50: 1,
    },
  },
  {
    id: 'pathological',
    label: 'Pathological profile',
    schema: loadSchema('pathological.json'),
    schemaPath: makeSchemaUrl('pathological.json'),
    generateCount: 16,
    sampleSize: 4,
  },
] as const;
