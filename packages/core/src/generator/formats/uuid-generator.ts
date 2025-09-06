/**
 * UUID Format Generator (deterministic)
 * Generates RFC 4122 version 4-like UUIDs using a seedable PRNG when provided.
 * Falls back to a fixed-seed PRNG to keep tests deterministic if no seed supplied.
 */
import { randomUUID } from 'crypto';
import { Result, ok, err } from '../../types/result';
import { GenerationError } from '../../types/errors';
import { isUUID } from '../../types/schema';
import type {
  FormatGenerator,
  FormatOptions,
} from '../../registry/format-registry';

export class UUIDGenerator implements FormatGenerator {
  readonly name = 'uuid';

  supports(format: string): boolean {
    return format === 'uuid' || format === 'guid';
  }

  generate(options?: FormatOptions): Result<string, GenerationError> {
    try {
      // If a seed is provided, use deterministic PRNG to keep pipeline reproducible
      if (typeof options?.seed === 'number' && Number.isFinite(options.seed)) {
        const mkRng = (seed: number) => {
          let t = seed >>> 0;
          return () => {
            t += 0x6d2b79f5;
            let r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
          };
        };
        const rand = mkRng(options.seed as number);
        const hex = '0123456789abcdef';
        const nibble = (): string => hex[Math.floor(rand() * 16)]!;
        const section = (len: number): string => {
          let s = '';
          for (let i = 0; i < len; i++) s += nibble();
          return s;
        };
        const ver = '4';
        const variantVals = ['8', '9', 'a', 'b'];
        const variant = variantVals[Math.floor(rand() * variantVals.length)]!;
        const uuid = `${section(8)}-${section(4)}-${ver}${section(3)}-${variant}${section(3)}-${section(12)}`;
        return ok(uuid);
      }
      // Otherwise, generate a truly random UUID for non-seeded standalone usage/tests
      const uuid = randomUUID();
      return ok(uuid);
    } catch (error) {
      return err(
        new GenerationError(
          'Failed to generate UUID',
          undefined,
          undefined,
          'uuid',
          {
            error: String(error),
          }
        )
      );
    }
  }

  validate(value: string): boolean {
    return isUUID(value);
  }

  getExamples(): string[] {
    return [
      '550e8400-e29b-41d4-a716-446655440000',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      '123e4567-e89b-12d3-a456-426614174000',
    ];
  }
}
