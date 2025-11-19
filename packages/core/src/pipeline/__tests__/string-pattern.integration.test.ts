import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_CODES } from '../../diag/codes.js';
import { executePipeline } from '../orchestrator.js';

describe('pipeline string pattern generation', () => {
  it('produces strings that satisfy anchored patterns', async () => {
    const schema = {
      type: 'object',
      properties: {
        openapi: { type: 'string', pattern: '^3\\.1\\.\\d+(-.+)?$' },
      },
      required: ['openapi'],
    } as const;

    const result = await executePipeline(schema, {
      generate: { count: 1 },
    });

    expect(result.status).toBe('completed');
    const generated = result.artifacts.generated?.items?.[0] as
      | { openapi: string }
      | undefined;
    expect(generated?.openapi).toBe('3.1.0');
  });

  it('emits DRAFT06_PATTERN_TOLERATED in lax mode for invalid draft-06 pattern schemas', async () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      type: 'object',
      properties: {
        value: {
          type: 'string',
          // Intentionally invalid draft-06 decimal pattern (extra closing brace)
          pattern:
            '^-?(0|[1-9][0-9]{0,17})(\\.[0-9]{1,17})?([eE][+-]?[0-9]{1,9}})?$',
        },
      },
    } as const;

    const result = await executePipeline(schema, {
      mode: 'lax',
      generate: { count: 1 },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('completed');
    const codes =
      result.artifacts.validationDiagnostics?.map((d) => d.code) ?? [];
    expect(codes).toContain(DIAGNOSTIC_CODES.DRAFT06_PATTERN_TOLERATED);
  });
});
