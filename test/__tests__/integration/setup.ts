import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { propertyTest } from '../../setup';
import type { JSONSchema7 } from 'json-schema';
import type { Result } from '../../../packages/core/src/types/result';
import type { NormalizeResult } from '../../../packages/core/src/transform/schema-normalizer';
import { ParseError } from '../../../packages/core/src/types/errors';

// Re-export common test utilities
export { describe, test, expect, fc, propertyTest };

export function expectParseOk(
  result: Result<NormalizeResult, ParseError>
): NormalizeResult {
  expect(result.isOk()).toBe(true);
  if (!result.isOk()) {
    throw result.error;
  }
  return result.value;
}

// Integration test specific constants
export const INTEGRATION_TEST_SEED = 424242;
export const INTEGRATION_NUM_RUNS = 100;
export const INTEGRATION_TIMEOUT = 30000;

// Performance thresholds for integration tests

// Platform-aware tolerance (keep integration thresholds stable across runners)
const IS_WINDOWS = process.platform === 'win32';
const IS_DARWIN = process.platform === 'darwin';
// Slightly relax local Mac tolerance to reduce flakiness while staying far below SPEC bench gates
const PLATFORM_TOLERANCE_FACTOR = IS_WINDOWS ? 1.5 : IS_DARWIN ? 1.35 : 1.0;

// Read numeric env, else apply platform factor to default
function envNumWithPlatform(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback * PLATFORM_TOLERANCE_FACTOR;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback * PLATFORM_TOLERANCE_FACTOR;
}

export const PERFORMANCE_THRESHOLDS = {
  pipeline: {
    p50: envNumWithPlatform('PIPELINE_P50_MS', 12), // ms
    p95: envNumWithPlatform('PIPELINE_P95_MS', 24), // ms
    p99: envNumWithPlatform('PIPELINE_P99_MS', 60), // ms
  },
  generatorCompliance: {
    // End-to-end generator → AJV validation target for 1000 records
    p50: envNumWithPlatform('GEN_COMPLIANCE_P50_MS', 120), // ms
    p95: envNumWithPlatform('GEN_COMPLIANCE_P95_MS', 210), // ms
    p99: envNumWithPlatform('GEN_COMPLIANCE_P99_MS', 500), // ms
  },
  memory: {
    small: 10 * 1024 * 1024, // 10MB for 100 records
    medium: 50 * 1024 * 1024, // 50MB for 1000 records
    large: 100 * 1024 * 1024, // 100MB for 10000 records
  },
};

// Helper to measure pipeline execution time
export async function measurePipelineTime<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T; time: number }> {
  const start = Date.now();
  const result = await fn();
  const time = Date.now() - start;
  return { result, time };
}

// Helper to measure memory usage
export interface MemoryMeasurement {
  before: number;
  after: number;
  delta: number;
  measure(): MemoryMeasurement;
}

export function measureMemory(): MemoryMeasurement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (g.gc) {
    g.gc(); // Force GC if available
  }

  const before = process.memoryUsage().heapUsed;

  const measurement: MemoryMeasurement = {
    before,
    after: 0,
    delta: 0,
    measure() {
      if (g.gc) {
        g.gc();
      }
      this.after = process.memoryUsage().heapUsed;
      this.delta = this.after - this.before;
      return this;
    },
  };

  return measurement;
}

// Helper for percentile calculations
export function calculatePercentiles(times: number[]): {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
} {
  if (times.length === 0) {
    return {
      p50: 0,
      p95: 0,
      p99: 0,
      min: 0,
      max: 0,
      mean: 0,
    };
  }

  const sorted = [...times].sort((a, b) => a - b);
  const len = sorted.length;

  return {
    p50: sorted[Math.floor(len * 0.5)] ?? 0,
    p95: sorted[Math.floor(len * 0.95)] ?? 0,
    p99: sorted[Math.floor(len * 0.99)] ?? 0,
    min: sorted[0] ?? 0,
    max: sorted[len - 1] ?? 0,
    mean: times.reduce((a, b) => a + b, 0) / len,
  };
}

// Schema fixtures for integration testing
export const INTEGRATION_SCHEMAS = {
  simple: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', minLength: 1, maxLength: 100 },
      age: { type: 'integer', minimum: 0, maximum: 120 },
      active: { type: 'boolean' },
    },
    required: ['id', 'name'],
  } as JSONSchema7,

  // Note: multipleOf is not supported in MVP (v0.1), will be added in v0.2.0
  // Removed: multipleOf: 0.5 from score property
  complex: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', minLength: 2, maxLength: 50 },
      email: { type: 'string', format: 'email' },
      birthDate: { type: 'string', format: 'date' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 10,
      },
      score: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        // multipleOf: 0.5, // Not supported in MVP v0.1
      },
      role: {
        type: 'string',
        enum: ['admin', 'user', 'guest'],
      },
    },
    required: ['id', 'name', 'email'],
    additionalProperties: false,
  } as JSONSchema7,

  nested: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      user: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          age: { type: 'integer' },
        },
        required: ['firstName', 'lastName'],
      },
      metadata: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['id', 'user'],
  } as JSONSchema7,
};

// Business scenarios
export const BUSINESS_SCENARIOS = {
  normal: {
    name: 'normal',
    description: 'Typical business data',
  },
  edge: {
    name: 'edge',
    description: 'Boundary conditions and edge cases',
  },
  stress: {
    name: 'stress',
    description: 'High load and stress conditions',
  },
  error: {
    name: 'error',
    description: 'Error and recovery scenarios',
  },
};

// Draft versions for testing
export const DRAFT_VERSIONS = [
  'draft-07',
  'draft/2019-09',
  'draft/2020-12',
] as const;

export type DraftVersion = (typeof DRAFT_VERSIONS)[number];
