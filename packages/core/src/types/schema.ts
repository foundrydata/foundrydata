/**
 * Core schema types for JSON Schema representation
 * Based on JSON Schema Draft 7 specification
 */

/**
 * String formats supported by the schema
 */
export type StringFormat =
  | 'uuid'
  | 'email'
  | 'date'
  | 'date-time'
  | 'time'
  | 'duration'
  | 'uri'
  | 'uri-reference'
  | 'url'
  | 'hostname'
  | 'ipv4'
  | 'ipv6'
  | 'regex'
  | 'json-pointer'
  | 'relative-json-pointer'
  | 'password'
  | 'binary'
  | 'byte'
  | 'int32'
  | 'int64'
  | 'float'
  | 'double';

/**
 * Base interface for all schema types
 * JSON Schema Draft-07 allows type to be either a string or array of strings, or omitted
 */
export interface BaseSchema {
  // Keywords existants (corrects)
  type?: string | string[];
  title?: string;
  description?: string;
  examples?: any[];
  default?: any;
  const?: any;
  enum?: any[];

  // Core keywords (existants)
  $id?: string;
  $schema?: string;
  $ref?: string;
  $comment?: string;
  $anchor?: string; // Draft 2019-09+
  $vocabulary?: Record<string, boolean>; // Draft 2019-09+
  $defs?: Record<string, Schema>; // Draft 2020-12

  // Keywords d'annotation (Draft 07+)
  readOnly?: boolean; // ✅ Draft 07
  writeOnly?: boolean; // ✅ Draft 07
  deprecated?: boolean; // ✅ Draft 2019-09

  // Conditional keywords
  if?: Schema;
  then?: Schema;
  else?: Schema;

  // Composition keywords
  allOf?: Schema[];
  anyOf?: Schema[];
  oneOf?: Schema[];
  not?: Schema;
}

/**
 * Object schema definition
 */
export interface ObjectSchema extends BaseSchema {
  type: 'object';
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  propertyNames?: Schema;
  minProperties?: number;
  maxProperties?: number;
  patternProperties?: Record<string, Schema>;
  dependencies?: Record<string, string[] | Schema>;
  dependentRequired?: Record<string, string[]>;
  dependentSchemas?: Record<string, Schema>;
}

/**
 * Array schema definition
 */
export interface ArraySchema extends BaseSchema {
  type: 'array';
  items?: Schema | Schema[];
  additionalItems?: boolean | Schema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  contains?: Schema;
  minContains?: number;
  maxContains?: number;
}

/**
 * String schema definition
 */
export interface StringSchema extends BaseSchema {
  type: 'string';
  format?: StringFormat;
  pattern?: string;
  minLength?: number;
  maxLength?: number;

  // Keywords spécifiques aux strings (Draft 07+)
  contentEncoding?: string; // ✅ Draft 07 'base64', '7bit', '8bit', 'binary', 'quoted-printable'
  contentMediaType?: string; // ✅ Draft 07 'text/html', 'application/json', etc.
  contentSchema?: Schema; // Draft 2019-09
}

/**
 * Number schema definition
 */
export interface NumberSchema extends BaseSchema {
  type: 'number';
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
}

/**
 * Integer schema definition
 */
export interface IntegerSchema extends BaseSchema {
  type: 'integer';
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
}

/**
 * Boolean schema definition
 */
export interface BooleanSchema extends BaseSchema {
  type: 'boolean';
}

/**
 * Null schema definition
 */
export interface NullSchema extends BaseSchema {
  type: 'null';
}

/**
 * Enum schema definition
 * According to JSON Schema Draft-07, enum can appear with any type or no type
 */
export interface EnumSchema extends BaseSchema {
  enum: any[];
}

/**
 * Union type representing all possible schema types
 */
export type Schema =
  | ObjectSchema
  | ArraySchema
  | StringSchema
  | NumberSchema
  | IntegerSchema
  | BooleanSchema
  | NullSchema
  | EnumSchema
  | boolean; // JSON Schema allows boolean schemas (true/false for any/never)

/**
 * Branded types for type safety
 */
export type UUID = string & { __brand: 'UUID' };
export type Email = string & { __brand: 'Email' };
export type ISO8601DateTime = string & { __brand: 'ISO8601DateTime' };
export type ISO8601Date = string & { __brand: 'ISO8601Date' };
export type URI = string & { __brand: 'URI' };
export type IPv4 = string & { __brand: 'IPv4' };
export type IPv6 = string & { __brand: 'IPv6' };

/**
 * Type guards for schema variants
 */
export function isObjectSchema(schema: Schema): schema is ObjectSchema {
  return (
    typeof schema === 'object' && schema !== null && schema.type === 'object'
  );
}

export function isArraySchema(schema: Schema): schema is ArraySchema {
  return (
    typeof schema === 'object' && schema !== null && schema.type === 'array'
  );
}

export function isStringSchema(schema: Schema): schema is StringSchema {
  return (
    typeof schema === 'object' && schema !== null && schema.type === 'string'
  );
}

export function isNumberSchema(schema: Schema): schema is NumberSchema {
  return (
    typeof schema === 'object' && schema !== null && schema.type === 'number'
  );
}

export function isIntegerSchema(schema: Schema): schema is IntegerSchema {
  return (
    typeof schema === 'object' && schema !== null && schema.type === 'integer'
  );
}

export function isBooleanSchema(schema: Schema): schema is BooleanSchema {
  return (
    typeof schema === 'object' && schema !== null && schema.type === 'boolean'
  );
}

export function isNullSchema(schema: Schema): schema is NullSchema {
  return (
    typeof schema === 'object' && schema !== null && schema.type === 'null'
  );
}

export function isEnumSchema(schema: Schema): schema is EnumSchema {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    'enum' in schema &&
    Array.isArray(schema.enum)
  );
}

/**
 * Type guards for branded types
 */
export function isUUID(value: string): value is UUID {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function isEmail(value: string): value is Email {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isISO8601DateTime(value: string): value is ISO8601DateTime {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(value);
}

export function isISO8601Date(value: string): value is ISO8601Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isIPv4(value: string): value is IPv4 {
  return /^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$/.test(
    value
  );
}

export function isIPv6(value: string): value is IPv6 {
  return (
    /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(value) ||
    /^::1$/.test(value) ||
    /^::$/.test(value)
  );
}

/**
 * Schema validation utilities
 */
export interface SchemaValidationError {
  path: string;
  message: string;
  keyword: string;
  schemaPath: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
}

/**
 * Helper to get schema type from a schema object
 */
export function getSchemaType(schema: Schema): string | string[] | undefined {
  if (typeof schema === 'boolean') {
    return schema ? 'any' : 'never';
  }
  return schema.type;
}
