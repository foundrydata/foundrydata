import { describe, expect, it } from 'vitest';

import { executePipeline } from '../../index.js';

const schemaEmbeddingDraftMeta = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    foo: { type: 'string' },
  },
  required: ['foo'],
  // AsyncAPI-style: bundle the canonical metaschema for offline resolution.
  definitions: {
    'http://json-schema.org/draft-07/schema': {
      $id: 'http://json-schema.org/draft-07/schema',
      title: 'duplicate meta',
      type: 'object',
    },
  },
} as const;

describe('pipeline executes when schemas bundle canonical metas', () => {
  it('strips duplicate metaschemas before Source AJV compilation', async () => {
    const result = await executePipeline(schemaEmbeddingDraftMeta, {
      generate: { count: 1, seed: 11 },
    });

    expect(result.status).toBe('completed');
    expect(result.stages.validate.status).toBe('completed');
  });
});
