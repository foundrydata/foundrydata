import { describe, expect, it } from 'vitest';

import { executePipeline } from '../orchestrator';

describe('Pipeline/E-Trace anyOf (smoke)', () => {
  it('runs full pipeline with anyOf + unevaluatedProperties:false (Source AJV present)', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      unevaluatedProperties: false,
      additionalProperties: false,
      required: ['kind'],
      properties: {
        kind: { enum: ['A', 'B'] },
      },
      anyOf: [
        {
          properties: { kind: { const: 'A' }, aa: { const: 1 } },
          required: ['kind'],
        },
        {
          properties: { kind: { const: 'B' }, bb: { const: 2 } },
          required: ['kind'],
        },
      ],
      minProperties: 1,
    } as const;

    const result = await executePipeline(schema, {
      generate: { count: 1 },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('completed');
    expect(result.timeline).toEqual([
      'normalize',
      'compose',
      'generate',
      'repair',
      'validate',
    ]);
    expect(result.stages.generate.status).toBe('completed');
    // Artifacts present
    expect(Array.isArray(result.artifacts.generated?.items)).toBe(true);
  });
});
