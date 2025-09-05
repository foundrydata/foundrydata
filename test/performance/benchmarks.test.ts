/**
 * Performance Benchmarks for FoundryData
 * Testing Architecture v2.1
 *
 * This file provides comprehensive performance benchmarks with:
 * - Deterministic seed for reproducible results
 * - Percentile-based measurements (p50, p95, p99)
 * - Platform-aware tolerances
 * - Multi-draft JSON Schema testing
 * - Memory efficiency tracking
 * - Regression detection
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import v8 from 'node:v8';
import { createAjv, type JsonSchemaDraft } from '../helpers/ajv-factory';
import type { JSONSchema7 } from 'json-schema';
import { TEST_SEED } from '../setup';
import { BaselineManager as ExternalBaselineManager } from './baseline-manager';

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

/** Deterministic seed for benchmark reproducibility */
const BENCHMARK_SEED = TEST_SEED;

/** Minimum number of runs for stable percentile calculations */
const MIN_BENCHMARK_RUNS = 100;

/** Warmup runs before actual measurements */
const WARMUP_RUNS = 10;

/** Platform detection */
const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';
const IS_CI = process.env.CI === 'true';
const NODE_VERSION = process.version;

/** Platform-specific tolerance multipliers */
const PLATFORM_MULTIPLIER = IS_WINDOWS ? 1.5 : 1.0;

/** Performance targets (in milliseconds) */
const PERFORMANCE_TARGETS = {
  simple: {
    p50: 0.2 * PLATFORM_MULTIPLIER,
    p95: 0.5 * PLATFORM_MULTIPLIER,
    p99: 1.0 * PLATFORM_MULTIPLIER,
  },
  medium: {
    p50: 0.8 * PLATFORM_MULTIPLIER,
    p95: 2.0 * PLATFORM_MULTIPLIER,
    p99: 5.0 * PLATFORM_MULTIPLIER,
  },
  complex: {
    p50: 8.0 * PLATFORM_MULTIPLIER,
    p95: 20.0 * PLATFORM_MULTIPLIER,
    p99: 50.0 * PLATFORM_MULTIPLIER,
  },
  batch: {
    validation_1000: {
      p50: 5.0 * PLATFORM_MULTIPLIER,
      p95: 10.0 * PLATFORM_MULTIPLIER,
      p99: 20.0 * PLATFORM_MULTIPLIER,
    },
  },
  memory: {
    generation_10000: {
      p95: 100, // MB
      max: 150, // MB
    },
  },
};

// ============================================================================
// MEASUREMENT UTILITIES
// ============================================================================

/** Benchmark result structure */
interface BenchmarkResult {
  name: string;
  runs: number;
  warmups: number;
  measurements: number[];
  percentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
  memory?: {
    before: number;
    after: number;
    delta: number;
  };
  platform: string;
  nodeVersion: string;
  timestamp: string;
}

/** Performance measurement utilities */
class PerformanceMeasurement {
  private measurements: number[] = [];

  /**
   * Run a benchmark with warmup and measurements
   */
  async runBenchmark(
    name: string,
    fn: () => void | Promise<void>,
    runs: number = MIN_BENCHMARK_RUNS,
    warmupRuns: number = WARMUP_RUNS
  ): Promise<BenchmarkResult> {
    // Clear measurements
    this.measurements = [];

    // Warmup phase
    for (let i = 0; i < warmupRuns; i++) {
      await fn();
    }

    // Force garbage collection before measurements (if available)
    // eslint-disable-next-line no-undef
    if (typeof global !== 'undefined' && (global as any).gc) {
      // eslint-disable-next-line no-undef
      (global as any).gc();
    }

    // Measurement phase
    const memBefore = this.getMemoryUsage();

    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      this.measurements.push(end - start);
    }

    const memAfter = this.getMemoryUsage();

    // Remove outliers (top/bottom 5%)
    const cleanedMeasurements = this.removeOutliers(this.measurements, 0.05);

    // Calculate percentiles
    const percentiles = this.calculatePercentiles(cleanedMeasurements);

    return {
      name,
      runs,
      warmups: warmupRuns,
      measurements: cleanedMeasurements,
      percentiles,
      memory: {
        before: memBefore,
        after: memAfter,
        delta: memAfter - memBefore,
      },
      platform: PLATFORM,
      nodeVersion: NODE_VERSION,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Remove outliers from measurements
   */
  private removeOutliers(data: number[], percentile: number): number[] {
    const sorted = [...data].sort((a, b) => a - b);
    const cutoff = Math.floor(sorted.length * percentile);
    return sorted.slice(cutoff, sorted.length - cutoff);
  }

  /**
   * Calculate percentiles from measurements
   */
  private calculatePercentiles(data: number[]): {
    p50: number;
    p95: number;
    p99: number;
  } {
    const sorted = [...data].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      p50: sorted[p50Index] ?? 0,
      p95: sorted[p95Index] ?? 0,
      p99: sorted[p99Index] ?? 0,
    };
  }

