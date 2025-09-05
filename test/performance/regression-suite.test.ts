/**
 * Cumulative Regression Test Suite
 *
 * Captures and permanently stores performance failure cases
 * to prevent regressions from reoccurring.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createAjv, type JsonSchemaDraft } from '../helpers/ajv-factory';
import type { JSONSchema7 } from 'json-schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Regression cases file path */
const REGRESSION_CASES_FILE = path.join(__dirname, 'regression-cases.json');

/** Performance threshold for regression tests */
const REGRESSION_THRESHOLD_MS = 50; // Maximum allowed time for regression tests

/**
 * Regression test case structure
 */
interface RegressionCase {
  id: string;
  description: string;
  schema: JSONSchema7;
  data: unknown;
  draft: JsonSchemaDraft;
  capturedAt: string;
  performanceThreshold: number;
  failureReason: string;
  metadata?: Record<string, unknown>;
}

/**
 * Regression cases collection
 */
interface RegressionCases {
  version: string;
  cases: RegressionCase[];
}

/**
 * Regression test manager
 */
class RegressionTestManager {
  private cases: RegressionCases = { version: '1.0.0', cases: [] };

  /**
   * Load regression cases from file
   */
  async loadCases(): Promise<void> {
    try {
      const content = await fs.readFile(REGRESSION_CASES_FILE, 'utf-8');
      this.cases = JSON.parse(content);
      console.log(`📦 Loaded ${this.cases.cases.length} regression cases`);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.log('📦 No regression cases file found, starting fresh');
        await this.saveCases();
      } else {
        console.error('Failed to load regression cases:', error);
      }
    }
  }

  /**
   * Save regression cases to file
   */
  async saveCases(): Promise<void> {
    await fs.writeFile(
      REGRESSION_CASES_FILE,
      JSON.stringify(this.cases, null, 2)
    );
  }

  /**
   * Add a new regression case
   */
  // eslint-disable-next-line max-params
  async addCase(
    schema: JSONSchema7,
    data: unknown,
    draft: JsonSchemaDraft,
    failureReason: string,
    threshold: number = REGRESSION_THRESHOLD_MS
  ): Promise<void> {
    const caseId = this.generateCaseId(schema, data);

    // Check for duplicates
    if (this.cases.cases.some((c) => c.id === caseId)) {
      console.log(`⚠️ Regression case ${caseId} already exists`);
      return;
    }

    const newCase: RegressionCase = {
      id: caseId,
      description: this.generateDescription(schema, failureReason),
      schema,
      data,
      draft,
      capturedAt: new Date().toISOString(),
      performanceThreshold: threshold,
      failureReason,
    };

    this.cases.cases.push(newCase);
    await this.saveCases();
    console.log(`✅ Added regression case: ${newCase.description}`);
  }

  /**
   * Generate unique case ID
   */
  private generateCaseId(schema: JSONSchema7, data: unknown): string {
    const schemaStr = JSON.stringify(schema);
    const dataStr = JSON.stringify(data);
    const hash = this.simpleHash(schemaStr + dataStr);
    return `regression-${hash}`;
  }

  /**
   * Generate case description
   */
  private generateDescription(schema: JSONSchema7, reason: string): string {
    const schemaType = schema.type || 'unknown';
    const keywords = Object.keys(schema)
      .filter((k) => k !== 'type')
      .join(', ');
    return `${schemaType} schema with ${keywords || 'no constraints'} - ${reason}`;
  }

  /**
   * Simple hash function for ID generation
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  }

  /**
   * Get all cases
   */
  getCases(): RegressionCase[] {
    return this.cases.cases;
  }

  /**
   * Clear old cases (optional maintenance)
   */
  async pruneOldCases(daysOld: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const originalCount = this.cases.cases.length;
    this.cases.cases = this.cases.cases.filter(
      (c) => new Date(c.capturedAt) > cutoffDate
    );

    const prunedCount = originalCount - this.cases.cases.length;
    if (prunedCount > 0) {
      await this.saveCases();
      console.log(`🗑️ Pruned ${prunedCount} old regression cases`);
    }

    return prunedCount;
  }
}

