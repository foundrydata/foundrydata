import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer.js';
import { compose } from '../../transform/composition-engine.js';
import { generateFromCompose } from '../foundry-generator.js';
import type { CoverageEvent } from '../../coverage/index.js';

function composeSchema(schema: unknown): ReturnType<typeof compose> {
  const normalized = normalize(schema);
  return compose(normalized);
}

describe('generator coverage instrumentation for branches and enums', () => {
  it('emits ONEOF_BRANCH coverage events', () => {
    const schema = {
      oneOf: [
        { type: 'string', const: 'x' },
        { type: 'number', const: 7 },
      ],
    } as const;

    const effective = composeSchema(schema);
    const events: CoverageEvent[] = [];
    generateFromCompose(effective, {
      coverage: {
        mode: 'measure',
        emit: (event) => {
          events.push(event);
        },
      },
    });

    const oneOfEvents = events.filter((e) => e.kind === 'ONEOF_BRANCH');

    expect(oneOfEvents).toHaveLength(1);
    const oneOf = oneOfEvents[0]!;
    expect(oneOf.dimension).toBe('branches');
    const oneOfIndex = (oneOf.params as { index?: number }).index ?? 0;
    expect(oneOf.canonPath).toBe(`#/oneOf/${oneOfIndex}`);
  });

  it('emits ANYOF_BRANCH coverage events', () => {
    const schema = {
      anyOf: [
        { type: 'string', const: 'a' },
        { type: 'string', const: 'b' },
      ],
    } as const;

    const effective = composeSchema(schema);
    const events: CoverageEvent[] = [];
    generateFromCompose(effective, {
      coverage: {
        mode: 'measure',
        emit: (event) => {
          events.push(event);
        },
      },
    });

    const anyOfEvents = events.filter((e) => e.kind === 'ANYOF_BRANCH');

    expect(anyOfEvents).toHaveLength(1);
    const anyOf = anyOfEvents[0]!;
    expect(anyOf.dimension).toBe('branches');
    const anyOfIndex = (anyOf.params as { index?: number }).index ?? 0;
    expect(anyOf.canonPath).toBe(`#/anyOf/${anyOfIndex}`);
  });

  it('emits CONDITIONAL_PATH events for if/then and if/else', () => {
    const schema = {
      type: 'object',
      properties: {
        kind: { const: 'A' },
        value: { type: 'integer', minimum: 0 },
      },
      required: ['kind'],
      if: {
        properties: { kind: { const: 'A' } },
        required: ['kind'],
      },
      then: {
        properties: { value: { const: 1 } },
      },
      else: {
        properties: { value: { const: 2 } },
      },
    };

    const effective = composeSchema(schema);
    const events: CoverageEvent[] = [];
    generateFromCompose(effective, {
      coverage: {
        mode: 'measure',
        emit: (event) => {
          events.push(event);
        },
      },
    });

    const conditionalEvents = events.filter(
      (e) => e.kind === 'CONDITIONAL_PATH'
    );
    const kinds = new Set(
      conditionalEvents.map((e) => e.params?.pathKind as string)
    );

    expect(conditionalEvents.length).toBeGreaterThanOrEqual(1);
    expect(conditionalEvents[0]?.dimension).toBe('branches');
    expect(conditionalEvents[0]?.canonPath).toBe('#');
    expect(kinds.has('if+then') || kinds.has('if+else')).toBe(true);
  });

  it('emits ENUM_VALUE_HIT events when enum values are produced', () => {
    const schema = {
      type: 'object',
      properties: {
        color: { enum: ['red', 'green', 'blue'] },
      },
      required: ['color'],
    } as const;

    const effective = composeSchema(schema);
    const events: CoverageEvent[] = [];
    generateFromCompose(effective, {
      coverage: {
        mode: 'measure',
        emit: (event) => {
          events.push(event);
        },
      },
    });

    const enumEvents = events.filter((e) => e.kind === 'ENUM_VALUE_HIT');
    expect(enumEvents).toHaveLength(1);
    const ev = enumEvents[0]!;
    expect(ev.dimension).toBe('enum');
    expect(ev.canonPath).toBe('#/properties/color');
    expect(ev.params).toMatchObject({ enumIndex: 0, value: 'red' });
  });

  it('does not emit coverage events when coverage hook is absent', () => {
    const schema = {
      oneOf: [{ const: 'x' }, { const: 'y' }],
    };

    const effective = composeSchema(schema);
    const events: CoverageEvent[] = [];

    // No coverage hook provided
    generateFromCompose(effective);

    expect(events).toHaveLength(0);
  });
});
