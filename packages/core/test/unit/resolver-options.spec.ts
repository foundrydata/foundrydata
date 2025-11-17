import { afterEach, describe, it, expect, vi } from 'vitest';
import { ResolutionRegistry } from '../../src/resolver/registry.js';
import {
  resolveAllExternalRefs,
  type ResolverOptions,
} from '../../src/resolver/options.js';
import * as HttpResolver from '../../src/resolver/http-resolver.js';

describe('resolveAllExternalRefs (Extension R1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseOptions: ResolverOptions = {
    strategies: ['local'],
    cacheDir: '~/.foundrydata/cache',
    hydrateFinalAjv: true,
    maxDocs: 64,
    maxRefDepth: 16,
    maxBytesPerDoc: 5 * 1024 * 1024,
    timeoutMs: 8000,
    followRedirects: 3,
    acceptYaml: true,
  };

  it('emits strategies note and no registry when schema has no externals', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        id: { type: 'integer' },
      },
    } as const;

    const spy = vi.spyOn(HttpResolver, 'prefetchAndBuildRegistry');

    const result = await resolveAllExternalRefs(schema as object, baseOptions);

    expect(spy).not.toHaveBeenCalled();
    expect(result.registry.size()).toBe(0);
    expect(result.registryFingerprint).toBe('0');

    const codes = result.notes.map((n) => n.code);
    expect(codes).toContain('RESOLVER_STRATEGIES_APPLIED');
  });

  it('delegates to HTTP resolver and propagates registry fingerprint', async () => {
    const registry = new ResolutionRegistry();
    registry.add({
      uri: 'https://example.com/external.schema.json',
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'string',
      },
      contentHash: 'abc123',
    });

    const spy = vi
      .spyOn(HttpResolver, 'prefetchAndBuildRegistry')
      .mockResolvedValue({
        registry,
        diagnostics: [
          {
            code: 'RESOLVER_CACHE_HIT',
            canonPath: '#',
            details: {
              ref: 'https://example.com/external.schema.json',
              contentHash: 'abc123',
            },
          },
        ],
        cacheDir: '/tmp/fd-resolver-cache',
      });

    const schemaWithExternal = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        ext: { $ref: 'https://example.com/external.schema.json' },
      },
    } as const;

    const options: ResolverOptions = {
      ...baseOptions,
      strategies: ['local', 'remote'],
      allowHosts: ['example.com'],
    };

    const result = await resolveAllExternalRefs(
      schemaWithExternal as object,
      options
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.registry.size()).toBe(1);
    expect(result.registryFingerprint).toBe(registry.fingerprint());

    const codes = result.notes.map((n) => n.code);
    expect(codes).toContain('RESOLVER_STRATEGIES_APPLIED');
    expect(codes).toContain('RESOLVER_CACHE_HIT');
  });
});
