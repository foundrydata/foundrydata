/**
 * Comprehensive test suite for ComplianceValidator
 * Tests 100% compliance validation, batch processing, and performance
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  ComplianceValidator,
  createSecureValidator,
  createFastValidator,
} from '../index';

describe('ComplianceValidator', () => {
  let validator: ComplianceValidator;

  beforeEach(() => {
    validator = new ComplianceValidator();
  });

  describe('Basic Validation', () => {
    test('should validate valid data against simple schema', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          age: { type: 'number' as const },
        },
        required: ['name'],
        additionalProperties: false,
      };

      const validData = [{ name: 'John', age: 30 }, { name: 'Jane' }];

      const result = validator.validate(validData, schema);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const report = result.value;
        expect(report.compliant).toBe(true);
        expect(report.score).toBe(100);
        expect(report.passed).toBe(2);
        expect(report.failed).toBe(0);
        expect(report.total).toBe(2);
        expect(report.duration).toBeGreaterThan(0);
      }
    });

    test('should detect invalid data and provide detailed errors', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          age: { type: 'number' as const, minimum: 0 },
        },
        required: ['name'],
        additionalProperties: false,
      };

      const invalidData = [
        { name: 'John', age: 30 }, // Valid
        { age: 25 }, // Missing required 'name'
        { name: 'Jane', age: -5 }, // Invalid age (negative)
        { name: 'Bob', extra: 'not allowed' }, // Additional property
      ];

      const result = validator.validate(invalidData, schema);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const report = result.value;
        expect(report.compliant).toBe(false);
        expect(report.score).toBe(25); // 1/4 valid
        expect(report.passed).toBe(1);
        expect(report.failed).toBe(3);
        expect(report.total).toBe(4);

        // Check that errors are properly categorized
        expect(report.details).toHaveLength(4);
        expect(report.details[0]!.valid).toBe(true);
        expect(report.details[1]!.valid).toBe(false);
        expect(report.details[1]!.errors).toHaveLength(1);
        expect(report.details[1]!.errors[0]!.keyword).toBe('required');

        // Check summary
        expect(report.summary).toBeDefined();
        expect(
          report.summary!.topIssues.some((issue) => issue.includes('required'))
        ).toBe(true);
      }
    });

    test('should handle empty arrays', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
        },
      };

      const result = validator.validate([], schema);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const report = result.value;
        expect(report.compliant).toBe(true);
        expect(report.score).toBe(100);
        expect(report.total).toBe(0);
      }
    });
  });

  describe('Format Validation', () => {
    test('should validate email format', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          email: { type: 'string' as const, format: 'email' },
        },
        required: ['email'],
      };

      const testData = [
        { email: 'valid@example.com' }, // Valid
        { email: 'also.valid+tag@domain.co.uk' }, // Valid with tags
        { email: 'invalid-email' }, // Invalid
        { email: '@invalid.com' }, // Invalid - no local part
        { email: 'toolong' + 'x'.repeat(300) + '@example.com' }, // Invalid - too long
      ];

      const result = validator.validate(testData, schema);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const report = result.value;
        expect(report.passed).toBe(2); // Only first two are valid
        expect(report.failed).toBe(3);

        // Check format errors
        const formatErrors = report.details
          .filter((d) => !d.valid)
          .flatMap((d) => d.errors)
          .filter((e) => e.keyword === 'format');
        expect(formatErrors.length).toBeGreaterThan(0);
      }
    });

    test('should validate UUID format', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const, format: 'uuid' },
        },
        required: ['id'],
      };

      const testData = [
        { id: '550e8400-e29b-41d4-a716-446655440000' }, // Valid UUID
        { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' }, // Valid UUID
        { id: 'not-a-uuid' }, // Invalid
        { id: '550e8400-e29b-41d4-a716' }, // Incomplete UUID
      ];

      const result = validator.validate(testData, schema);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const report = result.value;
        expect(report.passed).toBe(2);
        expect(report.failed).toBe(2);
      }
    });

    test('should validate date-time format', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          timestamp: { type: 'string' as const, format: 'date-time' },
        },
        required: ['timestamp'],
      };

      const testData = [
        { timestamp: '2023-12-01T10:30:00Z' }, // Valid ISO 8601
        { timestamp: '2023-12-01T10:30:00.123Z' }, // Valid with milliseconds
        { timestamp: '2023-12-01' }, // Invalid - date only
        { timestamp: 'not-a-date' }, // Invalid
      ];

      const result = validator.validate(testData, schema);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const report = result.value;
        expect(report.passed).toBe(2);
        expect(report.failed).toBe(2);
      }
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large datasets efficiently', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          id: { type: 'number' as const },
          name: { type: 'string' as const },
        },
        required: ['id', 'name'],
      };

      // Generate large dataset
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
      }));

      const startTime = Date.now();
      const result = validator.validate(largeDataset, schema);
      const endTime = Date.now();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const report = result.value;
        expect(report.compliant).toBe(true);
        expect(report.total).toBe(1000);
        expect(report.duration).toBeLessThan(100); // Should validate 1000 items in <100ms

        // Performance should be reasonable
        const itemsPerMs = report.total / (endTime - startTime);
        expect(itemsPerMs).toBeGreaterThan(50); // At least 50 items per ms
      }
    });

    test('should cache compiled validators', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
        },
      };

      const data1 = [{ name: 'Test1' }];
      const data2 = [{ name: 'Test2' }];

      // First validation compiles schema
      const result1 = validator.validate(data1, schema);
      expect(result1.isOk()).toBe(true);

      // Second validation should use cached validator
      const startTime = Date.now();
      const result2 = validator.validate(data2, schema);
      const endTime = Date.now();

      expect(result2.isOk()).toBe(true);
      // Cached validation should be very fast
      expect(endTime - startTime).toBeLessThan(10);

      const metrics = validator.getMetrics();
      expect(metrics.compiledSchemas).toBeGreaterThan(0);
    });

    test('should clear cache when requested', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
        },
      };

      validator.validate([{ name: 'test' }], schema);
      expect(validator.getMetrics().compiledSchemas).toBeGreaterThan(0);

      validator.clearCache();
      expect(validator.getMetrics().compiledSchemas).toBe(0);
    });
  });

  describe('Single Item Validation', () => {
    test('should validate single items', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
        },
        required: ['name'],
      };

      const validItem = { name: 'Valid' };
      const invalidItem = { age: 25 }; // Missing required 'name'

      const validResult = validator.validateSingle(validItem, schema);
      expect(validResult.isOk()).toBe(true);
      if (validResult.isOk()) {
        expect(validResult.value.valid).toBe(true);
      }

      const invalidResult = validator.validateSingle(invalidItem, schema);
      expect(invalidResult.isOk()).toBe(true);
      if (invalidResult.isOk()) {
        expect(invalidResult.value.valid).toBe(false);
        expect(invalidResult.value.errors).toHaveLength(1);
      }
    });
  });

  describe('Compliance Check', () => {
    test('should perform fast compliance check', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
        },
        required: ['name'],
      };

      const validData = [{ name: 'Test1' }, { name: 'Test2' }];
      const invalidData = [{ name: 'Test1' }, { age: 25 }];

      const validResult = validator.isCompliant(validData, schema);
      expect(validResult.isOk()).toBe(true);
      if (validResult.isOk()) {
        expect(validResult.value).toBe(true);
      }

      const invalidResult = validator.isCompliant(invalidData, schema);
      expect(invalidResult.isOk()).toBe(true);
      if (invalidResult.isOk()) {
        expect(invalidResult.value).toBe(false);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid schemas gracefully', () => {
      const invalidSchema = {
        type: 'invalid-type' as any,
      };

      const data = [{ test: 'value' }];
      const result = validator.validate(data, invalidSchema);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('AJV validation failed');
      }
    });

    test('should handle malformed data gracefully', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
        },
      };

      // Test with various problematic data
      const problematicData = [null, undefined, 'not an object', 42, []];

      for (const badData of problematicData) {
        const result = validator.validate([badData], schema);
        expect(result.isOk()).toBe(true); // Should not throw
        if (result.isOk()) {
          expect(result.value.compliant).toBe(false);
        }
      }
    });
  });
});

describe('Validator Factory Functions', () => {
  describe('createSecureValidator', () => {
    test('should create validator with secure settings', () => {
      const validator = createSecureValidator();
      expect(validator).toBeInstanceOf(ComplianceValidator);

      const schema = {
        type: 'object' as const,
        properties: {
          email: { type: 'string' as const, format: 'email' },
        },
        required: ['email'],
      };

      const result = validator.validate(
        [{ email: 'test@example.com' }],
        schema
      );
      expect(result.isOk()).toBe(true);
    });

    test('should accept custom options', () => {
      const validator = createSecureValidator({ maxErrors: 5 });
      expect(validator).toBeInstanceOf(ComplianceValidator);
    });
  });

  describe('createFastValidator', () => {
    test('should create validator optimized for performance', () => {
      const validator = createFastValidator();
      expect(validator).toBeInstanceOf(ComplianceValidator);

      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
        },
      };

      const result = validator.validate([{ name: 'test' }], schema);
      expect(result.isOk()).toBe(true);
    });
  });
});

describe('Complex Schema Validation', () => {
  let validator: ComplianceValidator;

  beforeEach(() => {
    validator = new ComplianceValidator();
  });

  test('should validate nested objects', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        user: {
          type: 'object' as const,
          properties: {
            name: { type: 'string' as const },
            profile: {
              type: 'object' as const,
              properties: {
                age: { type: 'number' as const, minimum: 0 },
                email: { type: 'string' as const, format: 'email' },
              },
              required: ['age'],
            },
          },
          required: ['name', 'profile'],
        },
      },
      required: ['user'],
    };

    const validData = [
      {
        user: {
          name: 'John',
          profile: {
            age: 30,
            email: 'john@example.com',
          },
        },
      },
    ];

    const invalidData = [
      {
        user: {
          name: 'Jane',
          profile: {
            age: -5, // Invalid
            email: 'not-an-email', // Invalid format
          },
        },
      },
    ];

    const validResult = validator.validate(validData, schema);
    expect(validResult.isOk()).toBe(true);
    if (validResult.isOk()) {
      expect(validResult.value.compliant).toBe(true);
    }

    const invalidResult = validator.validate(invalidData, schema);
    expect(invalidResult.isOk()).toBe(true);
    if (invalidResult.isOk()) {
      expect(invalidResult.value.compliant).toBe(false);
      expect(invalidResult.value.details[0]!.errors.length).toBeGreaterThan(0);
    }
  });

  test('should validate arrays with item constraints', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        tags: {
          type: 'array' as const,
          items: { type: 'string' as const },
          minItems: 1,
          maxItems: 5,
          uniqueItems: true,
        },
      },
      required: ['tags'],
    };

    const testData = [
      { tags: ['tag1', 'tag2', 'tag3'] }, // Valid
      { tags: [] }, // Invalid - too few items
      { tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6'] }, // Invalid - too many
      { tags: ['tag1', 'tag1'] }, // Invalid - not unique
      { tags: ['tag1', 123, 'tag3'] }, // Invalid - wrong type
    ];

    const result = validator.validate(testData, schema);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const report = result.value;
      expect(report.passed).toBe(1); // Only first item is valid
      expect(report.failed).toBe(4);
    }
  });

  test('should validate conditional schemas with if/then/else', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        type: { type: 'string' as const, enum: ['person', 'company'] },
        name: { type: 'string' as const },
        age: { type: 'number' as const },
        employeeCount: { type: 'number' as const },
      },
      required: ['type', 'name'],
      if: { properties: { type: { const: 'person' } } },
      then: { required: ['age'] },
      else: { required: ['employeeCount'] },
    };

    const testData = [
      { type: 'person', name: 'John', age: 30 }, // Valid person
      { type: 'company', name: 'Acme Inc', employeeCount: 100 }, // Valid company
      { type: 'person', name: 'Jane' }, // Invalid - missing age
      { type: 'company', name: 'Corp' }, // Invalid - missing employeeCount
    ];

    const result = validator.validate(testData, schema);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const report = result.value;
      expect(report.passed).toBe(2);
      expect(report.failed).toBe(2);
    }
  });
});

describe('Edge Cases and Boundary Conditions', () => {
  let validator: ComplianceValidator;

  beforeEach(() => {
    validator = new ComplianceValidator();
  });

  test('should handle very large numbers', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        largeNumber: { type: 'number' as const },
      },
    };

    const testData = [
      { largeNumber: Number.MAX_SAFE_INTEGER },
      { largeNumber: Number.MIN_SAFE_INTEGER },
      { largeNumber: Number.MAX_VALUE },
      { largeNumber: Infinity }, // Should be handled by AJV
      { largeNumber: -Infinity },
    ];

    const result = validator.validate(testData, schema);
    expect(result.isOk()).toBe(true);
  });

  test('should handle unicode strings', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        text: { type: 'string' as const, minLength: 1 },
      },
    };

    const testData = [
      { text: '普通话' }, // Chinese
      { text: 'العربية' }, // Arabic
      { text: '🚀🎉✨' }, // Emojis
      { text: '\u0000\u001F' }, // Control characters
    ];

    const result = validator.validate(testData, schema);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.passed).toBeGreaterThan(0);
    }
  });

  test('should handle deeply nested objects', () => {
    const createNestedSchema = (depth: number): any => {
      if (depth === 0) {
        return { type: 'string' as const };
      }
      return {
        type: 'object' as const,
        properties: {
          nested: createNestedSchema(depth - 1),
        },
        required: ['nested'],
      };
    };

    const createNestedData = (depth: number, value: string): any => {
      if (depth === 0) return value;
      return { nested: createNestedData(depth - 1, value) };
    };

    const schema = createNestedSchema(10); // 10 levels deep
    const data = [createNestedData(10, 'deep value')];

    const result = validator.validate(data, schema);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.compliant).toBe(true);
    }
  });
});