  /**
   * Get current memory usage in MB
   */
  private getMemoryUsage(): number {
    const heapUsed = v8.getHeapStatistics().used_heap_size;
    return heapUsed / (1024 * 1024); // Convert to MB
  }
}

// ============================================================================
// CACHE WARMING UTILITIES
// ============================================================================

/**
 * Cache warmer for AJV validators and other resources
 */
class CacheWarmer {
  private ajvInstances: Map<JsonSchemaDraft, any> = new Map();
  private compiledSchemas: WeakMap<object, any> = new WeakMap();

  /**
   * Warm AJV validator caches
   */
  async warmAjvCaches(drafts: JsonSchemaDraft[]): Promise<void> {
    for (const draft of drafts) {
      const ajv = createAjv(draft);
      this.ajvInstances.set(draft, ajv);

      // Compile common schemas to warm the cache
      const schemas = this.getCommonSchemas();
      for (const schema of schemas) {
        try {
          const validator = ajv.compile(schema);
          this.compiledSchemas.set(schema, validator);
        } catch {
          // Ignore compilation errors for warming
        }
      }
    }
  }

  /**
   * Get common schemas for cache warming
   */
  private getCommonSchemas(): JSONSchema7[] {
    return [
      { type: 'string' },
      { type: 'number' },
      { type: 'integer' },
      { type: 'boolean' },
      { type: 'object', properties: { id: { type: 'string' } } },
      { type: 'array', items: { type: 'string' } },
      { type: 'string', format: 'uuid' },
      { type: 'string', format: 'email' },
      { type: 'string', format: 'date' },
      { type: 'string', format: 'date-time' },
      { type: 'number', minimum: 0, maximum: 100 },
      { type: 'string', minLength: 1, maxLength: 100 },
      { type: 'array', minItems: 0, maxItems: 10 },
    ];
  }

  /**
   * Get AJV instance for a draft
   */
  getAjv(draft: JsonSchemaDraft): any {
    return this.ajvInstances.get(draft) ?? createAjv(draft);
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.ajvInstances.clear();
    // WeakMap will be garbage collected automatically
  }
}

// ============================================================================
// BENCHMARK CATEGORIES
// ============================================================================

/**
 * JSON Schema coverage tracker
 */
class SchemaCoverageTracker {
  private coveredKeywords: Set<string> = new Set();
  private coveredCombinations: Set<string> = new Set();
  private edgeCasesByDraft: Map<JsonSchemaDraft, Set<string>> = new Map();

  /**
   * Track keyword coverage
   */
  trackKeyword(keyword: string): void {
    this.coveredKeywords.add(keyword);
  }

  /**
   * Track keyword combination
   */
  trackCombination(combination: string[]): void {
    this.coveredCombinations.add(combination.sort().join('+'));
  }

  /**
   * Track edge case
   */
  trackEdgeCase(draft: JsonSchemaDraft, edgeCase: string): void {
    if (!this.edgeCasesByDraft.has(draft)) {
      this.edgeCasesByDraft.set(draft, new Set());
    }
    this.edgeCasesByDraft.get(draft)?.add(edgeCase);
  }

  /**
   * Get coverage report
   */
  getCoverageReport(): {
    keywords: string[];
    combinations: string[];
    edgeCasesByDraft: Record<string, string[]>;
    coverage: {
      keywords: number;
      combinations: number;
    };
  } {
    const totalKeywords = [
      'type',
      'format',
      'minimum',
      'maximum',
      'minLength',
      'maxLength',
      'pattern',
      'items',
      'properties',
      'required',
      'enum',
      'const',
      'multipleOf',
      'minItems',
      'maxItems',
      'uniqueItems',
      'additionalProperties',
      'dependencies',
      'if',
      'then',
      'else',
    ];

    const edgeCasesByDraft: Record<string, string[]> = {};
    for (const [draft, cases] of this.edgeCasesByDraft) {
      edgeCasesByDraft[draft] = Array.from(cases);
    }

    return {
      keywords: Array.from(this.coveredKeywords),
      combinations: Array.from(this.coveredCombinations),
      edgeCasesByDraft,
      coverage: {
        keywords: (this.coveredKeywords.size / totalKeywords.length) * 100,
        combinations: this.coveredCombinations.size,
      },
    };
  }
}

