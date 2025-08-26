import { describe, it, expect, beforeEach } from 'vitest';
/**
 * Tests for SchemaParser interface and ParserRegistry
 */

import { ParserRegistry, hasProperty } from '../schema-parser';
import { JSONSchemaParser } from '../json-schema-parser';
import { ParseError } from '../../types/errors';

describe('ParserRegistry', () => {
  let registry: ParserRegistry;

  beforeEach(() => {
    registry = new ParserRegistry();
  });

  it('should register parsers', () => {
    const parser = new JSONSchemaParser();
    registry.register(parser);
    expect(registry.getRegisteredParsers()).toContain('JSONSchemaParser');
  });

  it('should return error when no parser supports input', () => {
    const result = registry.parse({ notASchema: true });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ParseError);
      expect(result.error.message).toContain('No suitable parser found');
    }
  });

  it('should use appropriate parser when one supports input', () => {
    const parser = new JSONSchemaParser();
    registry.register(parser);

    const schema = { type: 'string' };
    const result = registry.parse(schema);
    expect(result.isOk()).toBe(true);
  });
});

describe('hasProperty utility', () => {
  it('should detect existing properties', () => {
    const obj = { type: 'string', format: 'email' };
    expect(hasProperty(obj, 'type')).toBe(true);
    expect(hasProperty(obj, 'format')).toBe(true);
  });

  it('should return false for missing properties', () => {
    const obj = { type: 'string' };
    expect(hasProperty(obj, 'format')).toBe(false);
  });

  it('should return false for non-objects', () => {
    expect(hasProperty(null, 'type')).toBe(false);
    expect(hasProperty('string', 'type')).toBe(false);
    expect(hasProperty([], 'type')).toBe(false);
  });
});
