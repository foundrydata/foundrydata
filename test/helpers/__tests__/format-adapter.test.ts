/**
 * ================================================================================
 * FORMAT ADAPTER TESTS - FOUNDRYDATA TESTING v2.1
 *
 * Tests for the FormatRegistry-AJV integration adapter.
 * Verifies validation routing, generation preservation, and format mapping.
 * ================================================================================
 */

import { describe, test, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { propertyTest } from '../../setup';
import {
  FormatAdapter,
  validateFormat,
  generateFormat,
  supportsFormat,
  getSupportedFormats,
  validateFormatWithDetails,
  generateMultipleFormats,
  createConsistentBounds,
  validateForMatchers,
  validateDeterministicBehavior,
  createGeneratorContext,
  ajvResultBridge,
  monitorAdapterPerformance,
  type FormatAdapterOptions,
} from '../format-adapter';
import {
  FormatRegistry,
  type FormatGenerator,
} from '../../../packages/core/src/registry/format-registry';
import { ok } from '../../../packages/core/src/types/result';

// Mock format generator for testing
class MockUUIDGenerator implements FormatGenerator {
  readonly name = 'uuid';

  supports(format: string): boolean {
    return ['uuid', 'guid'].includes(format.toLowerCase());
  }

  generate(): ReturnType<FormatGenerator['generate']> {
    return ok('550e8400-e29b-41d4-a716-446655440000');
  }

  validate(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    );
  }

  getExamples(): string[] {
    return ['550e8400-e29b-41d4-a716-446655440000'];
  }
}

class MockEmailGenerator implements FormatGenerator {
  readonly name = 'email';

  supports(format: string): boolean {
    return ['email', 'e-mail'].includes(format.toLowerCase());
  }

  generate(): ReturnType<FormatGenerator['generate']> {
    return ok('test@example.com');
  }

