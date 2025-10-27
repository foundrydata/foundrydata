import { describe, expect, it } from 'vitest';
import { generateFromCompose } from '../foundry-generator';
import { compose } from '../../transform/composition-engine';
import { normalize } from '../../transform/schema-normalizer';

describe('Generator ref resolution', () => {
  it('resolves $ref targets before enforcing required keys', () => {
    const schema = {
      $defs: {
        info: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            version: { type: 'string' },
          },
          required: ['title', 'version'],
          unevaluatedProperties: false,
        },
      },
      type: 'object',
      properties: {
        info: { $ref: '#/$defs/info' },
      },
      required: ['info'],
    } as const;

    const canonical = normalize(schema);
    const effective = compose(canonical);
    const { items } = generateFromCompose(effective, { count: 1 });
    const instance = items[0] as { info: { title: string; version: string } };

    expect(instance.info.title).toBe('');
    expect(instance.info.version).toBe('');
  });
});
