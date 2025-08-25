/**
 * JSON Schema parser implementation
 * Converts JSON Schema to internal Schema representation
 */

import type { Result } from '../types/result';
import type {
  Schema,
  ObjectSchema,
  ArraySchema,
  StringSchema,
  NumberSchema,
  BooleanSchema,
  NullSchema,
  StringFormat,
} from '../types/schema';
import { ParseError } from '../types/errors';
import { ok, err } from '../types/result';
import type { SchemaParser } from './schema-parser';
import { hasProperty } from './schema-parser';

export class JSONSchemaParser implements SchemaParser {
  supports(input: unknown): boolean {
    // Handle boolean schemas
    if (typeof input === 'boolean') {
      return true;
    }

    // Handle object schemas with indicators
    return (
      hasProperty(input, '$schema') ||
      hasProperty(input, 'type') ||
      hasProperty(input, 'allOf') ||
      hasProperty(input, 'anyOf') ||
      hasProperty(input, 'oneOf') ||
      hasProperty(input, '$ref') ||
      hasProperty(input, 'if')
    );
  }

  parse(input: unknown): Result<Schema, ParseError> {
    if (!this.supports(input)) {
      return err(new ParseError('Input is not a valid JSON Schema'));
    }

    try {
      return this.parseSchema(input as Record<string, unknown> | boolean, '');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown parsing error';
      return err(new ParseError(`Failed to parse JSON Schema: ${message}`));
    }
  }

  private parseSchema(
    schema: Record<string, unknown> | boolean,
    path: string
  ): Result<Schema, ParseError> {
    // Handle boolean schemas (true/false)
    if (typeof schema === 'boolean') {
      return ok(schema);
    }

    // Check for unsupported features first (before checking type)
    const unsupportedCheck = this.checkUnsupportedFeatures(schema, path);
    if (unsupportedCheck.isErr()) {
      return unsupportedCheck;
    }

    // Extract type
    const type = schema.type;
    if (typeof type !== 'string') {
      return err(
        new ParseError(`Missing or invalid type at ${path || 'root'}`)
      );
    }

    return this.parseByType(type, schema, path);
  }

  private parseByType(
    type: string,
    schema: Record<string, unknown>,
    path: string
  ): Result<Schema, ParseError> {
    switch (type) {
      case 'object':
        return this.parseObjectSchema(schema, path);
      case 'array':
        return this.parseArraySchema(schema, path);
      case 'string':
        return this.parseStringSchema(schema, path);
      case 'number':
      case 'integer':
        return this.parseNumberSchema(schema, path);
      case 'boolean':
        return this.parseBooleanSchema(schema, path);
      case 'null':
        return this.parseNullSchema(schema, path);
      default:
        return err(
          new ParseError(
            `Unsupported schema type: ${type} at ${path || 'root'}`
          )
        );
    }
  }

  private parseObjectSchema(
    schema: Record<string, unknown>,
    path: string
  ): Result<ObjectSchema, ParseError> {
    const result: ObjectSchema = {
      type: 'object' as const,
      ...this.parseBaseProperties(schema),
    };

    // Parse properties
    if (schema.properties && typeof schema.properties === 'object') {
      result.properties = {};
      const props = schema.properties as Record<string, unknown>;

      for (const [key, propSchema] of Object.entries(props)) {
        const propResult = this.parseSchema(
          propSchema as Record<string, unknown> | boolean,
          `${path}.properties.${key}`
        );
        if (propResult.isErr()) {
          return propResult;
        }
        result.properties[key] = propResult.value;
      }
    }

    // Parse required array
    if (schema.required) {
      if (Array.isArray(schema.required)) {
        result.required = schema.required.filter((r) => typeof r === 'string');
      }
    }

    // Parse constraints
    if (typeof schema.minProperties === 'number') {
      result.minProperties = schema.minProperties;
    }
    if (typeof schema.maxProperties === 'number') {
      result.maxProperties = schema.maxProperties;
    }
    if (typeof schema.additionalProperties === 'boolean') {
      result.additionalProperties = schema.additionalProperties;
    }

    return ok(result);
  }

  private parseArraySchema(
    schema: Record<string, unknown>,
    path: string
  ): Result<ArraySchema, ParseError> {
    const result: ArraySchema = {
      type: 'array' as const,
      ...this.parseBaseProperties(schema),
    };

    // Parse items
    if (schema.items) {
      const itemsResult = this.parseSchema(
        schema.items as Record<string, unknown> | boolean,
        `${path}.items`
      );
      if (itemsResult.isErr()) {
        return itemsResult;
      }
      result.items = itemsResult.value;
    }

    // Parse constraints
    if (typeof schema.minItems === 'number') {
      result.minItems = schema.minItems;
    }
    if (typeof schema.maxItems === 'number') {
      result.maxItems = schema.maxItems;
    }
    if (typeof schema.uniqueItems === 'boolean') {
      result.uniqueItems = schema.uniqueItems;
    }

    return ok(result);
  }