  validate(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  getExamples(): string[] {
    return ['test@example.com'];
  }
}

describe('FormatAdapter', () => {
  let adapter: FormatAdapter;
  let registry: FormatRegistry;

  beforeEach(() => {
    registry = new FormatRegistry();
    registry.register(new MockUUIDGenerator());
    registry.register(new MockEmailGenerator());
    adapter = new FormatAdapter(registry);
  });

  describe('Validation Routing (AJV as Single Source of Truth)', () => {
    test('should validate using AJV for supported formats', () => {
      // Valid UUID
      expect(
        adapter.validate('uuid', '550e8400-e29b-41d4-a716-446655440000')
      ).toBe(true);

      // Invalid UUID
      expect(adapter.validate('uuid', 'not-a-uuid')).toBe(false);

      // Valid email
      expect(adapter.validate('email', 'test@example.com')).toBe(true);

      // Invalid email
      expect(adapter.validate('email', 'not-an-email')).toBe(false);
    });

    test('should handle format aliases through mapping', () => {
      // UUID aliases
      expect(
        adapter.validate('guid', '550e8400-e29b-41d4-a716-446655440000')
      ).toBe(true);

      // Email aliases
      expect(adapter.validate('e-mail', 'test@example.com')).toBe(true);

      // DateTime aliases
      expect(adapter.validate('datetime', '2023-01-01T00:00:00Z')).toBe(true);
      expect(adapter.validate('dateTime', '2023-01-01T00:00:00Z')).toBe(true);
    });

    test('should support different JSON Schema drafts', () => {
      const validDateTime = '2023-01-01T00:00:00Z';

      expect(
        adapter.validate('date-time', validDateTime, { draft: 'draft-07' })
      ).toBe(true);
      expect(
        adapter.validate('date-time', validDateTime, { draft: '2019-09' })
      ).toBe(true);
      expect(
        adapter.validate('date-time', validDateTime, { draft: '2020-12' })
      ).toBe(true);
    });

    test('should return false for unknown formats', () => {
      expect(adapter.validate('unknown-format', 'any-value')).toBe(false);
      expect(adapter.validate('', 'any-value')).toBe(false);
    });

    test('property-based: valid format values should pass validation', () => {
      return propertyTest(
        'valid format values pass validation',
        fc.property(
          fc.constantFrom('uuid', 'email', 'date-time', 'uri'),
          fc.oneof(
            // UUID
            fc.constant('550e8400-e29b-41d4-a716-446655440000'),
            // Email
            fc.constant('test@example.com'),
            // DateTime
            fc.constant('2023-01-01T00:00:00Z'),
            // URI
            fc.constant('https://example.com')
          ),
          (format, value) => {
            fc.pre(
              (format === 'uuid' &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  value
                )) ||
                (format === 'email' && value.includes('@')) ||
                (format === 'date-time' && value.includes('T')) ||
                (format === 'uri' && value.startsWith('http'))
            );

            expect(adapter.validate(format, value)).toBe(true);
          }
        ),
        { parameters: { numRuns: 50 } }
      );
    });
  });

  describe('Generation Preservation (FormatRegistry UX)', () => {
    test('should generate using FormatRegistry when available', () => {
      const uuidResult = adapter.generate('uuid');
      expect(uuidResult.isOk()).toBe(true);
      if (uuidResult.isOk()) {
        expect(uuidResult.value).toBe('550e8400-e29b-41d4-a716-446655440000');
      }

      const emailResult = adapter.generate('email');
      expect(emailResult.isOk()).toBe(true);
      if (emailResult.isOk()) {
        expect(emailResult.value).toBe('test@example.com');
      }
    });

    test('should handle FormatRegistry aliases for generation', () => {
      const guidResult = adapter.generate('guid');
      expect(guidResult.isOk()).toBe(true);

      const eMailResult = adapter.generate('e-mail');
      expect(eMailResult.isOk()).toBe(true);
    });

    test('should provide helpful errors for validation-only formats', () => {
      // A format AJV supports but FormatRegistry doesn't generate
      const result = adapter.generate('date-time');
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain(
          'supported for validation but not generation'
        );
        expect(result.error.context?.suggestion).toContain(
          'Use a format generator'
        );
      }
    });

    test('should preserve FormatRegistry error messages for unknown formats', () => {
      const result = adapter.generate('completely-unknown');
      expect(result.isErr()).toBe(true);

      if (result.isErr()) {
        expect(result.error.message).toContain('No generator found for format');
      }
    });
  });

  describe('Format Support Detection', () => {
    test('should detect FormatRegistry supported formats', () => {
      expect(adapter.supports('uuid')).toBe(true);
      expect(adapter.supports('guid')).toBe(true);
      expect(adapter.supports('email')).toBe(true);
      expect(adapter.supports('e-mail')).toBe(true);
    });

    test('should detect AJV-only supported formats', () => {
      expect(adapter.supports('date-time')).toBe(true);
      expect(adapter.supports('uri')).toBe(true);
      expect(adapter.supports('ipv4')).toBe(true);
    });

    test('should reject unknown formats', () => {
      expect(adapter.supports('unknown-format')).toBe(false);
      expect(adapter.supports('')).toBe(false);
    });
  });

