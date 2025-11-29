import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer.js';
import { compose } from '../../transform/composition-engine.js';
import { generateFromCompose } from '../foundry-generator.js';
import type { CoverageHint } from '../../coverage/index.js';

function composeSchema(schema: unknown): ReturnType<typeof compose> {
  const normalized = normalize(schema);
  return compose(normalized);
}

describe('generator guided coverage hints', () => {
  it('uses preferBranch hints for oneOf branch selection in coverage=guided', () => {
    const schema = {
      oneOf: [{ const: 'x' }, { const: 'y' }],
    } as const;

    const effective = composeSchema(schema);

    const hints: CoverageHint[] = [
      {
        kind: 'preferBranch',
        canonPath: '#/oneOf',
        params: { branchIndex: 1 },
      },
    ];

    const output = generateFromCompose(effective, {
      count: 1,
      coverage: {
        mode: 'guided',
        emit: () => {},
        hints,
      },
    });

    expect(output.items).toHaveLength(1);
    expect(output.items[0]).toBe('y');
  });

  it('uses coverEnumValue hints to steer enum selection in coverage=guided', () => {
    const schema = {
      type: 'object',
      properties: {
        color: { enum: ['red', 'green', 'blue'] },
      },
      required: ['color'],
    } as const;

    const effective = composeSchema(schema);

    const hints: CoverageHint[] = [
      {
        kind: 'coverEnumValue',
        canonPath: '#/properties/color',
        params: { valueIndex: 2 },
      },
    ];

    const output = generateFromCompose(effective, {
      count: 1,
      coverage: {
        mode: 'guided',
        emit: () => {},
        hints,
      },
    });

    expect(output.items).toHaveLength(1);
    const obj = output.items[0] as { color?: string };
    expect(obj.color).toBe('blue');
  });

  it('prioritizes ensurePropertyPresence(present:true) hints when adding optional properties', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { const: 1 },
        b: { const: 2 },
      },
      required: [],
      minProperties: 1,
    } as const;

    const effective = composeSchema(schema);

    const hints: CoverageHint[] = [
      {
        kind: 'ensurePropertyPresence',
        canonPath: '#',
        params: { propertyName: 'b', present: true },
      },
    ];

    const output = generateFromCompose(effective, {
      count: 1,
      coverage: {
        mode: 'guided',
        emit: () => {},
        hints,
      },
    });

    expect(output.items).toHaveLength(1);
    const obj = output.items[0] as { a?: number; b?: number };
    expect(obj.b).toBe(2);
  });

  it('does not change behavior when coverage mode is measure and hints are provided', () => {
    const schema = {
      type: 'object',
      properties: {
        color: { enum: ['red', 'green', 'blue'] },
      },
      required: ['color'],
    } as const;

    const effective = composeSchema(schema);

    const hints: CoverageHint[] = [
      {
        kind: 'coverEnumValue',
        canonPath: '#/properties/color',
        params: { valueIndex: 2 },
      },
    ];

    const guided = generateFromCompose(effective, {
      count: 1,
      coverage: {
        mode: 'guided',
        emit: () => {},
        hints,
      },
    });

    const measure = generateFromCompose(effective, {
      count: 1,
      coverage: {
        mode: 'measure',
        emit: () => {},
      },
    });

    const guidedObj = guided.items[0] as { color?: string };
    const measureObj = measure.items[0] as { color?: string };

    expect(guidedObj.color).toBe('blue');
    expect(measureObj.color).toBe('red');
  });
});
