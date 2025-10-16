/* eslint-disable max-lines-per-function */
import { ok, err, type Result } from '../types/result.js';
import { ParseError } from '../types/errors.js';
import { ErrorCode } from '../errors/codes.js';
import type { SchemaParser } from './schema-parser.js';
import {
  normalize,
  type NormalizeResult,
} from '../transform/schema-normalizer.js';

type ParseResult = Result<NormalizeResult, ParseError>;

const SCHEMA_INDICATOR_KEYS = new Set([
  '$schema',
  '$id',
  '$ref',
  'type',
  'properties',
  'patternProperties',
  'propertyNames',
  'dependencies',
  'dependentSchemas',
  'dependentRequired',
  'items',
  'prefixItems',
  'additionalItems',
  'additionalProperties',
  'unevaluatedProperties',
  'unevaluatedItems',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
  'enum',
  'const',
  'format',
  'contains',
  'minProperties',
  'maxProperties',
  'minItems',
  'maxItems',
]);

export class JSONSchemaParser implements SchemaParser {
  supports(input: unknown): boolean {
    if (typeof input === 'boolean') {
      return true;
    }

    if (!isPlainObject(input)) {
      return false;
    }

    for (const key of Object.keys(input)) {
      if (SCHEMA_INDICATOR_KEYS.has(key)) {
        return true;
      }
    }

    return false;
  }

  parse(input: unknown): ParseResult {
    if (!this.supports(input)) {
      return err(
        this.createParseError('Input is not a valid JSON Schema', {
          schemaPath: '#',
        })
      );
    }

    if (typeof input === 'boolean') {
      return ok(normalize(input));
    }

    const schema = input as Record<string, unknown>;

    const serializable = this.ensureJsonSerializable(schema);
    if (serializable.isErr()) {
      return serializable;
    }

    try {
      return ok(normalize(schema));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown normalization error';
      return err(
        this.createParseError(`Failed to normalize schema: ${message}`, {
          schemaPath: '#',
        })
      );
    }
  }

  private ensureJsonSerializable(
    value: Record<string, unknown>
  ): Result<void, ParseError> {
    const stack: Array<{ value: unknown; pointer: string }> = [
      { value, pointer: '#' },
    ];
    const seen = new Set<unknown>();

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      const { value: node, pointer } = current;

      if (node === undefined) {
        return err(
          this.createParseError(
            'Undefined values are not permitted in JSON Schema',
            { schemaPath: pointer }
          )
        );
      }

      const nodeType = typeof node;
      if (nodeType === 'function' || nodeType === 'symbol') {
        return err(
          this.createParseError(
            `Unsupported value of type "${nodeType}" in schema`,
            { schemaPath: pointer }
          )
        );
      }

      if (nodeType === 'bigint') {
        return err(
          this.createParseError('BigInt values are not supported in JSON', {
            schemaPath: pointer,
          })
        );
      }

      if (nodeType !== 'object' || node === null) {
        continue;
      }

      if (seen.has(node)) {
        return err(
          new ParseError({
            message: 'Circular references are not supported in JSON Schema',
            errorCode: ErrorCode.CIRCULAR_REFERENCE_DETECTED,
            context: { schemaPath: pointer },
          })
        );
      }
      seen.add(node);

      if (Array.isArray(node)) {
        node.forEach((item, index) => {
          stack.push({
            value: item,
            pointer: appendPointer(pointer, index.toString()),
          });
        });
        continue;
      }

      const entries = Object.entries(node as Record<string, unknown>);
      for (const [key, child] of entries) {
        stack.push({
          value: child,
          pointer: appendPointer(pointer, key),
        });
      }
    }

    return ok(undefined);
  }

  private createParseError(
    message: string,
    context?: Record<string, unknown>
  ): ParseError {
    return new ParseError({
      message,
      errorCode: ErrorCode.SCHEMA_PARSE_FAILED,
      context,
    });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function appendPointer(base: string, segment: string): string {
  const escaped = segment.replace(/~/g, '~0').replace(/\//g, '~1');
  return base === '#' ? `#/${escaped}` : `${base}/${escaped}`;
}
