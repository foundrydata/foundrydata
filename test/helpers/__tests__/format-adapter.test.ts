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
import {
  FormatAdapter,
  defaultFormatAdapter,
  validateFormat,
  generateFormat,
  supportsFormat,
  getSupportedFormats,
} from '../format-adapter';
import {
  FormatRegistry,
  type FormatGenerator,
} from '../../../packages/core/src/registry/format-registry';
import { ok, err } from '../../../packages/core/src/types/result';
import { GenerationError } from '../../../packages/core/src/types/errors';

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
      fc.assert(
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
        { numRuns: 50 }
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