/**
 * Performance failure detector
 */
class PerformanceFailureDetector {
  private ajvInstances: Map<JsonSchemaDraft, any> = new Map();

  constructor() {
    // Initialize AJV instances for each draft
    const drafts: JsonSchemaDraft[] = ['draft-07', '2019-09', '2020-12'];
    for (const draft of drafts) {
      this.ajvInstances.set(draft, createAjv(draft));
    }
  }

  /**
   * Measure validation performance
   */
  measureValidation(
    schema: JSONSchema7,
    data: unknown,
    draft: JsonSchemaDraft = 'draft-07'
  ): { isValid: boolean; duration: number } {
    const ajv = this.ajvInstances.get(draft);
    if (!ajv) {
      throw new Error(`Unsupported draft: ${draft}`);
    }

    const validate = ajv.compile(schema);

    const start = performance.now();
    const isValid = validate(data);
    const end = performance.now();

    return {
      isValid,
      duration: end - start,
    };
  }

  /**
   * Detect performance issues
   */
  detectPerformanceIssue(
    schema: JSONSchema7,
    data: unknown,
    draft: JsonSchemaDraft,
    threshold: number = REGRESSION_THRESHOLD_MS
  ): { hasIssue: boolean; duration: number; reason?: string } {
    const result = this.measureValidation(schema, data, draft);

    if (result.duration > threshold) {
      return {
        hasIssue: true,
        duration: result.duration,
        reason: `Validation took ${result.duration.toFixed(2)}ms, exceeding threshold of ${threshold}ms`,
      };
    }

    return {
      hasIssue: false,
      duration: result.duration,
    };
  }
}

// ============================================================================
// GLOBAL TEST STATE
// ============================================================================

let regressionManager: RegressionTestManager;
let failureDetector: PerformanceFailureDetector;

beforeAll(async () => {
  regressionManager = new RegressionTestManager();
  failureDetector = new PerformanceFailureDetector();
  await regressionManager.loadCases();
});

// ============================================================================
// REGRESSION TESTS
// ============================================================================

