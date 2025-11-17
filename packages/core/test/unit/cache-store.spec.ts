import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalizeCacheDir,
  readFromCache,
  writeToCache,
} from '../../src/resolver/cache-store.js';

describe('resolver cache-store', () => {
  it('round-trips documents via writeToCache/readFromCache under host directory', async () => {
    const tmpRoot = await mkdtemp(
      path.join(os.tmpdir(), 'foundrydata-cache-store-')
    );
    const cacheDir = canonicalizeCacheDir(tmpRoot);

    try {
      const uri = 'https://example.com/schemas/test.json';
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          id: { type: 'integer' },
        },
      } as const;

      const written = await writeToCache(uri, schema, { cacheDir });
      expect(typeof written.contentHash).toBe('string');
      expect(written.contentHash.length).toBeGreaterThan(0);

      const cached = await readFromCache(uri, { cacheDir });
      expect(cached).toBeDefined();
      expect(cached?.contentHash).toBe(written.contentHash);
      expect(cached?.schema).toEqual(schema);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});