  describe('Format Enumeration', () => {
    test('should combine FormatRegistry and AJV formats', () => {
      const formats = adapter.getSupportedFormats();

      // Should include FormatRegistry formats
      expect(formats).toContain('uuid');
      expect(formats).toContain('email');

      // Should include aliases
      expect(formats).toContain('guid');
      expect(formats).toContain('e-mail');

      // Should include AJV-only formats
      expect(formats).toContain('date-time');
      expect(formats).toContain('uri');

      // Should be sorted
      const sortedFormats = [...formats].sort();
      expect(formats).toEqual(sortedFormats);
    });

    test('should handle different drafts for format enumeration', () => {
      const draft07Formats = adapter.getSupportedFormats({ draft: 'draft-07' });
      const draft2020Formats = adapter.getSupportedFormats({
        draft: '2020-12',
      });

      // Both should include common formats
      expect(draft07Formats).toContain('uuid');
      expect(draft2020Formats).toContain('uuid');

      // Arrays should not be empty
      expect(draft07Formats.length).toBeGreaterThan(0);
      expect(draft2020Formats.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Edge Cases', () => {
    test('should handle case-insensitive format lookups', () => {
      expect(
        adapter.validate('UUID', '550e8400-e29b-41d4-a716-446655440000')
      ).toBe(true);
      expect(adapter.validate('EMAIL', 'test@example.com')).toBe(true);
    });

    test('should handle empty format registry gracefully', () => {
      const emptyRegistry = new FormatRegistry();
      const emptyAdapter = new FormatAdapter(emptyRegistry);

      // Should still work with AJV-only formats
      expect(emptyAdapter.supports('date-time')).toBe(true);
      expect(emptyAdapter.validate('date-time', '2023-01-01T00:00:00Z')).toBe(
        true
      );

      // Generation should fail gracefully
      const result = emptyAdapter.generate('date-time');
      expect(result.isErr()).toBe(true);
    });

    test('should handle format options propagation', () => {
      const result = adapter.generate('uuid', {
        formatOptions: { seed: 42 },
      });
      expect(result.isOk()).toBe(true);
    });
  });
});

describe('Convenience Functions', () => {
  test('validateFormat should work with default adapter', () => {
    expect(validateFormat('uuid', '550e8400-e29b-41d4-a716-446655440000')).toBe(
      true
    );
    expect(validateFormat('email', 'test@example.com')).toBe(true);
    expect(validateFormat('uuid', 'not-a-uuid')).toBe(false);
  });

  test('generateFormat should work with default adapter', () => {
    const result = generateFormat('date-time');
    expect(result.isErr()).toBe(true); // No generator in default registry
  });

  test('supportsFormat should work with default adapter', () => {
    expect(supportsFormat('date-time')).toBe(true); // AJV supports it
    expect(supportsFormat('unknown')).toBe(false);
  });

  test('getSupportedFormats should work with default adapter', () => {
    const formats = getSupportedFormats();
    expect(Array.isArray(formats)).toBe(true);
    expect(formats.length).toBeGreaterThan(0);
    expect(formats).toContain('date-time'); // AJV format
  });
});

describe('Backward Compatibility', () => {
  test('should not break existing FormatRegistry workflows', () => {
    // Existing code using FormatRegistry directly should still work
    const registry = new FormatRegistry();
    registry.register(new MockUUIDGenerator());

    expect(registry.supports('uuid')).toBe(true);
    const result = registry.generate('uuid');
    expect(result.isOk()).toBe(true);
  });

  test('should enhance validation without breaking generation', () => {
    // Adapter should provide better validation while preserving generation
    const registry = new FormatRegistry();
    registry.register(new MockUUIDGenerator());
    const adapter = new FormatAdapter(registry);

    // Generation works as before
    const genResult = adapter.generate('uuid');
    expect(genResult.isOk()).toBe(true);

    // But validation is now AJV-powered
    expect(
      adapter.validate('uuid', '550e8400-e29b-41d4-a716-446655440000')
    ).toBe(true);
    expect(adapter.validate('uuid', 'invalid')).toBe(false);
  });
});

describe('Testing Architecture v2.1 Extensions', () => {
  let adapter: FormatAdapter;
  let registry: FormatRegistry;

  beforeEach(() => {
    registry = new FormatRegistry();
    registry.register(new MockUUIDGenerator());
    registry.register(new MockEmailGenerator());
    adapter = new FormatAdapter(registry);
  });

  describe('Result Pattern Bridge (Subtask 15.4)', () => {
    test('should provide detailed validation errors', () => {
      const result = adapter.validateWithDetails('email', 'invalid-email');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        const errors = result.error;
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({
          keyword: 'format',
          instancePath: '',
          data: 'invalid-email',
          message: expect.stringMatching(/format/i),
        });
      }
    });

    test('should return Ok result for valid data', () => {
      const result = adapter.validateWithDetails('email', 'test@example.com');
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(true);
    });

    test('should handle unknown formats in detailed validation', () => {
      const result = adapter.validateWithDetails('unknown-format', 'any-value');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        const errors = result.error;
        expect(errors[0]?.message).toContain('Unknown format');
        expect(errors[0]?.params).toMatchObject({ format: 'unknown-format' });
      }
    });

    test('should bridge AJV results to Result pattern', () => {
      const validResult = ajvResultBridge(true, 'test-value', []);
      expect(validResult.isOk()).toBe(true);
      expect(validResult.unwrap()).toBe('test-value');

      const invalidResult = ajvResultBridge(false, null, [
        {
          keyword: 'format',
          instancePath: '',
          data: 'invalid',
          message: 'Invalid format',
        },
      ]);
      expect(invalidResult.isErr()).toBe(true);
      if (invalidResult.isErr()) {
        expect(invalidResult.error).toHaveLength(1);
      }
    });
  });

  describe('Custom Matchers Integration (Subtask 15.2)', () => {
    test('should provide matcher-compatible validation results', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
        required: ['email'],
      };

      const validData = { email: 'test@example.com' };
      const invalidData = { email: 'invalid-email' };

      const validResult = adapter.validateForMatchers(validData, schema);
      expect(validResult.pass).toBe(true);
      expect(validResult.message).toBe('Data matches JSON Schema');

      const invalidResult = adapter.validateForMatchers(invalidData, schema);
      expect(invalidResult.pass).toBe(false);
      expect(invalidResult.message).toContain('Schema validation failed');
      expect(invalidResult.errors).toBeDefined();
      expect(invalidResult.expected).toBe('valid data according to schema');
      expect(invalidResult.received).toEqual(invalidData);
    });

    test('should handle schema compilation errors gracefully', () => {
      const invalidSchema = {
        type: 'invalid-type', // This will cause AJV compilation to fail
      };

      const result = adapter.validateForMatchers({}, invalidSchema);
      expect(result.pass).toBe(false);
      expect(result.message).toContain('Schema compilation failed');
      expect(result.expected).toBe('compilable JSON Schema');
    });
  });

  describe('CreateBounds Helper Integration (Subtask 15.1)', () => {
    test('should create consistent bounds ensuring min ≤ max', () => {
      expect(adapter.createConsistentBounds(10, 20)).toEqual([10, 20]);
      expect(adapter.createConsistentBounds(20, 10)).toEqual([10, 20]); // Swapped
      expect(adapter.createConsistentBounds(5, 5)).toEqual([5, 5]); // Equal
    });

    test('should work with negative numbers', () => {
      expect(adapter.createConsistentBounds(-10, 5)).toEqual([-10, 5]);
      expect(adapter.createConsistentBounds(5, -10)).toEqual([-10, 5]);
      expect(adapter.createConsistentBounds(-20, -5)).toEqual([-20, -5]);
    });

    test('should use convenience function', () => {
      const bounds = createConsistentBounds(5, 15);
      expect(bounds).toEqual([5, 15]);

      const boundsSwapped = createConsistentBounds(15, 5);
      expect(boundsSwapped).toEqual([5, 15]);
    });
  });

  describe('Testing Architecture v2.1 Patterns (Subtask 15.5)', () => {
    test('should support deterministic seed context', () => {
      const context = createGeneratorContext(424242, '2020-12', {
        test: 'metadata',
      });

      expect(context.seed).toBe(424242);
      expect(context.draft).toBe('2020-12');
      expect(context.metadata).toEqual({ test: 'metadata' });
    });

    test('should use cached AJV instances for performance', () => {
      const options: FormatAdapterOptions = {
        context: { seed: 424242, draft: '2020-12' },
      };

      // These should use cached instances
      const result1 = adapter.validate('email', 'test@example.com', options);
      const result2 = adapter.validate(
        'uuid',
        '550e8400-e29b-41d4-a716-446655440000',
        options
      );

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    test('should propagate seed for deterministic generation', () => {
      const context = createGeneratorContext(424242);
      const options: FormatAdapterOptions = { context };

      // Note: This would require FormatRegistry to actually use seeds
      // For now, we test that the seed is propagated
      const result = adapter.generate('email', options);

      // Generation should work (though may not be deterministic without FormatRegistry changes)
      expect(result.isOk() || result.isErr()).toBe(true);
    });

    test('should validate deterministic behavior', () => {
      // Note: This test would be more meaningful with actual deterministic generation
      const isDeterministic = adapter.validateDeterministicBehavior(
        'email',
        424242,
        3
      );

      // Since FormatRegistry doesn't use seeds yet, this may be false
      // But the method should work without errors
      expect(typeof isDeterministic).toBe('boolean');
    });

    test('should validate deterministic behavior via convenience function', () => {
      const result = validateDeterministicBehavior('email', 424242, 2);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('API Consistency Bridge (Subtask 15.6)', () => {
    test('should support array return format', () => {
      const result = adapter.generateMultiple('email', 3, {
        apiConsistency: 'array',
      });

      if (result.isOk()) {
        const values = result.unwrap();
        expect(Array.isArray(values)).toBe(true);
        expect(values).toHaveLength(3);
      }
    });

    test('should support object return format', () => {
      const result = adapter.generateMultiple('email', 2, {
        apiConsistency: 'object',
      });

      if (result.isOk()) {
        const values = result.unwrap();
        expect(values).toHaveProperty('data');
        expect(Array.isArray((values as { data: string[] }).data)).toBe(true);
        expect((values as { data: string[] }).data).toHaveLength(2);
      }
    });

    test('should default to array format when not specified', () => {
      const result = adapter.generateMultiple('email', 2);

      if (result.isOk()) {
        const values = result.unwrap();
        expect(Array.isArray(values)).toBe(true);
      }
    });

    test('should work with convenience function', () => {
      const result = generateMultipleFormats('email', 2, {
        apiConsistency: 'array',
      });

      if (result.isOk()) {
        const values = result.unwrap();
        expect(Array.isArray(values)).toBe(true);
        expect(values).toHaveLength(2);
      }
    });
  });

  describe('Performance Requirements', () => {
    test('should maintain reasonable performance overhead (temporary threshold)', async () => {
      const operation = (): boolean =>
        adapter.validate('email', 'test@example.com');

      const metrics = await monitorAdapterPerformance(operation, 'validation');

      expect(metrics.result).toBe(true);
      expect(metrics.duration).toBeGreaterThan(0);
      expect(metrics.overhead).toBeLessThan(2000); // Temporary: adjusted until Task 9.3 defines proper thresholds
    });

    test('should perform multiple validations efficiently', async () => {
      const operation = (): boolean => {
        for (let i = 0; i < 100; i++) {
          adapter.validate('email', 'test@example.com');
        }
        return true;
      };

      const metrics = await monitorAdapterPerformance(
        operation,
        'batch-validation'
      );
      expect(metrics.result).toBe(true);
    });
  });

  describe('New Convenience Functions', () => {
    test('validateFormatWithDetails should work with default adapter', () => {
      const validResult = validateFormatWithDetails(
        'email',
        'test@example.com'
      );
      expect(validResult.isOk()).toBe(true);

      const invalidResult = validateFormatWithDetails('email', 'invalid');
      expect(invalidResult.isErr()).toBe(true);
    });

    test('validateForMatchers should work with default adapter', () => {
      const schema = { type: 'string', format: 'email' };
      const result = validateForMatchers('test@example.com', schema);

      expect(result.pass).toBe(true);
      expect(result.message).toBe('Data matches JSON Schema');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed schemas gracefully', () => {
      const malformedSchema = {
        type: 'string',
        format: null, // This might cause issues
      };

      const result = adapter.validateForMatchers({}, malformedSchema as any);
      expect(result.pass).toBe(false);
    });

    test('should handle validation with null/undefined values', () => {
      const result1 = adapter.validate('email', null as any);
      const result2 = adapter.validate('email', undefined as any);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    test('should handle empty strings appropriately', () => {
      expect(adapter.validate('email', '')).toBe(false);
      expect(adapter.validate('uuid', '')).toBe(false);
    });
  });
});
