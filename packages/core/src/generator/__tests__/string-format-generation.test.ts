import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import { normalize } from '../../transform/schema-normalizer.js';
import { compose, ComposeResult } from '../../transform/composition-engine.js';
import { generateFromCompose } from '../foundry-generator.js';
import { createFormatRegistry } from '../format-registry.js';

function composeSchema(schema: unknown): ComposeResult {
  const normalized = normalize(schema);
  return compose(normalized);
}

describe('FormatRegistry internals', () => {
  it('returns deterministic values for supported formats', () => {
    const registry = createFormatRegistry({ seed: 99 });

    const uuid = registry.generate('uuid');
    expect(uuid.isOk()).toBe(true);
    expect(uuid.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    const email = registry.generate('email');
    expect(email.isOk()).toBe(true);
    expect(email.value).toMatch(/^[^@\s]+@example\.test$/);

    const uri = registry.generate('uri');
    expect(uri.isOk()).toBe(true);
    expect(uri.value?.startsWith('https://example.test/resource/')).toBe(true);

    const dateTime = registry.generate('date-time');
    expect(dateTime.isOk()).toBe(true);
    expect(dateTime.value).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const secondUuid = registry.generate('uuid');
    expect(secondUuid.isOk()).toBe(true);
    expect(secondUuid.value).not.toBe(uuid.value);
  });

  it('returns unsupported errors for unknown formats', () => {
    const registry = createFormatRegistry({ seed: 55 });
    const result = registry.generate('hostname');
    expect(result.isErr()).toBe(true);
    expect(result.error).toEqual({
      kind: 'unsupported-format',
      format: 'hostname',
    });
  });
});

describe('Generator integration with format registry', () => {
  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    validateFormats: true,
  });
  addFormats(ajv);

  const formats: Array<'email' | 'uri' | 'uuid' | 'date-time'> = [
    'email',
    'uri',
    'uuid',
    'date-time',
  ];

  it('produces strings that pass ajv-formats validation', () => {
    for (const format of formats) {
      const schema = { type: 'string', format };
      const effective = composeSchema(schema);
      const output = generateFromCompose(effective, {
        validateFormats: true,
        seed: 777,
      });
      const value = output.items[0];
      const validate = ajv.compile(schema);
      const ok = validate(value);
      expect(ok).toBe(true);
    }
  });

  it('pads strings to satisfy minLength without crashing', () => {
    const schema = {
      type: 'string',
      format: 'email',
      minLength: 48,
    };
    const effective = composeSchema(schema);
    const output = generateFromCompose(effective, {
      validateFormats: true,
      seed: 314,
    });
    const value = output.items[0] as string;
    expect(Array.from(value).length).toBeGreaterThanOrEqual(48);
  });
});
