/**
 * Format Registry Tests
 * Test the format registry system and built-in format generators
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { FormatRegistry } from '../format-registry';
import {
  UUIDGenerator,
  EmailGenerator,
  DateGenerator,
  DateTimeGenerator,
} from '../../generator/formats/index';
import { GenerationError } from '../../types/errors';
import { isOk, isErr } from '../../types/result';

describe('FormatRegistry', () => {
  let registry: FormatRegistry;

  beforeEach(() => {
    registry = new FormatRegistry();
  });

  describe('Basic Registry Operations', () => {
    test('should register and retrieve format generators', () => {
      const uuidGenerator = new UUIDGenerator();
      registry.register(uuidGenerator);

      const retrieved = registry.get('uuid');
      expect(retrieved).toBe(uuidGenerator);
    });

    test('should return null for unregistered formats', () => {
      const retrieved = registry.get('nonexistent');
      expect(retrieved).toBeNull();
    });

    test('should support pattern matching', () => {
      const uuidGenerator = new UUIDGenerator();
      registry.register(uuidGenerator);

      // Should find UUID generator for 'guid' format too
      const retrieved = registry.get('guid');
      expect(retrieved).toBe(uuidGenerator);
    });

    test('should check format support', () => {
      const uuidGenerator = new UUIDGenerator();
      registry.register(uuidGenerator);

      expect(registry.supports('uuid')).toBe(true);
      expect(registry.supports('guid')).toBe(true);
      expect(registry.supports('nonexistent')).toBe(false);
    });

    test('should return registered format names including aliases', () => {
      const uuidGenerator = new UUIDGenerator();
      const emailGenerator = new EmailGenerator();

      registry.register(uuidGenerator);
      registry.register(emailGenerator);

      const formats = registry.getRegisteredFormats();
      expect(formats).toEqual(['e-mail', 'email', 'guid', 'uuid']);
    });

    test('should generate values through registry', () => {
      const uuidGenerator = new UUIDGenerator();
      registry.register(uuidGenerator);

      const result = registry.generate('uuid');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        expect(typeof result.value).toBe('string');
        expect(result.value).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      }
    });

    test('should return error for unsupported format generation', () => {
      const result = registry.generate('nonexistent');
      expect(isErr(result)).toBe(true);

      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(GenerationError);
        expect(result.error.message).toContain(
          'No generator found for format: "nonexistent"'
        );
      }
    });

    test('should validate values through registry', () => {
      const uuidGenerator = new UUIDGenerator();
      registry.register(uuidGenerator);

      expect(
        registry.validate('uuid', '550e8400-e29b-41d4-a716-446655440000')
      ).toBe(true);
      expect(registry.validate('uuid', 'invalid-uuid')).toBe(false);
      expect(registry.validate('nonexistent', 'any-value')).toBe(false);
    });

    test('should clear all formats', () => {
      const uuidGenerator = new UUIDGenerator();
      registry.register(uuidGenerator);

      expect(registry.supports('uuid')).toBe(true);
      registry.clear();
      expect(registry.supports('uuid')).toBe(false);
    });
  });

  describe('Built-in Format Generators', () => {
    beforeEach(() => {
      // Register all built-in formats for testing
      registry.register(new UUIDGenerator());
      registry.register(new EmailGenerator());
      registry.register(new DateGenerator());
      registry.register(new DateTimeGenerator());
    });

    test('should support all built-in formats', () => {
      expect(registry.supports('uuid')).toBe(true);
      expect(registry.supports('guid')).toBe(true);
      expect(registry.supports('email')).toBe(true);
      expect(registry.supports('date')).toBe(true);
      expect(registry.supports('date-time')).toBe(true);
      expect(registry.supports('datetime')).toBe(true);
    });

    test('should generate valid UUIDs', () => {
      const result = registry.generate('uuid');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        expect(registry.validate('uuid', result.value)).toBe(true);
      }
    });

    test('should generate valid emails', () => {
      const result = registry.generate('email');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        expect(registry.validate('email', result.value)).toBe(true);
        expect(result.value).toContain('@');
        expect(result.value).toContain('.');
      }
    });

    test('should generate valid dates', () => {
      const result = registry.generate('date');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        expect(registry.validate('date', result.value)).toBe(true);
        expect(result.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    test('should generate valid date-times', () => {
      const result = registry.generate('date-time');
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        expect(registry.validate('date-time', result.value)).toBe(true);
        expect(result.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      }
    });

    test('should generate deterministic values with seed', () => {
      const result1 = registry.generate('email', { seed: 12345 });
      const result2 = registry.generate('email', { seed: 12345 });

      expect(isOk(result1)).toBe(true);
      expect(isOk(result2)).toBe(true);

      if (isOk(result1) && isOk(result2)) {
        expect(result1.value).toBe(result2.value);
      }
    });
  });

  describe('Enhanced Error Messages and Suggestions', () => {
    beforeEach(() => {
      registry.register(new UUIDGenerator());
      registry.register(new EmailGenerator());
    });

    test('should suggest similar format for typos', () => {
      const result = registry.generate('uuuid'); // typo in uuid
      expect(isErr(result)).toBe(true);

      if (isErr(result)) {
        expect(result.error.message).toContain(
          'No generator found for format: "uuuid"'
        );
        expect(result.error.suggestion).toBe('Did you mean "uuid"?');
      }
    });

    test('should suggest partial matches', () => {
      const result = registry.generate('mail'); // partial match for email
      expect(isErr(result)).toBe(true);

      if (isErr(result)) {
        expect(result.error.message).toContain(
          'No generator found for format: "mail"'
        );
        expect(result.error.suggestion).toBe('Did you mean "e-mail"?'); // Returns alias first
      }
    });

    test('should provide available formats in error context', () => {
      const result = registry.generate('nonexistent');
      expect(isErr(result)).toBe(true);

      if (isErr(result)) {
        expect(result.error.context?.available).toBeDefined();
        expect(Array.isArray(result.error.context?.available)).toBe(true);
      }
    });
  });

  describe('Case-insensitive Format Matching', () => {
    beforeEach(() => {
      registry.register(new UUIDGenerator());
      registry.register(new EmailGenerator());
    });

    test('should match formats case-insensitively', () => {
      expect(registry.get('UUID')).toBe(registry.get('uuid'));
      expect(registry.get('Email')).toBe(registry.get('email'));
      expect(registry.get('GUID')).toBe(registry.get('guid'));
    });

    test('should generate values with case-insensitive format names', () => {
      const result1 = registry.generate('UUID');
      const result2 = registry.generate('uuid');

      expect(isOk(result1)).toBe(true);
      expect(isOk(result2)).toBe(true);

      if (isOk(result1) && isOk(result2)) {
        expect(registry.validate('uuid', result1.value)).toBe(true);
        expect(registry.validate('uuid', result2.value)).toBe(true);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle multiple registrations of same format', () => {
      const generator1 = new UUIDGenerator();
      const generator2 = new UUIDGenerator();

      registry.register(generator1);
      registry.register(generator2);

      // Second registration should overwrite the first
      const retrieved = registry.get('uuid');
      expect(retrieved).toBe(generator2);
    });

    test('should handle empty format names gracefully', () => {
      expect(registry.supports('')).toBe(false);
      expect(registry.get('')).toBeNull();
    });

    test('should handle whitespace in format names', () => {
      expect(registry.supports(' uuid ')).toBe(false);
      expect(registry.get(' uuid ')).toBeNull();
    });
  });
});
