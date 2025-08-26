/**
 * UUID Generator Tests
 */

import { describe, it as test, expect } from 'vitest';
import { UUIDGenerator } from '../uuid-generator';
import { isOk } from '../../../types/result';

describe('UUIDGenerator', () => {
  const generator = new UUIDGenerator();

  describe('Basic Functionality', () => {
    test('should have correct name', () => {
      expect(generator.name).toBe('uuid');
    });

    test('should support uuid format', () => {
      expect(generator.supports('uuid')).toBe(true);
    });

    test('should support guid format', () => {
      expect(generator.supports('guid')).toBe(true);
    });

    test('should not support other formats', () => {
      expect(generator.supports('email')).toBe(false);
      expect(generator.supports('date')).toBe(false);
      expect(generator.supports('invalid')).toBe(false);
    });
  });

  describe('Generation', () => {
    test('should generate valid UUIDs', () => {
      const result = generator.generate();
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        expect(typeof result.value).toBe('string');
        expect(result.value).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      }
    });

    test('should generate different UUIDs on successive calls', () => {
      const result1 = generator.generate();
      const result2 = generator.generate();

      expect(isOk(result1)).toBe(true);
      expect(isOk(result2)).toBe(true);

      if (isOk(result1) && isOk(result2)) {
        expect(result1.value).not.toBe(result2.value);
      }
    });

    test('should handle generation options gracefully', () => {
      const result = generator.generate({ locale: 'en', seed: 123 });
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        expect(typeof result.value).toBe('string');
        expect(result.value).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      }
    });
  });

  describe('Validation', () => {
    test('should validate correct UUIDs', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '123e4567-e89b-12d3-a456-426614174000',
      ];

      for (const uuid of validUUIDs) {
        expect(generator.validate(uuid)).toBe(true);
      }
    });

    test('should reject invalid UUIDs', () => {
      const invalidUUIDs = [
        '',
        'not-a-uuid',
        '550e8400-e29b-41d4-a716',
        '550e8400-e29b-41d4-a716-446655440000-extra',
        'gggggggg-e29b-41d4-a716-446655440000',
        '550e8400_e29b_41d4_a716_446655440000',
      ];

      for (const uuid of invalidUUIDs) {
        expect(generator.validate(uuid)).toBe(false);
      }
    });
  });

  describe('Examples', () => {
    test('should provide valid example UUIDs', () => {
      const examples = generator.getExamples();

      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBeGreaterThan(0);

      for (const example of examples) {
        expect(generator.validate(example)).toBe(true);
      }
    });

    test('should provide diverse examples', () => {
      const examples = generator.getExamples();
      const uniqueExamples = new Set(examples);

      expect(uniqueExamples.size).toBe(examples.length);
    });
  });
});
