import { describe, expect, it } from 'vitest';
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
});
