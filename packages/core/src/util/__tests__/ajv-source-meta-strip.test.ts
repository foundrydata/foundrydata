import { describe, expect, it } from 'vitest';

import { prepareSchemaForSourceAjv } from '../ajv-source.js';

describe('prepareSchemaForSourceAjv', () => {
  it('returns the original schema when no metaschema duplication is present', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { foo: { type: 'string' } },
    };

    const { schemaForAjv, stripped } = prepareSchemaForSourceAjv(schema);

    expect(schemaForAjv).toBe(schema);
    expect(stripped).toBe(false);
  });

  it('strips bundled canonical metaschemas to avoid duplicate Ajv refs', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { foo: { type: 'string' } },
      definitions: {
        bundled: {
          $id: 'http://json-schema.org/draft-07/schema',
          title: 'duplicate meta',
          type: 'object',
        },
      },
    };

    const { schemaForAjv, stripped } = prepareSchemaForSourceAjv(schema);

    expect(stripped).toBe(true);
    expect(schemaForAjv).not.toBe(schema);
    expect((schemaForAjv as any).definitions.bundled).toBeUndefined();
  });
});
