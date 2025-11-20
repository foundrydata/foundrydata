import { afterEach, describe, expect, it, vi } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import {
  compose,
  type ComposeOptions,
} from '../../transform/composition-engine';
import * as AjvSource from '../../util/ajv-source.js';

function composeSchema(
  schema: unknown,
  options?: ComposeOptions
): ReturnType<typeof compose> {
  const normalized = normalize(schema);
  return compose(normalized, options);
}

describe('Source AJV dialect selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('uses draft-07 when $schema is draft-07 (E-Trace anyOf)', async () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      unevaluatedProperties: false,
      additionalProperties: false,
      required: ['kind'],
      properties: { kind: { enum: ['A', 'B'] } },
      patternProperties: { '^aa$': { const: 1 } },
      anyOf: [
        {
          properties: { kind: { const: 'A' }, aa: { const: 1 } },
          required: ['kind'],
        },
        { properties: { kind: { const: 'B' } }, required: ['kind'] },
      ],
      minProperties: 2,
    } as const;

    const { generateFromCompose } = await import('../foundry-generator');
    const eff = composeSchema(schema, { seed: 1 });
    const out = generateFromCompose(eff, {
      sourceSchema: schema,
      planOptions: {
        patternWitness: { alphabet: 'ab', maxLength: 2, maxCandidates: 32 },
      },
    });

    expect(out.items).toHaveLength(1);
    const obj = out.items[0] as Record<string, unknown>;
    const branchPtr = '/anyOf';
    const chosen = eff.diag?.nodes?.[branchPtr]?.chosenBranch?.index ?? 0;
    const branch = schema.anyOf[chosen] ?? schema.anyOf[0];
    const expectedKind = (
      branch as {
        properties: { kind: { const: string } };
      }
    ).properties.kind.const;
    expect(obj.kind).toBe(expectedKind);
    if (expectedKind === 'A') {
      expect(Object.keys(obj)).toContain('aa');
    }
  });

  it('uses draft-06 when $schema is draft-06', async () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-06/schema#',
      type: 'object',
      required: ['kind'],
      properties: { kind: { enum: ['A', 'B'] } },
      oneOf: [
        { properties: { kind: { const: 'A' } }, required: ['kind'] },
        { properties: { kind: { const: 'B' } }, required: ['kind'] },
      ],
    } as const;

    const createSpy = vi.fn(AjvSource.createSourceAjv);
    vi.doMock('../../util/ajv-source.js', async () => {
      const actual = await vi.importActual<typeof AjvSource>(
        '../../util/ajv-source.js'
      );
      return {
        ...actual,
        createSourceAjv: createSpy,
      };
    });

    const { generateFromCompose } = await import('../foundry-generator');
    const eff = composeSchema(schema, { seed: 2 });
    const out = generateFromCompose(eff, {
      sourceSchema: schema,
      planOptions: {
        patternWitness: { alphabet: 'ab', maxLength: 2, maxCandidates: 32 },
      },
    });

    expect(out.items).toHaveLength(1);
    expect(createSpy).toHaveBeenCalled();
    const dialects = createSpy.mock.calls.map(([opts]) => opts.dialect);
    expect(dialects).toContain('draft-06');
  });
});
