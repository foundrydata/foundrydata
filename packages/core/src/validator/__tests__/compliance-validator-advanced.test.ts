/**
 * Advanced test suite for ComplianceValidator
 * Tests 100% compliance validation, percentile performance metrics,
 * memory leak detection, and multi-draft validation
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  ComplianceValidator,
  createSecureValidator,
  createFastValidator,
} from '../index';
import {
  createAjv,
  type JsonSchemaDraft,
} from '../../../../../test/helpers/ajv-factory';

/**
 * Calculate percentiles from an array of numbers
 */
function calculatePercentile(values: number[], percentile: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] || 0;
}

/**
 * Memory usage helper
 */
function getMemoryUsage(): number {
  // Check if gc is available (when running with --expose-gc)
  // eslint-disable-next-line no-undef
  if (typeof global !== 'undefined' && global.gc) {
    // eslint-disable-next-line no-undef
    global.gc();
  }
  return process.memoryUsage().heapUsed / 1024 / 1024; // MB
}

describe('ComplianceValidator - Advanced Testing with AJV Oracle', () => {
  let validator: ComplianceValidator;

  beforeEach(() => {
    validator = new ComplianceValidator();
  });

  afterEach(() => {
    validator.clearCache();
  });

  describe('100% Compliance Invariant Testing', () => {
    test('should enforce 100% compliance - never accept >95%', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          age: { type: 'number' as const, minimum: 0 },
        },
        required: ['name', 'age'],
        additionalProperties: false,
      };

      const data = [
        { name: 'John', age: 30 }, // Valid
        { name: 'Jane', age: 25 }, // Valid
        { name: 'Bob', age: -1 }, // Invalid - negative age
      ];

      const result = validator.validate(data, schema);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const report = result.value;
        // Test 100% compliance invariant
        expect(report.compliant).toBe(false); // Not 100%
        expect(report.score).toBe(67); // Exactly 2/3 = 66.67%

        // Never accept "close enough" - must be exactly 100%
        expect(report.compliant).toBe(report.score === 100);
      }
    });

    test('should log complete failure information with seed + schema + errors', () => {
      const seed = 424242; // Fixed seed for deterministic testing
      const schema = {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const, format: 'uuid' },
          email: { type: 'string' as const, format: 'email' },
        },
        required: ['id', 'email'],
      };

      const invalidData = [{ id: 'not-a-uuid', email: 'invalid-email' }];

      const result = validator.validate(invalidData, schema);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const report = result.value;
        expect(report.compliant).toBe(false);

        // Verify complete error logging
        const details = report.details[0];
        expect(details).toBeDefined();
        expect(details!.errors).toHaveLength(2); // Both format errors

        // Check error details include all necessary reproduction info
        details!.errors.forEach((error) => {
          expect(error.path).toBeDefined();
          expect(error.message).toBeDefined();
          expect(error.keyword).toBeDefined();
          expect(error.schemaPath).toBeDefined();
        });

        // Summary should include seed info for reproduction
        console.log(`Validation failed with seed ${seed}, schema:`, schema);
        console.log('Errors:', details!.errors);
      }
    });
  });

  describe('Percentile-Based Performance Testing', () => {
    test('should meet percentile performance targets (p50, p95, p99)', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          id: { type: 'number' as const },
          name: { type: 'string' as const },
        },
        required: ['id', 'name'],
      };

      const validationTimes: number[] = [];
      const iterations = 100;

      // Warmup phase to avoid JIT effects
      for (let i = 0; i < 10; i++) {
        validator.validate([{ id: i, name: `warmup-${i}` }], schema);
      }

      // Actual performance measurements
      for (let i = 0; i < iterations; i++) {
        const data = [{ id: i, name: `test-${i}` }];
        const startTime = Date.now();
        validator.validate(data, schema);
        const endTime = Date.now();
        validationTimes.push(endTime - startTime);
      }

      const p50 = calculatePercentile(validationTimes, 50);
      const p95 = calculatePercentile(validationTimes, 95);
      const p99 = calculatePercentile(validationTimes, 99);

      console.log(
        `Performance percentiles: p50=${p50}ms, p95=${p95}ms, p99=${p99}ms`
      );

      // Platform-aware targets (Windows * 1.5 tolerance)
      const isWindows = process.platform === 'win32';
      const toleranceFactor = isWindows ? 1.5 : 1.0;

      // Targets: p50 < 0.3ms, p95 < 0.5ms, p99 < 2ms
      expect(p50).toBeLessThan(0.3 * toleranceFactor);
      expect(p95).toBeLessThan(0.5 * toleranceFactor);
      expect(p99).toBeLessThan(2 * toleranceFactor);
    });

    test('should handle batch validation performance (p95 < 10ms for 1000 items)', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          id: { type: 'number' as const },
          value: { type: 'string' as const },
        },
        required: ['id', 'value'],
      };

      // Generate 1000 items
      const data = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        value: `value-${i}`,
      }));

      const batchTimes: number[] = [];
      const iterations = 20;

      // Warmup
      validator.validate(data.slice(0, 10), schema);

      // Measure batch performance
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const result = validator.validate(data, schema);
        const endTime = Date.now();

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.compliant).toBe(true);
        }

        batchTimes.push(endTime - startTime);
      }

      const p95 = calculatePercentile(batchTimes, 95);
      console.log(`Batch validation p95: ${p95}ms for 1000 items`);

      // Platform-aware target
      const isWindows = process.platform === 'win32';
      const toleranceFactor = isWindows ? 1.5 : 1.0;
      // CI and sandboxed environments can have additional overhead
      const isCI = process.env.CI === 'true';
      const envFactor = isCI ? 1.25 : 1.0;

      expect(p95).toBeLessThan(10 * toleranceFactor * envFactor);
    });
  });

  describe('Memory Leak Detection and Monitoring', () => {
    test('should not leak memory with validator caching', () => {
      // eslint-disable-next-line no-undef
      if (!global.gc) {
        console.warn('Skipping memory leak test - run with --expose-gc');
        return;
      }

      const initialMemory = getMemoryUsage();
      const iterations = 1000;

      // Create many different schemas and validate
      for (let i = 0; i < iterations; i++) {
        const schema = {
          type: 'object' as const,
          properties: {
            [`field_${i}`]: { type: 'string' as const },
          },
        };

        const data = [{ [`field_${i}`]: `value_${i}` }];
        validator.validate(data, schema);
      }

      const afterIterations = getMemoryUsage();
      const memoryDiff = afterIterations - initialMemory;

      console.log(
        `Memory usage: initial=${initialMemory.toFixed(2)}MB, after=${afterIterations.toFixed(2)}MB, diff=${memoryDiff.toFixed(2)}MB`
      );

      // Max 100MB diff after iterations
      expect(memoryDiff).toBeLessThan(100);
    });

    test('should track cache effectiveness metrics', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
        },
      };

      // First validation - cache miss
      validator.validate([{ name: 'test1' }], schema);

      // Second validation - cache hit
      validator.validate([{ name: 'test2' }], schema);

      // Third validation - cache hit
      validator.validate([{ name: 'test3' }], schema);

      const metrics = validator.getMetrics();

      expect(metrics.compiledSchemas).toBe(1);
      expect(metrics.totalValidations).toBe(3);
      expect(metrics.cacheHits).toBe(2);
      expect(metrics.cacheMisses).toBe(1);
      expect(metrics.cacheHitRate).toBeCloseTo(2 / 3, 2);
      expect(metrics.averageValidationTime).toBeDefined();
    });

    test('should prevent memory bloat with cache size monitoring', () => {
      const schemas = Array.from({ length: 100 }, (_, i) => ({
        type: 'object' as const,
        properties: {
          [`prop${i}`]: { type: 'string' as const },
        },
      }));

      schemas.forEach((schema, i) => {
        validator.validate([{ [`prop${i}`]: 'value' }], schema);
      });

      const metrics = validator.getMetrics();

      // Should have compiled all schemas
      expect(metrics.compiledSchemas).toBe(100);

      // Memory shouldn't explode with reasonable schema count
      // Check if gc is available (when running with --expose-gc)
      // eslint-disable-next-line no-undef
      if (typeof global !== 'undefined' && global.gc) {
        const memoryUsage = getMemoryUsage();
        expect(memoryUsage).toBeLessThan(200); // Max 200MB
      }
    });
  });

  describe('Multi-Draft Validation Matrix Testing', () => {
    const drafts: JsonSchemaDraft[] = ['draft-07', '2019-09', '2020-12'];

    test.each(drafts)(
      'should validate consistently across draft %s',
      (draft) => {
        const ajv = createAjv(draft);
        const schema = {
          type: 'object' as const,
          properties: {
            name: { type: 'string' as const },
            age: { type: 'integer' as const, minimum: 0 },
          },
          required: ['name', 'age'],
        };

        const data = [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ];

        // Validate with draft-specific AJV
        const validate = ajv.compile(schema);
        data.forEach((item) => {
          expect(validate(item)).toBe(true);
        });

        // Also validate with ComplianceValidator
        const result = validator.validate(data, schema);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.compliant).toBe(true);
          expect(result.value.score).toBe(100);
        }
      }
    );

    test('should handle secure format validation (email, uuid)', () => {
      // Note: ComplianceValidator implements secure format validators
      // for email, uri, and ipv4 to prevent ReDoS attacks
      const schema = {
        type: 'object' as const,
        properties: {
          email: { type: 'string' as const, format: 'email' }, // Custom secure validator
          uuid: { type: 'string' as const, format: 'uuid' }, // Standard AJV format
        },
        required: ['email', 'uuid'],
      };

      const testData = [
        {
          email: 'valid@example.com',
          uuid: '550e8400-e29b-41d4-a716-446655440000',
        }, // Both valid
        { email: 'invalid-email', uuid: 'not-a-uuid' }, // Both invalid
      ];

      const result = validator.validate(testData, schema);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const report = result.value;
        expect(report.compliant).toBe(false);
        expect(report.passed).toBe(1); // Only first item passes
        expect(report.failed).toBe(1);

        // Check that both formats are enforced
        const failedItem = report.details[1];
        expect(failedItem!.errors).toHaveLength(2);
        const errorMessages = failedItem!.errors.map((e) => e.message);
        expect(errorMessages.some((msg) => msg.includes('email'))).toBe(true);
        expect(errorMessages.some((msg) => msg.includes('uuid'))).toBe(true);
      }
    });
  });

  describe('WeakMap Caching and Compilation Performance', () => {
    test('should use WeakMap for caching with schema key deduplication', () => {
      // Our implementation uses both WeakMap and a schemaKeyMap for deduplication
      // This test verifies that identical schemas reuse the same validator

      const schema1 = {
        type: 'object' as const,
        properties: {
          test: { type: 'string' as const },
        },
      };

      const schema2 = {
        type: 'object' as const,
        properties: {
          test: { type: 'string' as const },
        },
      };

      // Validate with first schema
      validator.validate([{ test: 'value1' }], schema1);

      const metrics1 = validator.getMetrics();
      expect(metrics1.compiledSchemas).toBe(1);
      expect(metrics1.cacheMisses).toBe(1);

      // Validate with identical schema (different object reference)
      validator.validate([{ test: 'value2' }], schema2);

      const metrics2 = validator.getMetrics();
      expect(metrics2.compiledSchemas).toBe(1); // Same compiled schema (deduplicated by key)
      expect(metrics2.cacheHits).toBeGreaterThan(0); // Cache hit from schemaKeyMap
    });

    test('should efficiently handle concurrent validation with same schema', async () => {
      const schema = {
        type: 'object' as const,
        properties: {
          id: { type: 'number' as const },
        },
      };

      // Simulate concurrent validations
      const promises = Array.from({ length: 10 }, (_, i) =>
        Promise.resolve(validator.validate([{ id: i }], schema))
      );

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.compliant).toBe(true);
        }
      });

      const metrics = validator.getMetrics();
      // Should have high cache hit rate
      expect(metrics.cacheHitRate).toBeGreaterThan(0.8);
    });
  });

  describe('Custom Matchers Integration', () => {
    test('should work with toHaveCompliance matcher', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
        },
        required: ['name'],
      };

      const data = [{ name: 'valid' }, { name: 'also-valid' }];

      const result = validator.validate(data, schema);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // Using the compliance matcher pattern
        expect(result.value.score).toBe(100);
        expect(result.value.compliant).toBe(true);
      }
    });

    test('should provide detailed error aggregation', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          email: { type: 'string' as const, format: 'email' },
          age: { type: 'number' as const, minimum: 0, maximum: 120 },
        },
        required: ['email', 'age'],
      };

      const data = [
        { email: 'invalid', age: -5 }, // Multiple errors
        { email: 'also-invalid', age: 150 }, // Multiple errors
        {}, // Missing required fields
      ];

      const result = validator.validate(data, schema);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const report = result.value;
        expect(report.compliant).toBe(false);
        expect(report.score).toBe(0);

        // Check error aggregation
        expect(report.summary).toBeDefined();
        expect(report.summary!.commonErrors).toBeDefined();
        expect(report.summary!.topIssues).toBeDefined();
        expect(report.summary!.topIssues.length).toBeGreaterThan(0);

        // Should have format errors and required errors in the top issues
        const topIssuesStr = report.summary!.topIssues.join(', ');
        expect(topIssuesStr).toMatch(/format.*\d+ failures?/);

        // The third item has missing required fields
        const thirdItemErrors = report.details[2]!.errors;
        expect(thirdItemErrors.some((e) => e.keyword === 'required')).toBe(
          true
        );
      }
    });
  });
});

