import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

function composeSchema(schema: unknown): ReturnType<typeof compose> {
  const normalized = normalize(schema);
  return compose(normalized);
}

describe('Array generation — earliest stable fillers for array/object items', () => {
  it('uses {} as earliest stable filler for object items under uniqueItems:true', () => {
    const schema = {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: {
        type: 'object',
      },
    } as const;

    const eff = composeSchema(schema);
    const out = generateFromCompose(eff, { seed: 101 });
    expect(out.items).toHaveLength(1);
    const root = out.items[0];
    expect(Array.isArray(root)).toBe(true);
    const arr = root as unknown[];
    expect(arr.length).toBeGreaterThanOrEqual(1);
    const value = arr[0] as unknown;
    expect(value && typeof value === 'object' && !Array.isArray(value)).toBe(
      true
    );
    expect(Object.keys(value as Record<string, unknown>).length).toBe(0);
  });

  it('uses [] as earliest stable filler for array items under uniqueItems:true', () => {
    const schema = {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: {
        type: 'array',
      },
    } as const;

    const eff = composeSchema(schema);
    const out = generateFromCompose(eff, { seed: 202 });
    expect(out.items).toHaveLength(1);
    const root = out.items[0];
    expect(Array.isArray(root)).toBe(true);
    const arr = root as unknown[];
    expect(arr.length).toBeGreaterThanOrEqual(1);
    const value = arr[0] as unknown;
    expect(Array.isArray(value)).toBe(true);
    expect((value as unknown[]).length).toBe(0);
  });
});
