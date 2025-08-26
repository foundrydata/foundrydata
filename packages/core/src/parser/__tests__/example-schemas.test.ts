import { describe, it, expect, beforeEach } from 'vitest';
/**
 * Tests with example schemas to verify parser functionality
 */

import { JSONSchemaParser } from '../json-schema-parser';
import type { ObjectSchema, ArraySchema } from '../../types/schema';

describe('Example Schemas', () => {
  let parser: JSONSchemaParser;

  beforeEach(() => {
    parser = new JSONSchemaParser();
  });

  it('should parse quick-test-schema.json', () => {
    // Use inline schema for consistent testing
    const schemaJson = {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string', minLength: 2, maxLength: 30 },
        email: { type: 'string', format: 'email' },
        age: { type: 'integer', minimum: 18, maximum: 65 },
        premium: { type: 'boolean' },
      },
      required: ['id', 'email'],
    };

    const result = parser.parse(schemaJson);
    expect(result.isOk()).toBe(true);

    if (result.isOk()) {
      const schema = result.value as ObjectSchema;
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(Object.keys(schema.properties!)).toEqual([
        'id',
        'name',
        'email',
        'age',
        'premium',
      ]);
      expect(schema.required).toEqual(['id', 'email']);
    }
  });

  it('should parse simple array schema', () => {
    const schemaJson = {
      type: 'array',
      items: {
        type: 'string',
        format: 'email',
      },
      minItems: 1,
      maxItems: 5,
    };

    const result = parser.parse(schemaJson);
    expect(result.isOk()).toBe(true);

    if (result.isOk()) {
      const schema = result.value as ArraySchema;
      expect(schema.type).toBe('array');
      expect(schema.minItems).toBe(1);
      expect(schema.maxItems).toBe(5);
    }
  });

  it('should parse complex user schema', () => {
    const schemaJson = {
      type: 'object',
      properties: {
        userId: { type: 'string', format: 'uuid' },
        profile: {
          type: 'object',
          properties: {
            firstName: { type: 'string', minLength: 1 },
            lastName: { type: 'string', minLength: 1 },
            email: { type: 'string', format: 'email' },
          },
          required: ['email'],
        },
      },
      required: ['userId'],
    };

    const result = parser.parse(schemaJson);
    expect(result.isErr()).toBe(true); // Should fail due to nested objects

    if (result.isErr()) {
      expect(result.error.message).toContain('Nested objects not supported');
    }
  });
});
