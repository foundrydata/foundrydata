import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefetchAndBuildRegistry } from '../../src/resolver/http-resolver.js';

describe('prefetchAndBuildRegistry allow-listing', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore original fetch state between tests
    // @ts-expect-error -- node typings may omit fetch in older targets
    globalThis.fetch = originalFetch;
  });

  it('blocks non-allowed hosts while permitting schemastore by default', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '{}',
    })) as unknown as typeof globalThis.fetch;

    // @ts-expect-error -- assign mock fetch for test
    globalThis.fetch = fetchMock;

    const extRefs = [
      'https://json.schemastore.org/package',
      'https://example.com/external.json',
    ];

    const result = await prefetchAndBuildRegistry(extRefs, {
      strategies: ['remote', 'schemastore'],
      allowHosts: ['json.schemastore.org'],
      maxDocs: 4,
      maxRefDepth: 2,
      maxBytesPerDoc: 1024,
      timeoutMs: 1000,
      followRedirects: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]?.[0];
    expect(String(calledUrl)).toContain('json.schemastore.org');

    const reasons = result.diagnostics.map((d) => d.details?.reason);
    expect(reasons).toContain('host-not-allowed');
    expect(result.registry.size()).toBe(1);
  });

  it('hydrates AsyncAPI aliases without issuing network fetches', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network should not be called for aliases');
    }) as unknown as typeof globalThis.fetch;
    // @ts-expect-error -- assign mock fetch for test
    globalThis.fetch = fetchMock;

    const ref =
      'http://asyncapi.com/definitions/3.0.0/specificationExtension.json';
    const result = await prefetchAndBuildRegistry([ref], {
      strategies: ['local'],
      maxDocs: 8,
      maxRefDepth: 1,
      maxBytesPerDoc: 5 * 1024 * 1024,
      timeoutMs: 1000,
      followRedirects: 0,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    const aliased = result.registry.get(ref);
    expect(aliased).toBeDefined();
    const aliasNote = result.diagnostics.find(
      (d) =>
        d.code === 'RESOLVER_CACHE_HIT' &&
        (d.details as { alias?: string } | undefined)?.alias === 'asyncapi-3.0'
    );
    expect(aliasNote).toBeDefined();
  });
});