// ============================================================================
// BASELINE MANAGEMENT
// ============================================================================

// Using the external BaselineManager from baseline-manager.ts
// which has full implementation for loading and saving

// ============================================================================
// GLOBAL TEST STATE
// ============================================================================

let measurement: PerformanceMeasurement;
let cacheWarmer: CacheWarmer;
let coverageTracker: SchemaCoverageTracker;
let baselineManager: ExternalBaselineManager;
const allBenchmarkResults: BenchmarkResult[] = [];

/**
 * Helper function to run benchmark and collect results
 */
async function runAndCollectBenchmark(
  name: string,
  fn: () => void | Promise<void>,
  runs?: number,
  warmupRuns?: number
): Promise<BenchmarkResult> {
  const result = await measurement.runBenchmark(name, fn, runs, warmupRuns);
  allBenchmarkResults.push(result);
  return result;
}

beforeAll(async () => {
  measurement = new PerformanceMeasurement();
  cacheWarmer = new CacheWarmer();
  coverageTracker = new SchemaCoverageTracker();
  baselineManager = new ExternalBaselineManager();

  // Load baseline if available
  await baselineManager.loadBaseline();

  // Warm caches for all supported drafts
  await cacheWarmer.warmAjvCaches(['draft-07', '2019-09', '2020-12']);

  console.log('🚀 Performance benchmarks initialized', {
    platform: PLATFORM,
    nodeVersion: NODE_VERSION,
    isCI: IS_CI,
    seed: BENCHMARK_SEED,
  });
});

afterAll(async () => {
  // Clear caches
  cacheWarmer.clearCaches();

  // Print coverage report
  const coverage = coverageTracker.getCoverageReport();
  console.log('📊 Schema Coverage Report:', coverage);

  // Save all benchmark results to baseline if we have any
  if (allBenchmarkResults.length > 0) {
    await baselineManager.saveBaseline(allBenchmarkResults);
    console.log(
      `📊 Saved ${allBenchmarkResults.length} benchmark results to baseline`
    );
  }
});

// ============================================================================
// MICRO BENCHMARKS - Single Operations
// ============================================================================

describe('Micro Benchmarks', () => {
  describe('Schema Validation', () => {
    test('Simple string schema validation', async () => {
      const ajv = cacheWarmer.getAjv('draft-07');
      const schema: JSONSchema7 = { type: 'string' };
      const validate = ajv.compile(schema);
      const data = 'test string';

      coverageTracker.trackKeyword('type');

      const result = await runAndCollectBenchmark(
        'simple-string-validation',
        () => validate(data)
      );

      expect(result.percentiles.p95).toBeLessThan(
        PERFORMANCE_TARGETS.simple.p95
      );

      // Check regression
      const regression = baselineManager.checkRegression(result);
      if (regression.hasRegression) {
        console.warn(
          `⚠️ Performance regression detected: ${regression.regressionPercentage?.toFixed(1)}%`
        );
      }
    });

    test('Complex object schema validation', async () => {
      const ajv = cacheWarmer.getAjv('draft-07');
      const schema: JSONSchema7 = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', minLength: 1, maxLength: 100 },
          age: { type: 'integer', minimum: 0, maximum: 150 },
          email: { type: 'string', format: 'email' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            minItems: 0,
            maxItems: 10,
          },
        },
        required: ['id', 'name'],
      };

      const validate = ajv.compile(schema);
      const data = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
        tags: ['developer', 'typescript'],
      };

      coverageTracker.trackKeyword('type');
      coverageTracker.trackKeyword('properties');
      coverageTracker.trackKeyword('required');
      coverageTracker.trackKeyword('format');
      coverageTracker.trackKeyword('minLength');
      coverageTracker.trackKeyword('maxLength');
      coverageTracker.trackKeyword('minimum');
      coverageTracker.trackKeyword('maximum');
      coverageTracker.trackKeyword('items');
      coverageTracker.trackKeyword('minItems');
      coverageTracker.trackKeyword('maxItems');
      coverageTracker.trackCombination(['type', 'properties', 'required']);
      coverageTracker.trackCombination(['type', 'format']);
      coverageTracker.trackCombination(['type', 'minLength', 'maxLength']);

      const result = await runAndCollectBenchmark(
        'complex-object-validation',
        () => validate(data)
      );

      expect(result.percentiles.p95).toBeLessThan(
        PERFORMANCE_TARGETS.medium.p95
      );
    });
  });

  describe('Format Validation', () => {
    const formats = ['uuid', 'email', 'date', 'date-time'] as const;

    for (const format of formats) {
      test(`${format} format validation`, async () => {
        const ajv = cacheWarmer.getAjv('draft-07');
        const schema: JSONSchema7 = { type: 'string', format };
        const validate = ajv.compile(schema);

        const testData: Record<typeof format, string> = {
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          email: 'test@example.com',
          date: '2023-01-01',
          'date-time': '2023-01-01T00:00:00Z',
        };

        coverageTracker.trackKeyword('format');
        coverageTracker.trackCombination(['type', 'format']);

        const result = await runAndCollectBenchmark(
          `${format}-format-validation`,
          () => validate(testData[format])
        );

        expect(result.percentiles.p95).toBeLessThan(
          PERFORMANCE_TARGETS.simple.p95
        );
      });
    }
  });
});

