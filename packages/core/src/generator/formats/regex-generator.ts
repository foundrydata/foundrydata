import {
  type FormatGenerator,
  type FormatOptions,
} from '../../registry/format-registry';
import { ok, err, type Result } from '../../types/result';
import { GenerationError } from '../../types/errors';

/**
 * RegexGenerator: generates valid ECMAScript regex pattern strings (without delimiters)
 * Validation compiles with new RegExp(value).
 */
export class RegexGenerator implements FormatGenerator {
  readonly name = 'regex';

  supports(format: string): boolean {
    return format.toLowerCase() === 'regex';
  }

  generate(_options?: FormatOptions): Result<string, GenerationError> {
    try {
      // Curated safe patterns + small combinator set for variety
      const patterns: string[] = [
        '^[a-z]+$',
        '^[A-Z]+$',
        '^[a-zA-Z]+$',
        '^[0-9]+$',
        '^\\d{3}$',
        '^[a-z0-9]{1,8}$',
        '^test\\d*$',
        '^(yes|no)$',
        '^[a-z]{2,5}[0-9]{2}$',
        '^[a-zA-Z0-9_-]+$',
      ];

      // Simple deterministic selection without relying on global RNG
      const now = Date.now() >>> 0;
      const idx = now % patterns.length;
      const value = patterns[idx]!;
      return ok(value);
    } catch (e) {
      return err(
        new GenerationError(
          `Failed to generate regex: ${e instanceof Error ? e.message : String(e)}`,
          'Check RegexGenerator implementation',
          '$',
          'format'
        )
      );
    }
  }

  validate(value: string): boolean {
    try {
      // Expect bare pattern (no delimiters)
      new RegExp(value);
      return true;
    } catch {
      return false;
    }
  }

  getExamples(): string[] {
    return ['^[a-z]+$', '^\\d{3}$', '^test[0-9]+$', '^(yes|no)$'];
  }
}
