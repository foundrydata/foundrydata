import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer.js';
import { compose } from '../../transform/composition-engine.js';
import { repairItemsAjvDriven } from '../repair-engine.js';
import type { UnsatisfiedHint } from '@foundrydata/shared';

function composeSchema(schema: unknown): ReturnType<typeof compose> {
  const normalized = normalize(schema);
  return compose(normalized);
}

describe('repair unsatisfied hints integration', () => {
  it('emits REPAIR_MODIFIED_VALUE for an applied ensurePropertyPresence hint when the final instance is missing the property', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        keep: { type: 'string' },
        drop: { type: 'string' },
      },
      required: ['keep'],
    } as const;

    const effective = composeSchema(schema);

    const unsatisfied: UnsatisfiedHint[] = [];

    const hintTrace = {
      // Simulate that Generate applied an ensurePropertyPresence hint for "drop"
      // on the root object (instancePath === '') for itemIndex 0.
      getApplicationsForItem: (idx: number) =>
        idx === 0
          ? [
              {
                hint: {
                  kind: 'ensurePropertyPresence',
                  canonPath: '#',
                  params: { propertyName: 'drop', present: true },
                },
                canonPath: '#',
                instancePath: '',
                itemIndex: 0,
              },
            ]
          : [],
    };

    const items: unknown[] = [
      {
        keep: 'value',
        // "drop" is absent in the final instance; Repair sees the applied
        // hint via hintTrace and should classify this as REPAIR_MODIFIED_VALUE.
      },
    ];

    const result = repairItemsAjvDriven(
      items,
      { schema, effective },
      {
        coverage: {
          mode: 'guided',
          emit: () => {},
          hintTrace,
          recordUnsatisfiedHint: (hint) => {
            unsatisfied.push(hint);
          },
        },
      }
    );

    expect(result.items).toHaveLength(1);

    const repairUnsatisfied = unsatisfied.filter(
      (h) =>
        h.kind === 'ensurePropertyPresence' &&
        h.canonPath === '#' &&
        (h.params as { propertyName?: unknown; present?: unknown })
          ?.propertyName === 'drop'
    );
    expect(repairUnsatisfied.length).toBeGreaterThanOrEqual(1);
    expect(
      repairUnsatisfied.some((h) => h.reasonCode === 'REPAIR_MODIFIED_VALUE')
    ).toBe(true);
  });
});