describe('Validator Factory Functions - Advanced', () => {
  describe('createSecureValidator with AJV Oracle', () => {
    test('should create validator with maximum security settings', () => {
      const validator = createSecureValidator();

      const schema = {
        type: 'object' as const,
        properties: {
          password: { type: 'string' as const, minLength: 8 },
        },
        required: ['password'],
        additionalProperties: false,
      };

      // Should reject additional properties in strict mode
      const result = validator.validate(
        [{ password: 'secure123', extra: 'not-allowed' }],
        schema
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.compliant).toBe(false);
      }
    });
  });

  describe('createFastValidator with Performance Optimization', () => {
    test('should optimize for speed while maintaining accuracy', () => {
      const validator = createFastValidator();

      const schema = {
        type: 'object' as const,
        properties: {
          value: { type: 'number' as const },
        },
      };

      const largeBatch = Array.from({ length: 10000 }, (_, i) => ({
        value: i,
      }));

      const startTime = Date.now();
      const result = validator.validate(largeBatch, schema);
      const endTime = Date.now();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.compliant).toBe(true);
        expect(result.value.total).toBe(10000);

        // Should be very fast for simple schemas
        const totalTime = endTime - startTime;
        const itemsPerMs = 10000 / totalTime;
        expect(itemsPerMs).toBeGreaterThan(100); // At least 100 items per ms
      }
    });
  });
});
