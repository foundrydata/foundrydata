/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
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

  // JSON Schema keywords not yet supported (only truly unsupported features)
  private static readonly PLANNED_FEATURES = {
    // Schema composition keywords (truly not implemented)
    allOf: 'Schema composition will be supported in v0.3.0',
    anyOf: 'Schema composition will be supported in v0.3.0',
    oneOf: 'Schema composition will be supported in v0.3.0',
    not: 'Negation will be supported in v0.4.0',

    // Conditional application keywords (truly not implemented)
    if: 'Conditional schemas will be supported in v0.4.0',
    then: 'Conditional schemas will be supported in v0.4.0',
    else: 'Conditional schemas will be supported in v0.4.0',

    // Advanced property validation (truly not implemented)
    patternProperties: 'Pattern properties validation not supported in MVP',
    propertyNames: 'Property names validation not supported in MVP',
    dependentSchemas: 'Dependent schemas (Draft 2019-09+) not supported in MVP',

    // Array validation keywords (truly not implemented)
    additionalItems: 'Additional items will be supported in v0.2.0',
    contains: 'Contains validation will be supported in v0.3.0',
    minContains: 'Min contains validation not supported in MVP',
    maxContains: 'Max contains validation not supported in MVP',

    // Unevaluated keywords (unevaluatedProperties now supported)

    // Content keywords (annotation-only, no validation implemented)
    contentEncoding: 'Content encoding validation not supported in MVP',
    contentMediaType: 'Content media type validation not supported in MVP',
    contentSchema: 'Content schema validation not supported in MVP',

    // Draft-specific keywords not widely supported
    $data: '$data references not supported (draft-04 extension)',
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

    // Handle $ref schemas directly (they don't need type extraction)
    if ('$ref' in schema && typeof schema.$ref === 'string') {
      return ok({
        $ref: schema.$ref,
        ...this.parseBaseProperties(schema),
      } as Schema);
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
    if ('additionalProperties' in schema) {
      const ap = schema.additionalProperties as unknown;
      if (typeof ap === 'boolean') {
        result.additionalProperties = ap;
      } else if (ap && typeof ap === 'object') {
        const apRes = this.parseSchema(
          ap as Record<string, unknown>,
          `${path}.additionalProperties`
        );
        if (apRes.isErr()) return apRes;
        result.additionalProperties = apRes.value;
      }
    }

    // Parse unevaluatedProperties (Draft 2019-09/2020-12)
    if ('unevaluatedProperties' in schema) {
      const up = schema.unevaluatedProperties as unknown;
      if (typeof up === 'boolean') {
        result.unevaluatedProperties = up;
      } else if (up && typeof up === 'object') {
        const upRes = this.parseSchema(
          up as Record<string, unknown>,
          `${path}.unevaluatedProperties`
        );
        if (upRes.isErr()) return upRes;
        result.unevaluatedProperties = upRes.value as Schema;
      }
    }

    // Parse dependencies (Draft-07 style)
    if (schema.dependencies && typeof schema.dependencies === 'object') {
      result.dependencies = schema.dependencies as Record<
        string,
        string[] | Schema
      >;
    }

    // Parse dependentRequired (Draft 2019-09+ style)
    if (
      schema.dependentRequired &&
      typeof schema.dependentRequired === 'object'
    ) {
      result.dependentRequired = schema.dependentRequired as Record<
        string,
        string[]
      >;
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

    // Parse items (can be schema object, boolean true/false, or undefined)
    if ('items' in schema) {
      const raw = schema.items as unknown;
      if (typeof raw === 'boolean') {
        // Draft-2020-12: items=false forbids additional items beyond prefixItems
        // items=true allows any additional items
        result.items = raw;
      } else if (raw && typeof raw === 'object') {
        const itemsResult = this.parseSchema(
          raw as Record<string, unknown> | boolean,
          `${path}.items`
        );
        if (itemsResult.isErr()) {
          return itemsResult;
        }
        result.items = itemsResult.value;
      }
    }

    // Parse prefixItems (Draft 2019-09+)
    if (Array.isArray(schema.prefixItems)) {
      const prefixItems: Schema[] = [];
      for (let i = 0; i < schema.prefixItems.length; i++) {
        const itemResult = this.parseSchema(
          schema.prefixItems[i] as Record<string, unknown> | boolean,
          `${path}.prefixItems[${i}]`
        );
        if (itemResult.isErr()) {
          return itemResult;
        }
        prefixItems.push(itemResult.value);
      }
      result.prefixItems = prefixItems;
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

    // Parse unevaluatedItems (Draft 2019-09/2020-12)
    if ('unevaluatedItems' in schema) {
      const ui = schema.unevaluatedItems as unknown;
      if (typeof ui === 'boolean') {
        result.unevaluatedItems = ui;
      } else if (ui && typeof ui === 'object') {
        const uiRes = this.parseSchema(
          ui as Record<string, unknown>,
          `${path}.unevaluatedItems`
        );
        if (uiRes.isErr()) return uiRes;
        result.unevaluatedItems = uiRes.value;
      }
    }

    return ok(result);
  }

  private parseStringSchema(
    schema: Record<string, unknown>,
    path: string
  ): Result<StringSchema, ParseError> {
    // Check for inappropriate properties for string type
    const invalidProps = this.checkInvalidPropertiesForType(
      'string',
      schema,
      path
    );
    if (invalidProps.isErr()) {
      return invalidProps;
    }

    const result: StringSchema = {
      type: 'string' as const,
      ...this.parseBaseProperties(schema),
    };

    // Parse format
    if (typeof schema.format === 'string') {
      result.format = schema.format as StringFormat;
    }

    // Parse pattern - validate regex and check complexity
    if (typeof schema.pattern === 'string') {
      try {
        // Validate regex syntax
        new RegExp(schema.pattern);

        // Check for ReDoS and complexity
        const complexityCheck = this.checkPatternComplexity(schema.pattern);
        if (!complexityCheck.isOk()) {
          return err(
            new ParseError({
              message: `Complex regex pattern not supported at ${path || 'root'}. ${complexityCheck.error.message}`,
              errorCode: ErrorCode.COMPLEX_REGEX_PATTERNS_NOT_SUPPORTED,
              context: {
                schemaPath: this.toSchemaPointer(
                  path ? `${path}.pattern` : 'pattern'
                ),
                suggestion:
                  'Simplify to basic pattern like "^[A-Z]{3}$", or use format constraints like "email", "uuid".',
                pattern: schema.pattern,
              },
            })
          );
        }

        result.pattern = schema.pattern;
      } catch (error) {
        return err(
          new ParseError({
            message: `Invalid regex pattern at ${path || 'root'}: ${String(error)}`,
            errorCode: ErrorCode.SCHEMA_PARSE_FAILED,
            context: {
              schemaPath: this.toSchemaPointer(
                path ? `${path}.pattern` : 'pattern'
              ),
              suggestion: 'Fix regex syntax or use format constraints.',
              pattern: schema.pattern,
            },
          })
        );
      }
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

    // For schemas with only constraints, try to infer type from enum values
    if ('enum' in schema && Array.isArray(schema.enum)) {
      const values = schema.enum as unknown[];

      const allNull = values.every((v) => v === null);
      if (allNull) return ok('null');

      const allStrings = values.every((v) => typeof v === 'string');
      if (allStrings) return ok('string');

      const allBooleans = values.every((v) => typeof v === 'boolean');
      if (allBooleans) return ok('boolean');

      const allNumbers = values.every(
        (v) => typeof v === 'number' && Number.isFinite(v as number)
      );
      if (allNumbers) {
        const allIntegers = values.every((v) => Number.isInteger(v as number));
        return ok(allIntegers ? 'integer' : 'number');
      }

      const allArrays = values.every((v) => Array.isArray(v));
      if (allArrays) return ok('array');

      const allObjects = values.every(
        (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
      );
      if (allObjects) return ok('object');

      // Mixed enum types: no inference here; planning can handle unions in future
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
      if (feature in schema) {
        // All features in PLANNED_FEATURES are not yet supported
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

  /**
   * Check pattern complexity for ReDoS protection
   */
  private checkPatternComplexity(pattern: string): Result<void, ParseError> {
    // Check pattern length (basic ReDoS protection)
    if (pattern.length > 1000) {
      return err(
        new ParseError({
          message: 'Pattern too long (max 1000 characters)',
          errorCode: ErrorCode.COMPLEX_REGEX_PATTERNS_NOT_SUPPORTED,
          context: {
            suggestion:
              'Use shorter, simpler patterns or break into multiple constraints.',
          },
        })
      );
    }

    // Check for ReDoS-prone patterns
    const redosPatterns = [
      /\([^)]*\+[^)]*\)\+/, // (a+)+
      /\([^)]*\*[^)]*\)\*/, // (a*)*
      /\([^)]*\+[^)]*\)\*/, // (a+)*
      /\([^)]*\*[^)]*\)\+/, // (a*)+
      /\([^|]*\|[^|]*\)[+*]/, // (a|a)+
      /\?\?/, // ?? (catastrophic backtracking)
      /\+\?/, // +? (can cause issues with nesting)
    ];

    for (const redosPattern of redosPatterns) {
      if (redosPattern.test(pattern)) {
        return err(
          new ParseError({
            message: 'Pattern contains ReDoS-prone construct',
            errorCode: ErrorCode.COMPLEX_REGEX_PATTERNS_NOT_SUPPORTED,
            context: {
              suggestion:
                'Use simpler patterns without nested quantifiers or redundant alternations.',
            },
          })
        );
      }
    }

    // Check for complex features
    const complexFeatures = [
      { regex: /\(\?=/, name: 'positive lookahead (?=)' },
      { regex: /\(\?!/, name: 'negative lookahead (?!)' },
      { regex: /\(\?<=/, name: 'positive lookbehind (?<=)' },
      { regex: /\(\?<!/, name: 'negative lookbehind (?<!)' },
      { regex: /\\[1-9]/, name: 'backreferences (\\1, \\2, etc.)' },
      { regex: /\(\?:/, name: 'non-capturing groups with complex nesting' },
    ];

    for (const feature of complexFeatures) {
      if (feature.regex.test(pattern)) {
        return err(
          new ParseError({
            message: `Pattern uses unsupported feature: ${feature.name}`,
            errorCode: ErrorCode.COMPLEX_REGEX_PATTERNS_NOT_SUPPORTED,
            context: {
              suggestion:
                'Use basic regex features like character classes [a-z], quantifiers {n}, and simple anchors ^$.',
            },
          })
        );
      }
    }

    return ok(undefined);
  }

  /**
   * Check for invalid properties for a specific type
   */
  private checkInvalidPropertiesForType(
    type: string,
    schema: Record<string, unknown>,
    path: string
  ): Result<void, ParseError> {
    // Define valid properties for each type (excluding base properties)
    const validPropertiesByType: Record<string, Set<string>> = {
      string: new Set(['format', 'pattern', 'minLength', 'maxLength']),
      number: new Set([
        'minimum',
        'maximum',
        'exclusiveMinimum',
        'exclusiveMaximum',
        'multipleOf',
      ]),
      integer: new Set([
        'minimum',
        'maximum',
        'exclusiveMinimum',
        'exclusiveMaximum',
        'multipleOf',
      ]),
      boolean: new Set([]),
      array: new Set([
        'items',
        'additionalItems',
        'minItems',
        'maxItems',
        'uniqueItems',
        'prefixItems',
      ]),
      object: new Set([
        'properties',
        'required',
        'additionalProperties',
        'minProperties',
        'maxProperties',
        'dependencies',
        'dependentRequired',
      ]),
      null: new Set([]),
    };

    // Base properties valid for all types
    const baseProperties = new Set([
      'type',
      'title',
      'description',
      'default',
      'examples',
      'const',
      'enum',
      '$id',
      '$schema',
      '$comment',
      '$ref',
    ]);

    const validProps = validPropertiesByType[type] || new Set();
    const allValidProps = new Set([...validProps, ...baseProperties]);

    // Check for invalid properties
    for (const prop of Object.keys(schema)) {
      if (!allValidProps.has(prop)) {
        return err(
          new ParseError({
            message: `Invalid property "${prop}" for type "${type}" at ${path || 'root'}`,
            errorCode: ErrorCode.INVALID_SCHEMA_STRUCTURE,
            context: {
              schemaPath: this.toSchemaPointer(path ? `${path}.${prop}` : prop),
              suggestion: `Valid properties for type "${type}": ${Array.from(validProps).join(', ')}${validProps.size > 0 ? ', ' : ''}plus base properties: ${Array.from(baseProperties).join(', ')}`,
            },
          })
        );
      }
    }

    return ok(undefined);
  }

  // Convert internal dot/bracket path to RFC 6901 JSON Pointer '#/...'
  private toSchemaPointer(path: string): string {
    if (!path) return '#';
    // Drop leading dots, normalize bracket indices into dot segments, then split
    const trimmed = path.replace(/^\.+/, '');
    const tokens = trimmed
      .split('.')
      .flatMap((seg) => seg.replace(/\[(\d+)\]/g, '.$1').split('.'))
      .filter(Boolean)
      // RFC 6901 escaping
      .map((s) => s.replace(/~/g, '~0').replace(/\//g, '~1'));
    return tokens.length ? `#/${tokens.join('/')}` : '#';
  }
}
