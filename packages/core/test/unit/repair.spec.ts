import { describe, expect, it } from 'vitest';

import { composeEffective } from './test-helpers.js';
import { repairItemsAjvDriven } from '../../src/repair/repair-engine.js';
import { DIAGNOSTIC_CODES } from '../../src/diag/codes.js';

describe('§10 Repair engine actions', () => {
  it('RAT_EPSILON_LOG_EXCLUSIVE_FLOAT records epsilon detail when nudging number', () => {
    const schema = {
      type: 'number',
      exclusiveMinimum: 0,
    };
    const { canonical } = composeEffective(schema);

    const { actions } = repairItemsAjvDriven(
      [0],
      {
        schema,
        effective: canonical,
      },
      { attempts: 1 }
    );

    const nudge = actions.find((action) => action.action === 'numericNudge');
    expect(nudge).toBeDefined();
    expect(nudge?.details).toMatchObject({
      kind: 'exclusiveMinimum',
      epsilon: '1e-12',
    });
    expect(nudge?.details).not.toHaveProperty('delta');
  });

  it('RAT_DELTA_LOG_EXCLUSIVE_INTEGER records delta detail when nudging integer', () => {
    const schema = {
      type: 'integer',
      exclusiveMinimum: 0,
    };
    const { canonical } = composeEffective(schema);

    const { actions } = repairItemsAjvDriven(
      [0],
      {
        schema,
        effective: canonical,
      },
      { attempts: 1 }
    );

    const nudge = actions.find((action) => action.action === 'numericNudge');
    expect(nudge).toBeDefined();
    expect(nudge?.details).toMatchObject({
      kind: 'exclusiveMinimum',
      delta: 1,
    });
    expect(nudge?.details).not.toHaveProperty('epsilon');
  });

  it('S1 must-cover rename guard produces REPAIR_PNAMES_PATTERN_ENUM diagnostics with mustCover flag', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      propertyNames: { enum: ['b', 'c'] },
      properties: {
        b: { type: 'number' },
        c: { type: 'number' },
      },
    };
    const { canonical } = composeEffective(schema);
    const { items, actions, diagnostics } = repairItemsAjvDriven(
      [{ x: 1 }],
      {
        schema,
        effective: canonical,
      },
      { attempts: 2 }
    );

    expect(items[0]).toEqual({ b: 1 });
    const rename = actions.find((action) => action.action === 'renameProperty');
    expect(rename).toBeDefined();
    expect(rename?.details).toEqual({ from: 'x', to: 'b' });

    const diag = diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.REPAIR_PNAMES_PATTERN_ENUM
    );
    expect(diag).toBeDefined();
    expect(diag?.details).toMatchObject({
      from: 'x',
      to: 'b',
      reason: 'enumRename',
      mustCover: true,
    });
  });
});
