import { describe, it, expect } from 'vitest';

import { executePipeline } from '../../src/pipeline/orchestrator.js';

function asArray(items: unknown | unknown[] | undefined): unknown[] {
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

describe('order + items + contains — uuid id integrity', () => {
  it('never emits null or non-string ids for $defs.uuid when the pipeline succeeds', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: {
        uuid: {
          type: 'string',
          format: 'uuid',
        },
        orderItem: {
          type: 'object',
          properties: {
            id: { $ref: '#/$defs/uuid' },
            isGift: { type: 'boolean' },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/$defs/orderItem' },
          contains: {
            type: 'object',
            properties: {
              isGift: { const: true },
            },
            required: ['isGift'],
          },
          minContains: 1,
        },
      },
      required: ['items'],
      additionalProperties: false,
    } as const;

    const result = await executePipeline(schema, {
      mode: 'strict' as const,
      generate: {
        count: 10,
        seed: 4242,
      },
      validate: {
        validateFormats: false,
      },
    });

    // Le test est défini "en cas de succès" : on verrouille
    // que ce scénario doit rester complété, et non en échec
    // de validation finale.
    expect(result.status).toBe('completed');

    const generated = asArray(result.artifacts.generated?.items);
    const repaired = asArray(result.artifacts.repaired);
    const items = repaired.length > 0 ? repaired : generated;

    // S'il y a des items, leurs id doivent toujours être des string,
    // jamais null/undefined/number/etc.
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;
      const order = raw as { items?: Array<{ id?: unknown }> };
      const orderItems = Array.isArray(order.items) ? order.items : [];
      for (const item of orderItems) {
        if (!item || typeof item !== 'object') continue;
        const id = (item as { id?: unknown }).id;
        expect(typeof id).toBe('string');
      }
    }
  });
});
