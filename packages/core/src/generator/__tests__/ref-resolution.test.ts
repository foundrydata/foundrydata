import { describe, expect, it } from 'vitest';
import { generateFromCompose } from '../foundry-generator';
import { compose } from '../../transform/composition-engine';
import { normalize } from '../../transform/schema-normalizer';
import { createSourceAjv } from '../../util/ajv-source';

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

  it('validates oneOf branches with root-scoped $ref during exclusivity', () => {
    const schema = {
      $defs: {
        nonPositive: { type: 'number', maximum: 0 },
        nonNegative: { type: 'number', minimum: 0 },
      },
      oneOf: [{ $ref: '#/$defs/nonPositive' }, { $ref: '#/$defs/nonNegative' }],
    } as const;

    const canonical = normalize(schema);
    const effective = compose(canonical);
    const { items } = generateFromCompose(effective, {
      count: 1,
      seed: 7,
      sourceSchema: schema,
    });

    expect(items).toHaveLength(1);
    const value = items[0] as number;
    const ajv = createSourceAjv({ dialect: '2020-12', validateFormats: false });
    const validate = ajv.compile(schema as object);

    expect(validate(value)).toBe(true);
    expect(value).not.toBe(0);
  });
});
