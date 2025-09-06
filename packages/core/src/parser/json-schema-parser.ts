/**
 * JSON Schema parser implementation
 * Converts JSON Schema to internal Schema representation
 *
 * Enhanced with comprehensive feature detection following
 * the "Fail Fast with Context" architecture principle
 */

/* eslint-disable max-lines */

import type { Result } from '../types/result';
import type {
  Schema,
  ObjectSchema,
  ArraySchema,
  StringSchema,
  NumberSchema,
  IntegerSchema,
  BooleanSchema,
  NullSchema,
  StringFormat,
} from '../types/schema';
import { ParseError } from '../types/errors';
import { ErrorCode } from '../errors/codes';
import { ok, err } from '../types/result';
import type { SchemaParser } from './schema-parser';

export class JSONSchemaParser implements SchemaParser {
  // Features we explicitly support
  private static readonly SUPPORTED_TYPES = new Set([
    'object',
    'array',
    'string',
    'number',
    'integer',
    'boolean',
    'null',
  ]);

  // Features we plan to support (with helpful messages)
  private static readonly PLANNED_FEATURES = {
    $ref: 'Reference resolution will be supported in v0.2.0',
    allOf: 'Schema composition will be supported in v0.3.0',
    anyOf: 'Schema composition will be supported in v0.3.0',
    oneOf: 'Schema composition will be supported in v0.3.0',
    not: 'Negation will be supported in v0.4.0',
    if: 'Conditional schemas will be supported in v0.4.0',
    then: 'Conditional schemas will be supported in v0.4.0',
    else: 'Conditional schemas will be supported in v0.4.0',
    dependencies: 'Dependencies will be supported in v0.3.0',
    additionalItems: 'Additional items will be supported in v0.2.0',
    contains: 'Contains validation will be supported in v0.3.0',
    const: 'Const values are supported - please report if not working',
    multipleOf: 'MultipleOf constraint will be supported in v0.2.0',
  } as const;

  supports(input: unknown): boolean {
    // Handle boolean schemas
    if (typeof input === 'boolean') {
      return true;
    }

    if (typeof input !== 'object' || input === null) {
      return false;
    }

    const obj = input as Record<string, unknown>;

    // Check for JSON Schema indicators
    return Boolean(
      obj.$schema ||
        obj.type ||
        obj.properties ||
        obj.items ||
        obj.$ref ||
        obj.allOf ||
        obj.anyOf ||
        obj.oneOf ||
        obj.if ||
        obj.then ||
        obj.else
    );
  }

