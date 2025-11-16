import { describe, expect, it } from 'vitest';
import { executePipeline } from '../orchestrator.js';

describe('pipeline OpenAPI-style root anyOf handling', () => {
  it('emits the minimal required paths container to satisfy anyOf', async () => {
    const schema = {
      type: 'object',
      properties: {
        openapi: { type: 'string', const: '3.1.0' },
        info: {
          type: 'object',
          properties: {
            title: { type: 'string', const: 'Example' },
          },
          required: ['title'],
          additionalProperties: false,
        },
        paths: {
          type: 'object',
          additionalProperties: false,
        },
        components: {
          type: 'object',
          additionalProperties: false,
        },
        webhooks: {
          type: 'object',
          additionalProperties: false,
        },
      },
      required: ['openapi', 'info'],
      anyOf: [
        { required: ['paths'] },
        { required: ['components'] },
        { required: ['webhooks'] },
      ],
      unevaluatedProperties: false,
      additionalProperties: false,
    } as const;

    const result = await executePipeline(schema, {
      generate: { count: 1, seed: 123 },
    });

    expect(result.status).toBe('completed');
    const generated = result.artifacts.generated?.items?.[0] as
      | {
          info: { title: string };
          openapi: string;
          paths?: Record<string, unknown>;
          components?: unknown;
          webhooks?: unknown;
        }
      | undefined;

    expect(generated).toBeDefined();
    const keys = Object.keys(generated!);
    expect(keys[0]).toBe('info');
    expect(keys[1]).toBe('openapi');
    const branchKeys = ['paths', 'components', 'webhooks'] as const;
    const presentBranch = branchKeys.find((key) => key in (generated ?? {}));
    expect(presentBranch).toBeDefined();
    expect(keys).toEqual(['info', 'openapi', presentBranch]);
    expect(generated?.[presentBranch!]).toEqual({});
    for (const key of branchKeys) {
      if (key === presentBranch) continue;
      expect(generated?.[key]).toBeUndefined();
    }
  });
});