  private parseStringSchema(
    schema: Record<string, unknown>,
    path: string
  ): Result<StringSchema, ParseError> {
    const result: StringSchema = {
      type: 'string' as const,
      ...this.parseBaseProperties(schema),
    };

    // Parse format
    if (typeof schema.format === 'string') {
      result.format = schema.format as StringFormat;
    }

    // Parse pattern - check for unsupported regex
    if (typeof schema.pattern === 'string') {
      return err(
        new ParseError(
          `Pattern/regex not supported at ${path || 'root'}. Use format constraints instead.`,
          undefined,
          undefined,
          {
            suggestion:
              'Replace pattern with format like "email", "uuid", "date", etc.',
          }
        )
      );
    }

    // Parse constraints
    if (typeof schema.minLength === 'number') {
      result.minLength = schema.minLength;
    }
    if (typeof schema.maxLength === 'number') {
      result.maxLength = schema.maxLength;
    }

    return ok(result);
  }

  private parseNumberSchema(
    schema: Record<string, unknown>,
    _path: string
  ): Result<NumberSchema, ParseError> {
    const result: NumberSchema = {
      type: schema.type as 'number' | 'integer',
      ...this.parseBaseProperties(schema),
    };

    // Parse constraints
    if (typeof schema.minimum === 'number') {
      result.minimum = schema.minimum;
    }
    if (typeof schema.maximum === 'number') {
      result.maximum = schema.maximum;
    }
    if (typeof schema.exclusiveMinimum === 'number') {
      result.exclusiveMinimum = schema.exclusiveMinimum;
    }
    if (typeof schema.exclusiveMaximum === 'number') {
      result.exclusiveMaximum = schema.exclusiveMaximum;
    }
    if (typeof schema.multipleOf === 'number') {
      result.multipleOf = schema.multipleOf;
    }

    return ok(result);
  }

  private parseBooleanSchema(
    schema: Record<string, unknown>,
    _path: string
  ): Result<BooleanSchema, ParseError> {
    const result: BooleanSchema = {
      type: 'boolean' as const,
      ...this.parseBaseProperties(schema),
    };

    return ok(result);
  }

  private parseNullSchema(
    schema: Record<string, unknown>,
    _path: string
  ): Result<NullSchema, ParseError> {
    const result: NullSchema = {
      type: 'null' as const,
      ...this.parseBaseProperties(schema),
    };

    return ok(result);
  }

  private parseBaseProperties(
    schema: Record<string, unknown>
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {};

    if (typeof schema.title === 'string') {
      base.title = schema.title;
    }
    if (typeof schema.description === 'string') {
      base.description = schema.description;
    }
    if (Array.isArray(schema.examples)) {
      base.examples = schema.examples;
    }
    if (schema.default !== undefined) {
      base.default = schema.default;
    }
    if (schema.const !== undefined) {
      base.const = schema.const;
    }
    if (Array.isArray(schema.enum)) {
      base.enum = schema.enum;
    }

    // JSON Schema meta properties
    if (typeof schema.$id === 'string') {
      base.$id = schema.$id;
    }
    if (typeof schema.$schema === 'string') {
      base.$schema = schema.$schema;
    }
    if (typeof schema.$comment === 'string') {
      base.$comment = schema.$comment;
    }

    return base;
  }

  private checkUnsupportedFeatures(
    schema: Record<string, unknown>,
    path: string
  ): Result<void, ParseError> {
    // Check for $ref
    if (schema.$ref) {
      return err(
        new ParseError(
          `JSON Schema $ref not supported at ${path || 'root'}`,
          undefined,
          undefined,
          { suggestion: 'Inline the referenced schema instead of using $ref' }
        )
      );
    }

    // Check for composition keywords
    if (schema.allOf || schema.anyOf || schema.oneOf) {
      return err(
        new ParseError(
          `Composition keywords (allOf, anyOf, oneOf) not supported at ${path || 'root'}`,
          undefined,
          undefined,
          { suggestion: 'Use a single, flat schema structure instead' }
        )
      );
    }

    // Check for conditional schemas
    if (schema.if || schema.then || schema.else) {
      return err(
        new ParseError(
          `Conditional schemas (if/then/else) not supported at ${path || 'root'}`,
          undefined,
          undefined,
          { suggestion: 'Use separate schemas for different conditions' }
        )
      );
    }

    // Check for nested objects (MVP limitation)
    if (schema.type === 'object' && schema.properties) {
      const nestedObjectCheck = this.checkForNestedObjects(schema, path);
      if (nestedObjectCheck.isErr()) {
        return nestedObjectCheck;
      }
    }

    return ok(undefined);
  }

  private checkForNestedObjects(
    schema: Record<string, unknown>,
    path: string
  ): Result<void, ParseError> {
    const props = schema.properties as Record<string, unknown>;
    for (const [key, propSchema] of Object.entries(props)) {
      if (typeof propSchema === 'object' && propSchema !== null) {
        const prop = propSchema as Record<string, unknown>;
        if (prop.type === 'object') {
          return err(
            new ParseError(
              `Nested objects not supported at ${path}.properties.${key}`,
              undefined,
              undefined,
              {
                suggestion:
                  'Flatten the object structure or use separate schemas',
              }
            )
          );
        }
      }
    }
    return ok(undefined);
  }
}
