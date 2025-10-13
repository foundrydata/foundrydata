/**
 * Schema parser interface and registry system
 * Supports multiple schema formats with extensible parser registration
 */

import type { Result } from '../types/result';
import { ParseError } from '../types/errors';
import { err } from '../types/result';
import { ErrorCode } from '../errors/codes';
import type { NormalizeResult } from '../transform/schema-normalizer';

/**
 * Base interface for schema parsers
 */
export interface SchemaParser {
  supports(input: unknown): boolean;
  parse(input: unknown): Result<NormalizeResult, ParseError>;
}

/**
 * Parser registry for extensibility
 */
export class ParserRegistry {
  private parsers: SchemaParser[] = [];

  register(parser: SchemaParser): void {
    this.parsers.push(parser);
  }

  parse(input: unknown): Result<NormalizeResult, ParseError> {
    const parser = this.parsers.find((p) => p.supports(input));
    if (!parser) {
      return err(
        new ParseError({
          message: 'No suitable parser found',
          errorCode: ErrorCode.SCHEMA_PARSE_FAILED,
          context: { schemaPath: '#' },
        })
      );
    }
    return parser.parse(input);
  }

  getRegisteredParsers(): string[] {
    return this.parsers.map((p) => p.constructor.name);
  }
}

/**
 * Utility function to check if object has property
 */
export function hasProperty<T extends Record<string, unknown>>(
  obj: unknown,
  prop: keyof T
): obj is T {
  return typeof obj === 'object' && obj !== null && prop in obj;
}
