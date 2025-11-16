import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';

function eff(): any {
  return {
    canonical: { revPtrMap: new Map<string, string[]>([['#', ['#']]]) },
    coverageIndex: new Map(),
  };
}

function effWithInfo(): any {
  return {
    canonical: {
      revPtrMap: new Map<string, string[]>([
        ['#', ['#']],
        [
          '/definitions/https:~1~1example.com~1info.json/allOf/0',
          ['/$defs/info/allOf/0'],
        ],
        [
          '/definitions/https:~1~1example.com~1info.json/allOf/0/properties/title',
          ['/$defs/info/allOf/0/properties/title'],
        ],
        [
          '/definitions/https:~1~1example.com~1info.json/allOf/0/properties/version',
          ['/$defs/info/allOf/0/properties/version'],
        ],
      ]),
    },
    coverageIndex: new Map(),
  };
}

describe('Repair Engine — required without default minimal generation', () => {
  it('adds minimal representative when required property lacks default', () => {
    const schema = {
      type: 'object',
      properties: { b: { type: 'integer' } },
      required: ['b'],
    } as const;
    const out = repairItemsAjvDriven(
      [{}],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    const obj = out.items[0] as Record<string, unknown>;
    expect(obj).toHaveProperty('b', 0);
  });

  it('synthesizes empty strings for required refs resolved via $id', () => {
    const schema = {
      $id: 'https://example.com/root.json',
      type: 'object',
      properties: {
        info: { $ref: 'https://example.com/info.json' },
      },
      required: ['info'],
      definitions: {
        'https://example.com/info.json': {
          $id: 'https://example.com/info.json',
          allOf: [
            {
              type: 'object',
              required: ['title', 'version'],
              properties: {
                title: { type: 'string' },
                version: { type: 'string' },
              },
            },
          ],
        },
      },
    } as const;

    const out = repairItemsAjvDriven(
      [{ info: {} }],
      { schema, effective: effWithInfo() },
      { attempts: 2 }
    );

    const obj = out.items[0] as { info: Record<string, unknown> };
    expect(obj.info.title).toBe('');
    expect(obj.info.version).toBe('');
  });
});