// ============================================================================
// INTEGRATION BENCHMARKS - Full Pipelines
// ============================================================================

describe('Integration Benchmarks', () => {
  test('Batch validation - 1000 items', async () => {
    const ajv = cacheWarmer.getAjv('draft-07');
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        value: { type: 'number' },
      },
      required: ['id', 'value'],
    };
    const validate = ajv.compile(schema);

    // Generate 1000 test items
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: `item-${i}`,
      value: Math.random() * 100,
    }));

    const result = await measurement.runBenchmark(
      'batch-validation-1000',
      () => {
        for (const item of items) {
          validate(item);
        }
      }
    );

    expect(result.percentiles.p95).toBeLessThan(
      PERFORMANCE_TARGETS.batch.validation_1000.p95
    );
  });
});

// ============================================================================
// MULTI-DRAFT BENCHMARKS
// ============================================================================

describe('Multi-Draft Performance', () => {
  const drafts: JsonSchemaDraft[] = ['draft-07', '2019-09', '2020-12'];

  for (const draft of drafts) {
    test(`${draft} - Basic validation performance`, async () => {
      const ajv = cacheWarmer.getAjv(draft);
      const schema: JSONSchema7 = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };
      const validate = ajv.compile(schema);
      const data = { name: 'Test', age: 25 };

      coverageTracker.trackEdgeCase(draft, 'basic-object');

      const result = await runAndCollectBenchmark(
        `${draft}-basic-validation`,
        () => validate(data)
      );

      expect(result.percentiles.p95).toBeLessThan(
        PERFORMANCE_TARGETS.simple.p95
      );
    });
  }
});

// ============================================================================
// MEMORY BENCHMARKS
// ============================================================================

describe('Memory Benchmarks', () => {
  test.skip('Large dataset generation - 10,000 records', async () => {
    // This would test memory usage for large dataset generation
    // Skipped for initial implementation
  });
});

// ============================================================================
// EDGE CASE BENCHMARKS
// ============================================================================

describe('Edge Case Performance', () => {
  test('Deeply nested object validation', async () => {
    const ajv = cacheWarmer.getAjv('draft-07');
    const createNestedSchema = (depth: number): JSONSchema7 => {
      if (depth === 0) {
        return { type: 'string' };
      }
      return {
        type: 'object',
        properties: {
          nested: createNestedSchema(depth - 1),
        },
      };
    };

    const schema = createNestedSchema(5);
    const validate = ajv.compile(schema);

    const createNestedData = (depth: number): any => {
      if (depth === 0) {
        return 'value';
      }
      return {
        nested: createNestedData(depth - 1),
      };
    };

    const data = createNestedData(5);

    coverageTracker.trackEdgeCase('draft-07', 'deeply-nested');

    const result = await measurement.runBenchmark(
      'deeply-nested-validation',
      () => validate(data)
    );

    expect(result.percentiles.p95).toBeLessThan(
      PERFORMANCE_TARGETS.complex.p95
    );
  });

  test('Large array validation', async () => {
    const ajv = cacheWarmer.getAjv('draft-07');
    const schema: JSONSchema7 = {
      type: 'array',
      items: { type: 'number', minimum: 0, maximum: 100 },
      minItems: 100,
      maxItems: 100,
    };
    const validate = ajv.compile(schema);
    const data = Array.from({ length: 100 }, () => Math.random() * 100);

    coverageTracker.trackEdgeCase('draft-07', 'large-array');

    const result = await measurement.runBenchmark(
      'large-array-validation',
      () => validate(data)
    );

    expect(result.percentiles.p95).toBeLessThan(PERFORMANCE_TARGETS.medium.p95);
  });
});

// ============================================================================
// EXPORTS
// ============================================================================

export {
  PerformanceMeasurement,
  CacheWarmer,
  SchemaCoverageTracker,
  ExternalBaselineManager as BaselineManager,
  type BenchmarkResult,
};
