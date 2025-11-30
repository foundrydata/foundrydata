import { describe, it, expect } from 'vitest';

import type { CoverageTarget } from '@foundrydata/shared';
import {
  createCoverageAccumulator,
  createStreamingCoverageAccumulator,
  type CoverageEvent,
} from '../events.js';

function makeTargets(): CoverageTarget[] {
  return [
    {
      id: 't-schema-root',
      dimension: 'structure',
      kind: 'SCHEMA_NODE',
      canonPath: '#',
      status: 'active',
    },
    {
      id: 't-schema-id',
      dimension: 'structure',
      kind: 'SCHEMA_NODE',
      canonPath: '#/properties/id',
      status: 'active',
    },
    {
      id: 't-prop-id',
      dimension: 'structure',
      kind: 'PROPERTY_PRESENT',
      canonPath: '#/properties/id',
      params: { propertyName: 'id' },
      status: 'active',
    },
    {
      id: 't-anyof-0',
      dimension: 'branches',
      kind: 'ANYOF_BRANCH',
      canonPath: '#/anyOf/0',
      params: { index: 0 },
      status: 'active',
    },
    {
      id: 't-oneof-1',
      dimension: 'branches',
      kind: 'ONEOF_BRANCH',
      canonPath: '#/oneOf/1',
      params: { index: 1 },
      status: 'active',
    },
    {
      id: 't-conditional-then',
      dimension: 'branches',
      kind: 'CONDITIONAL_PATH',
      canonPath: '#/if',
      params: { pathKind: 'if+then' },
      status: 'active',
    },
    {
      id: 't-enum-1',
      dimension: 'enum',
      kind: 'ENUM_VALUE_HIT',
      canonPath: '#',
      params: { enumIndex: 1, value: 'b' },
      status: 'active',
    },
    {
      id: 't-num-min',
      dimension: 'boundaries',
      kind: 'NUMERIC_MIN_HIT',
      canonPath: '#/properties/num',
      params: { boundaryKind: 'minimum', boundaryValue: 0 },
      status: 'active',
    },
    {
      id: 't-str-minlen',
      dimension: 'boundaries',
      kind: 'STRING_MIN_LENGTH_HIT',
      canonPath: '#/properties/str',
      params: { boundaryKind: 'minLength', boundaryValue: 3 },
      status: 'active',
    },
    {
      id: 't-arr-minitems',
      dimension: 'boundaries',
      kind: 'ARRAY_MIN_ITEMS_HIT',
      canonPath: '#/properties/arr',
      params: { boundaryKind: 'minItems', boundaryValue: 2 },
      status: 'active',
    },
    {
      id: 't-diagnostic',
      dimension: 'operations',
      kind: 'SCHEMA_REUSED_COVERED',
      canonPath: '#/components/schemas/User',
      status: 'deprecated',
    },
  ];
}

describe('createCoverageAccumulator', () => {
  it('records hits for schema and property events', () => {
    const targets = makeTargets();
    const acc = createCoverageAccumulator(targets);

    const events: CoverageEvent[] = [
      {
        dimension: 'structure',
        kind: 'SCHEMA_NODE',
        canonPath: '#',
      },
      {
        dimension: 'structure',
        kind: 'PROPERTY_PRESENT',
        canonPath: '#/properties/id',
        params: { propertyName: 'id' },
      },
    ];

    for (const event of events) {
      acc.record(event);
    }

    expect(acc.isHit('t-schema-root')).toBe(true);
    expect(acc.isHit('t-prop-id')).toBe(true);
    expect(acc.isHit('t-schema-id')).toBe(false);

    const reports = acc.toReport(targets);
    const rootReport = reports.find((t) => t.id === 't-schema-root');
    const propReport = reports.find((t) => t.id === 't-prop-id');
    const schemaIdReport = reports.find((t) => t.id === 't-schema-id');

    expect(rootReport?.hit).toBe(true);
    expect(propReport?.hit).toBe(true);
    expect(schemaIdReport?.hit).toBe(false);
  });

  it('maps branch and enum events to the corresponding targets', () => {
    const targets = makeTargets();
    const acc = createCoverageAccumulator(targets);

    const events: CoverageEvent[] = [
      {
        dimension: 'branches',
        kind: 'ANYOF_BRANCH',
        canonPath: '#/anyOf/0',
        params: { index: 0 },
      },
      {
        dimension: 'branches',
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/1',
        params: { index: 1 },
      },
      {
        dimension: 'branches',
        kind: 'CONDITIONAL_PATH',
        canonPath: '#/if',
        params: { pathKind: 'if+then' },
      },
      {
        dimension: 'enum',
        kind: 'ENUM_VALUE_HIT',
        canonPath: '#',
        params: { enumIndex: 1, value: 'b' },
      },
    ];

    for (const event of events) {
      acc.record(event);
    }

    expect(acc.isHit('t-anyof-0')).toBe(true);
    expect(acc.isHit('t-oneof-1')).toBe(true);
    expect(acc.isHit('t-conditional-then')).toBe(true);
    expect(acc.isHit('t-enum-1')).toBe(true);
  });

  it('maps boundaries events to the corresponding targets', () => {
    const targets = makeTargets();
    const acc = createCoverageAccumulator(targets);

    const events: CoverageEvent[] = [
      {
        dimension: 'boundaries',
        kind: 'NUMERIC_MIN_HIT',
        canonPath: '#/properties/num',
        params: { boundaryKind: 'minimum', boundaryValue: 0 },
      },
      {
        dimension: 'boundaries',
        kind: 'STRING_MIN_LENGTH_HIT',
        canonPath: '#/properties/str',
        params: { boundaryKind: 'minLength', boundaryValue: 3 },
      },
      {
        dimension: 'boundaries',
        kind: 'ARRAY_MIN_ITEMS_HIT',
        canonPath: '#/properties/arr',
        params: { boundaryKind: 'minItems', boundaryValue: 2 },
      },
    ];

    for (const event of events) {
      acc.record(event);
    }

    expect(acc.isHit('t-num-min')).toBe(true);
    expect(acc.isHit('t-str-minlen')).toBe(true);
    expect(acc.isHit('t-arr-minitems')).toBe(true);
  });

  it('ignores unmatched events and unknown target kinds', () => {
    const targets = makeTargets();
    const acc = createCoverageAccumulator(targets);

    const unmatchedEvents: CoverageEvent[] = [
      {
        dimension: 'structure',
        kind: 'SCHEMA_NODE',
        canonPath: '#/nonexistent',
      },
      {
        dimension: 'branches',
        kind: 'ANYOF_BRANCH',
        canonPath: '#/anyOf/999',
        params: { index: 999 },
      },
    ];

    for (const event of unmatchedEvents) {
      acc.record(event);
    }

    // Diagnostic-only target is not indexed by the accumulator.
    expect(acc.isHit('t-diagnostic')).toBe(false);
    expect(acc.getHitTargetIds().size).toBe(0);

    // markTargetHit can still be used directly when a caller
    // already knows the target ID.
    acc.markTargetHit('t-schema-id');
    expect(acc.isHit('t-schema-id')).toBe(true);
    expect(acc.getHitTargetIds().has('t-schema-id')).toBe(true);
  });
});

