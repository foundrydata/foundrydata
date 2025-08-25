/**
 * UUID Format Generator
 * Generates RFC 4122 compliant UUIDs using Node.js crypto.randomUUID()
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

  generate(_options?: FormatOptions): Result<string, GenerationError> {
    try {
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
