import { describe, it, expect } from 'vitest';
import { FoundryGenerator } from '../foundry-generator';

describe('FoundryGenerator – format alias interoperability (registry ⇄ AJV)', () => {
  it('generates compliant data for format: "url" (alias of uri)', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        link: { type: 'string', format: 'url' },
      },
      required: ['link'],
    } as const;

    const gen = new FoundryGenerator();
    const r1 = gen.run(schema as object, {
      count: 20,
      seed: 424242,
      locale: 'en',
    });
    expect(r1.isOk()).toBe(true);
    if (!r1.isOk()) return;
    expect(r1.value.report.compliant).toBe(true);

    const r2 = gen.run(schema as object, {
      count: 20,
      seed: 424242,
      locale: 'en',
    });
    expect(r2.isOk()).toBe(true);
    if (!r2.isOk()) return;
    expect(r2.value.items).toEqual(r1.value.items);
  });

  it('generates compliant data for format: "guid" (alias of uuid)', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        id: { type: 'string', format: 'guid' },
      },
      required: ['id'],
    } as const;

    const gen = new FoundryGenerator();
    const r1 = gen.run(schema as object, {
      count: 16,
      seed: 1337,
      locale: 'en',
    });
    expect(r1.isOk()).toBe(true);
    if (!r1.isOk()) return;
    expect(r1.value.report.compliant).toBe(true);

    const r2 = gen.run(schema as object, {
      count: 16,
      seed: 1337,
      locale: 'en',
    });
    expect(r2.isOk()).toBe(true);
    if (!r2.isOk()) return;
    expect(r2.value.items).toEqual(r1.value.items);
  });
});