describe('createStreamingCoverageAccumulator', () => {
  it('records events directly into the global bitmap', () => {
    const targets = makeTargets();
    const acc = createStreamingCoverageAccumulator(targets);

    const events: CoverageEvent[] = [
      {
        dimension: 'structure',
        kind: 'SCHEMA_NODE',
        canonPath: '#',
      },
      {
        dimension: 'branches',
        kind: 'ANYOF_BRANCH',
        canonPath: '#/anyOf/0',
        params: { index: 0 },
      },
    ];

    for (const event of events) {
      acc.record(event);
    }

    expect(acc.isHit('t-schema-root')).toBe(true);
    expect(acc.isHit('t-anyof-0')).toBe(true);
    expect(acc.isHit('t-schema-id')).toBe(false);
  });

  it('keeps per-instance state separate until commit', () => {
    const targets = makeTargets();
    const acc = createStreamingCoverageAccumulator(targets);

    const instanceA = acc.createInstanceState();
    const instanceB = acc.createInstanceState();

    const rootEvent: CoverageEvent = {
      dimension: 'structure',
      kind: 'SCHEMA_NODE',
      canonPath: '#',
    };
    const propEvent: CoverageEvent = {
      dimension: 'structure',
      kind: 'PROPERTY_PRESENT',
      canonPath: '#/properties/id',
      params: { propertyName: 'id' },
    };

    instanceA.record(rootEvent);
    instanceB.record(rootEvent);
    instanceB.record(propEvent);

    expect(acc.getHitTargetIds().size).toBe(0);

    acc.commitInstance(instanceA);
    expect(acc.isHit('t-schema-root')).toBe(true);
    expect(acc.isHit('t-prop-id')).toBe(false);

    acc.commitInstance(instanceB);
    expect(acc.isHit('t-schema-root')).toBe(true);
    expect(acc.isHit('t-prop-id')).toBe(true);
  });

  it('reset allows reusing per-instance state without leaking hits', () => {
    const targets = makeTargets();
    const acc = createStreamingCoverageAccumulator(targets);

    const instance = acc.createInstanceState();

    const event: CoverageEvent = {
      dimension: 'branches',
      kind: 'ONEOF_BRANCH',
      canonPath: '#/oneOf/1',
      params: { index: 1 },
    };

    instance.record(event);
    expect(instance.getHitTargetIds().has('t-oneof-1')).toBe(true);

    acc.commitInstance(instance);
    expect(acc.isHit('t-oneof-1')).toBe(true);

    expect(instance.getHitTargetIds().size).toBe(0);

    instance.record(event);
    expect(instance.getHitTargetIds().has('t-oneof-1')).toBe(true);
    instance.reset();
    expect(instance.getHitTargetIds().size).toBe(0);

    expect(acc.isHit('t-oneof-1')).toBe(true);
  });

  it('does not index diagnostic-only targets in per-instance or global state', () => {
    const targets = makeTargets();
    const acc = createStreamingCoverageAccumulator(targets);
    const instance = acc.createInstanceState();

    const unmatchedDiagnosticEvent: CoverageEvent = {
      dimension: 'structure',
      // @ts-expect-error - this event kind is not part of the streaming model
      kind: 'SCHEMA_REUSED_COVERED',
      canonPath: '#/components/schemas/User',
    };

    instance.record(unmatchedDiagnosticEvent as any);

    acc.record(unmatchedDiagnosticEvent as any);

    expect(instance.getHitTargetIds().size).toBe(0);
    expect(acc.getHitTargetIds().size).toBe(0);
    expect(acc.isHit('t-diagnostic')).toBe(false);
  });
});