describe('Cumulative Regression Suite', () => {
  describe('Existing Regression Cases', () => {
    test('All captured regression cases perform within threshold', async () => {
      const cases = regressionManager.getCases();

      if (cases.length === 0) {
        console.log('📦 No regression cases to test');
        return;
      }

      const failures: string[] = [];

      for (const testCase of cases) {
        const result = failureDetector.measureValidation(
          testCase.schema,
          testCase.data,
          testCase.draft
        );

        if (result.duration > testCase.performanceThreshold) {
          failures.push(
            `Case ${testCase.id}: ${result.duration.toFixed(2)}ms > ${testCase.performanceThreshold}ms`
          );
        }
      }

      if (failures.length > 0) {
        console.error('❌ Regression failures:', failures);
      }

      expect(failures).toHaveLength(0);
    });
  });

  describe('New Performance Issues Detection', () => {
    test('Complex nested schema performance', async () => {
      const schema: JSONSchema7 = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        value: { type: 'number', minimum: 0, maximum: 1000 },
                      },
                      required: ['id', 'value'],
                    },
                    minItems: 10,
                    maxItems: 100,
                  },
                },
                required: ['level3'],
              },
            },
            required: ['level2'],
          },
        },
        required: ['level1'],
      };

      const data = {
        level1: {
          level2: {
            level3: Array.from({ length: 50 }, (_, i) => ({
              id: '123e4567-e89b-12d3-a456-426614174000',
              value: i * 10,
            })),
          },
        },
      };

      const result = failureDetector.detectPerformanceIssue(
        schema,
        data,
        'draft-07',
        20 // 20ms threshold for complex schemas
      );

      if (result.hasIssue) {
        await regressionManager.addCase(
          schema,
          data,
          'draft-07',
          result.reason ?? 'Performance threshold exceeded',
          20
        );
      }

      // We expect complex schemas to be reasonably fast
      expect(result.duration).toBeLessThan(50);
    });

    test('Large array validation performance', async () => {
      const schema: JSONSchema7 = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string', minLength: 1, maxLength: 50 },
            active: { type: 'boolean' },
          },
          required: ['id', 'name'],
        },
        minItems: 1000,
        maxItems: 10000,
      };

      const data = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        active: i % 2 === 0,
      }));

      const result = failureDetector.detectPerformanceIssue(
        schema,
        data,
        'draft-07',
        30 // 30ms threshold for large arrays
      );

      if (result.hasIssue) {
        await regressionManager.addCase(
          schema,
          data,
          'draft-07',
          result.reason ?? 'Large array performance issue',
          30
        );
      }

      // Large arrays should still be performant
      expect(result.duration).toBeLessThan(100);
    });
  });

  describe('Multi-Draft Regression Tests', () => {
    const drafts: JsonSchemaDraft[] = ['draft-07', '2019-09', '2020-12'];

    for (const draft of drafts) {
      test(`${draft} - Format validation performance`, async () => {
        const schema: JSONSchema7 = {
          type: 'object',
          properties: {
            uuid: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            date: { type: 'string', format: 'date' },
            dateTime: { type: 'string', format: 'date-time' },
          },
          required: ['uuid', 'email', 'date', 'dateTime'],
        };

        const data = {
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          email: 'test@example.com',
          date: '2023-01-01',
          dateTime: '2023-01-01T00:00:00Z',
        };

        const result = failureDetector.detectPerformanceIssue(
          schema,
          data,
          draft,
          5 // 5ms threshold for format validation
        );

        if (result.hasIssue) {
          await regressionManager.addCase(
            schema,
            data,
            draft,
            `${draft} format validation performance issue`,
            5
          );
        }

        // Format validation should be fast
        expect(result.duration).toBeLessThan(10);
      });
    }
  });

  describe('Edge Case Regression Tests', () => {
    test('Deeply recursive schema performance', async () => {
      const createRecursiveSchema = (depth: number): JSONSchema7 => {
        if (depth === 0) {
          return { type: 'string' };
        }
        return {
          type: 'object',
          properties: {
            value: { type: 'string' },
            nested: createRecursiveSchema(depth - 1),
          },
        };
      };

      const createRecursiveData = (depth: number): any => {
        if (depth === 0) {
          return 'leaf';
        }
        return {
          value: `level-${depth}`,
          nested: createRecursiveData(depth - 1),
        };
      };

      const schema = createRecursiveSchema(10);
      const data = createRecursiveData(10);

      const result = failureDetector.detectPerformanceIssue(
        schema,
        data,
        'draft-07',
        10 // 10ms threshold for recursive schemas
      );

      if (result.hasIssue) {
        await regressionManager.addCase(
          schema,
          data,
          'draft-07',
          'Deeply recursive schema performance issue',
          10
        );
      }

      // Even deep recursion should be handled efficiently
      expect(result.duration).toBeLessThan(20);
    });

    test('Schema with many constraints performance', async () => {
      const schema: JSONSchema7 = {
        type: 'string',
        minLength: 10,
        maxLength: 100,
        pattern: '^[a-zA-Z0-9]+$',
        // Note: not using actual regex in test to avoid complexity
      };

      const data = 'abcdefghij1234567890';

      const result = failureDetector.detectPerformanceIssue(
        schema,
        data,
        'draft-07',
        2 // 2ms threshold for simple string validation
      );

      if (result.hasIssue) {
        await regressionManager.addCase(
          schema,
          data,
          'draft-07',
          'Multiple string constraints performance issue',
          2
        );
      }

      // String validation with constraints should be very fast
      expect(result.duration).toBeLessThan(5);
    });
  });
});

// ============================================================================
// EXPORTS
// ============================================================================

export {
  RegressionTestManager,
  PerformanceFailureDetector,
  type RegressionCase,
  type RegressionCases,
};
