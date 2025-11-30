import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer.js';
import { compose } from '../../transform/composition-engine.js';
import { generateFromCompose } from '../foundry-generator.js';
import type { CoverageHint } from '../../coverage/index.js';
import type { UnsatisfiedHint } from '@foundrydata/shared';

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

  it('applies hint precedence when both coverEnumValue and ensurePropertyPresence target the same node', () => {
    const schema = {
      type: 'object',
      properties: {
        choice: { enum: ['red', 'green', 'blue'] },
      },
      required: [],
      minProperties: 1,
    } as const;

    const effective = composeSchema(schema);

    const hints: CoverageHint[] = [
      {
        kind: 'ensurePropertyPresence',
        canonPath: '#',
        params: { propertyName: 'choice', present: true },
      },
      {
        kind: 'coverEnumValue',
        canonPath: '#/properties/choice',
        params: { valueIndex: 1 },
      },
    ];

    const runOnce = (): { choice?: string } => {
      const output = generateFromCompose(effective, {
        count: 1,
        coverage: {
          mode: 'guided',
          emit: () => {},
          hints,
        },
      });
      const obj = output.items[0] as { choice?: string };
      return obj;
    };

    const first = runOnce();
    const second = runOnce();

    expect(first.choice).toBe('green');
    expect(second.choice).toBe('green');
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

  it('records unsatisfied ensurePropertyPresence hints when the property is absent', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { const: 1 },
      },
      required: [],
    } as const;

    const effective = composeSchema(schema);

    const hints: CoverageHint[] = [
      {
        kind: 'ensurePropertyPresence',
        canonPath: '#',
        params: { propertyName: 'missing', present: true },
      },
    ];

    const unsatisfied: UnsatisfiedHint[] = [];

    generateFromCompose(effective, {
      count: 1,
      coverage: {
        mode: 'guided',
        emit: () => {},
        hints,
        recordUnsatisfiedHint: (hint) => {
          unsatisfied.push(hint);
        },
      },
    });

    expect(unsatisfied.length).toBeGreaterThanOrEqual(1);
    const entry = unsatisfied.find(
      (h) =>
        h.kind === 'ensurePropertyPresence' &&
        h.canonPath === '#' &&
        h.params?.propertyName === 'missing'
    );
    expect(entry).toBeDefined();
    expect(entry?.reasonCode).toBe('CONFLICTING_CONSTRAINTS');
  });

  it('records unsatisfied coverEnumValue hints when valueIndex is out of range', () => {
    const schema = {
      type: 'object',
      properties: {
        color: { enum: ['red', 'green'] },
      },
      required: ['color'],
    } as const;

    const effective = composeSchema(schema);

    const hints: CoverageHint[] = [
      {
        kind: 'coverEnumValue',
        canonPath: '#/properties/color',
        params: { valueIndex: 5 },
      },
    ];

    const unsatisfied: UnsatisfiedHint[] = [];

    const output = generateFromCompose(effective, {
      count: 1,
      coverage: {
        mode: 'guided',
        emit: () => {},
        hints,
        recordUnsatisfiedHint: (hint) => {
          unsatisfied.push(hint);
        },
      },
    });

    // Fallback still emits a valid value
    expect(output.items).toHaveLength(1);
    const obj = output.items[0] as { color?: string };
    expect(['red', 'green']).toContain(obj.color);

    const entry = unsatisfied.find(
      (h) =>
        h.kind === 'coverEnumValue' &&
        h.canonPath === '#/properties/color' &&
        (h.params as { valueIndex?: unknown })?.valueIndex === 5
    );
    expect(entry).toBeDefined();
    expect(entry?.reasonCode).toBe('CONFLICTING_CONSTRAINTS');
  });
});