  parse(input: unknown): Result<Schema, ParseError> {
    if (!this.supports(input)) {
      return err(
        new ParseError({
          message: 'Input is not a valid JSON Schema',
          errorCode: ErrorCode.SCHEMA_PARSE_FAILED,
          context: { schemaPath: '#' },
        })
      );
    }

    try {
      // Early feature detection before deep parsing
      const featureCheck = this.detectUnsupportedFeatures(input);
      if (featureCheck.isErr()) {
        return featureCheck;
      }

      return this.parseSchema(input as Record<string, unknown> | boolean, '');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown parsing error';
      return err(
        new ParseError({
          message: `Failed to parse JSON Schema: ${message}`,
          errorCode: ErrorCode.SCHEMA_PARSE_FAILED,
          context: { schemaPath: '#' },
        })
      );
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

    // Extract and validate type
    const typeResult = this.extractType(schema, path);
    if (typeResult.isErr()) {
      return typeResult;
    }

    return this.parseByType(typeResult.value, schema, path);
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
          new ParseError({
            message: `Unknown type: ${type} at ${path || 'root'}`,
            errorCode: ErrorCode.INVALID_SCHEMA_STRUCTURE,
            context: {
              schemaPath: this.toSchemaPointer(path),
              suggestion: `Supported types: ${Array.from(JSONSchemaParser.SUPPORTED_TYPES).join(', ')}`,
            },
          })
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
        new ParseError({
          message: `Pattern/regex not supported at ${path || 'root'}. Use format constraints instead.`,
          errorCode: ErrorCode.REGEX_PATTERNS_NOT_SUPPORTED,
          context: {
            schemaPath: this.toSchemaPointer(
              path ? `${path}.pattern` : 'pattern'
            ),
            suggestion:
              'Replace pattern with format like "email", "uuid", "date", etc.',
          },
        })
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
  ): Result<NumberSchema | IntegerSchema, ParseError> {
    const schemaType = schema.type as 'number' | 'integer';
    const result: NumberSchema | IntegerSchema = {
      type: schemaType,
      ...this.parseBaseProperties(schema),
    } as NumberSchema | IntegerSchema;

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

  /**
   * Extract and validate type from schema
   */
  private extractType(
    schema: Record<string, unknown>,
    path: string
  ): Result<string, ParseError> {
    // Type can be explicitly defined or inferred
    if ('type' in schema) {
      const type = schema.type;
      if (typeof type !== 'string') {
        return err(
          new ParseError({
            message: `Invalid type at ${path || 'root'}`,
            errorCode: ErrorCode.INVALID_SCHEMA_STRUCTURE,
            context: {
              schemaPath: this.toSchemaPointer(path),
              suggestion: `Type must be a string, found: ${typeof type}`,
            },
          })
        );
      }
      return ok(type);
    }

    // Try to infer type from structure
    if ('properties' in schema || 'required' in schema) {
      return ok('object');
    }

    if ('items' in schema) {
      return ok('array');
    }

    // For schemas with only constraints, default to the most permissive type
    if ('enum' in schema && Array.isArray(schema.enum)) {
      // Infer type from enum values
      const types = new Set(schema.enum.map((v) => typeof v));
      if (types.size === 1) {
        const inferredType = Array.from(types)[0];
        return ok(inferredType === 'object' ? 'object' : 'string');
      }
    }

    return err(
      new ParseError({
        message: `Cannot determine type at ${path || 'root'}`,
        errorCode: ErrorCode.SCHEMA_PARSE_FAILED,
        context: {
          schemaPath: this.toSchemaPointer(path),
          suggestion:
            'Schema must have a "type" property or be inferrable from structure',
        },
      })
    );
  }

  /**
   * Detect unsupported features early with helpful messages
   */
  private detectUnsupportedFeatures(
    input: unknown,
    visited = new Set<unknown>()
  ): Result<void, ParseError> {
    // Prevent circular reference infinite loops
    if (visited.has(input)) return ok(undefined);
    visited.add(input);

    if (typeof input !== 'object' || input === null) {
      return ok(undefined);
    }

    const schema = input as Record<string, unknown>;

    // Run individual feature checks
    const featureCheck = this.checkPlannedFeatures(schema);
    if (featureCheck.isErr()) return featureCheck;

    const typeCheck = this.checkTypeSupport(schema);
    if (typeCheck.isErr()) return typeCheck;

    const arrayCheck = this.checkArrayFeatures(schema);
    if (arrayCheck.isErr()) return arrayCheck;

    const objectCheck = this.checkObjectFeatures(schema);
    if (objectCheck.isErr()) return objectCheck;

    // Recursively check nested schemas
    return this.checkNestedSchemas(schema, visited);
  }

  /**
   * Check for planned but unsupported features
   */
  private checkPlannedFeatures(
    schema: Record<string, unknown>
  ): Result<void, ParseError> {
    for (const [feature, message] of Object.entries(
      JSONSchemaParser.PLANNED_FEATURES
    )) {
      if (feature in schema && feature !== 'const') {
        // const is actually supported
        const code =
          feature === 'allOf' || feature === 'anyOf' || feature === 'oneOf'
            ? ErrorCode.SCHEMA_COMPOSITION_NOT_SUPPORTED
            : ErrorCode.INVALID_SCHEMA_STRUCTURE;
        return err(
          new ParseError({
            message: `Unsupported feature: "${feature}"`,
            errorCode: code,
            context: {
              suggestion: `${message}. Consider removing "${feature}" or wait for the update`,
            },
          })
        );
      }
    }
    return ok(undefined);
  }

  /**
   * Check if type is supported
   */
  private checkTypeSupport(
    schema: Record<string, unknown>
  ): Result<void, ParseError> {
    if (schema.type && typeof schema.type === 'string') {
      if (!JSONSchemaParser.SUPPORTED_TYPES.has(schema.type)) {
        return err(
          new ParseError({
            message: `Unsupported type: "${schema.type}"`,
            errorCode: ErrorCode.INVALID_SCHEMA_STRUCTURE,
            context: {
              suggestion: `Supported types: ${Array.from(JSONSchemaParser.SUPPORTED_TYPES).join(', ')}`,
            },
          })
        );
      }
    }
    return ok(undefined);
  }

  /**
   * Check for unsupported array features
   */
  private checkArrayFeatures(
    schema: Record<string, unknown>
  ): Result<void, ParseError> {
    // Check for mixed type arrays (not supported yet)
    if (Array.isArray(schema.type)) {
      return err(
        new ParseError({
          message: 'Union types are not yet supported',
          errorCode: ErrorCode.INVALID_SCHEMA_STRUCTURE,
          context: {
            suggestion:
              'Use a single type instead of an array of types. This feature will be added in v0.3.0',
          },
        })
      );
    }

    // Check for complex array items (tuple validation)
    if (Array.isArray(schema.items)) {
      return err(
        new ParseError({
          message: 'Tuple validation is not yet supported',
          errorCode: ErrorCode.INVALID_SCHEMA_STRUCTURE,
          context: {
            suggestion:
              'Use a single schema for all array items. This feature will be added in v0.3.0',
          },
        })
      );
    }

    return ok(undefined);
  }

  /**
   * Check for unsupported object features
   */
  private checkObjectFeatures(
    schema: Record<string, unknown>
  ): Result<void, ParseError> {
    // Check for nested objects depth limit (depth > 2 not supported)
    if (schema.type === 'object' && schema.properties) {
      return this.checkForDeepNestedObjects(schema, 0); // Start at depth 0 (root)
    }
    return ok(undefined);
  }

  /**
   * Recursively check nested schemas
   */
  private checkNestedSchemas(
    schema: Record<string, unknown>,
    visited: Set<unknown>
  ): Result<void, ParseError> {
    if (schema.properties && typeof schema.properties === 'object') {
      for (const prop of Object.values(schema.properties)) {
        const result = this.detectUnsupportedFeatures(prop, visited);
        if (result.isErr()) return result;
      }
    }

    if (schema.items) {
      const result = this.detectUnsupportedFeatures(schema.items, visited);
      if (result.isErr()) return result;
    }

    return ok(undefined);
  }

  /**
   * Check for deep nested objects beyond depth limit
   * @param schema - Schema to check
   * @param currentDepth - Current nesting depth (starts at 0 for root)
   * @param maxDepth - Maximum allowed depth (default: 2)
   */
  private checkForDeepNestedObjects(
    schema: Record<string, unknown>,
    currentDepth = 0,
    maxDepth = 2
  ): Result<void, ParseError> {
    if (!schema.properties || typeof schema.properties !== 'object') {
      return ok(undefined);
    }

    const props = schema.properties as Record<string, unknown>;

    for (const [key, propSchema] of Object.entries(props)) {
      if (typeof propSchema === 'object' && propSchema !== null) {
        const prop = propSchema as Record<string, unknown>;

        if (prop.type === 'object') {
          const nextDepth = currentDepth + 1;

          // If we would exceed the max depth with this nested object
          if (nextDepth > maxDepth) {
            return err(
              new ParseError({
                message: `Deep nested objects (depth > ${maxDepth}) not supported at properties.${key}`,
                errorCode: ErrorCode.NESTED_OBJECTS_NOT_SUPPORTED,
                context: {
                  schemaPath: `#/properties/${key}`,
                  suggestion: `Nested objects are supported up to depth ${maxDepth}. Restructure deeper objects into separate schemas or flatten properties.`,
                },
              })
            );
          }

          // Recursively check nested object properties
          const nestedCheck = this.checkForDeepNestedObjects(
            prop,
            nextDepth,
            maxDepth
          );
          if (nestedCheck.isErr()) {
            return nestedCheck;
          }
        }
      }
    }

    return ok(undefined);
  }

  // Convert dot path used internally to JSON Pointer with '#/' prefix
  private toSchemaPointer(path: string): string {
    if (!path) return '#';
    const trimmed = path.replace(/^\.+/, '');
    return `#/${trimmed.replace(/\./g, '/')}`;
  }
}
