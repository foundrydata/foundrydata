import { describe, it, expect } from 'vitest';

import {
  type ContainsNeed,
  areNeedsPairwiseDisjoint,
  computeEffectiveMaxItems,
} from '../arrays/contains-bag.js';

describe('arrays/contains-bag helpers — sum(min_i) vs maxItems', () => {
  it('distinguishes disjoint vs overlap-unknown when Σ min_i > effectiveMaxItems', () => {
    const schema = {
      type: 'array',
      maxItems: 1,
    };

    const effectiveMaxItems = computeEffectiveMaxItems(schema);
    expect(effectiveMaxItems).toBe(1);

    const disjointNeeds: ContainsNeed[] = [
      { schema: { const: 'left' }, min: 1 },
      { schema: { const: 'right' }, min: 1 },
    ];

    const overlappingNeeds: ContainsNeed[] = [
      { schema: { type: 'string' }, min: 1 },
      { schema: { type: 'string' }, min: 1 },
    ];

    const sumDisjoint = disjointNeeds.reduce(
      (sum, need) => sum + (typeof need.min === 'number' ? need.min : 1),
      0
    );
    const sumOverlap = overlappingNeeds.reduce(
      (sum, need) => sum + (typeof need.min === 'number' ? need.min : 1),
      0
    );

    expect(sumDisjoint).toBe(2);
    expect(sumOverlap).toBe(2);
    expect(sumDisjoint).toBeGreaterThan(effectiveMaxItems!);
    expect(sumOverlap).toBeGreaterThan(effectiveMaxItems!);

    const disjoint = areNeedsPairwiseDisjoint(
      disjointNeeds.map((need) => ({ schema: need.schema }))
    );
    const overlapUnknown = areNeedsPairwiseDisjoint(
      overlappingNeeds.map((need) => ({ schema: need.schema }))
    );

    expect(disjoint).toBe(true);
    expect(overlapUnknown).toBe(false);
  });
});
