import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, vi, afterEach } from 'vitest';

import { executePipeline, DIAGNOSTIC_CODES } from '../../index.js';

const EXTERNAL_REF = 'https://example.com/schemas/external.json';

describe('Resolver observability across offline/cache paths', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      // @ts-expect-error allow cleanup
      delete globalThis.fetch;
    }
  });

  it('emits strategies + offline + stubbed notes under local-only strategy', async () => {
    const result = await executePipeline(
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { ext: { $ref: EXTERNAL_REF } },
      },
      {
        mode: 'lax',
        generate: {
          count: 1,
          planOptions: {
            resolver: {
              strategies: ['local'],
              stubUnresolved: 'emptySchema',
            },
          },
        },
        validate: { validateFormats: false },
      }
    );

    expect(result.status).toBe('completed');
    const compose = result.stages.compose.output!;
    const run = compose.diag?.run ?? [];
    const codes = run.map((r) => r.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        DIAGNOSTIC_CODES.RESOLVER_STRATEGIES_APPLIED,
        DIAGNOSTIC_CODES.RESOLVER_OFFLINE_UNAVAILABLE,
        DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED,
        DIAGNOSTIC_CODES.EXTERNAL_REF_STUBBED,
      ])
    );
    for (const entry of run) {
      expect(entry.canonPath).toBe('#');
    }
    const warns = compose.diag?.warn ?? [];
    expect(
      warns.some((w) => w.code === DIAGNOSTIC_CODES.EXTERNAL_REF_STUBBED)
    ).toBe(true);
  });

  // eslint-disable-next-line complexity
  it('emits cache miss then cache hit deterministically with stable fingerprint', async () => {
    const tmpCache = mkdtempSync(join(tmpdir(), 'fd-resolver-cache-'));
    const mockSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { foo: { type: 'string' } },
    };

    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockSchema),
      };
    });
    // @ts-expect-error mock fetch for resolver prefetch
    globalThis.fetch = fetchMock;

    const baseOptions = {
      mode: 'lax' as const,
      generate: {
        count: 1,
        planOptions: {
          resolver: {
            strategies: ['remote'] as Array<'remote'>,
            allowHosts: ['example.com'],
            cacheDir: tmpCache,
          },
        },
      },
      validate: { validateFormats: false },
    };

    const schemaWithExternal = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        ext: { $ref: EXTERNAL_REF },
      },
    };

    const first = await executePipeline(schemaWithExternal, baseOptions);
    expect(first.status).toBe('completed');
    const firstRun = first.stages.compose.output?.diag?.run ?? [];
    const firstCodes = firstRun.map((r) => r.code);
    expect(firstCodes).toEqual(
      expect.arrayContaining([
        DIAGNOSTIC_CODES.RESOLVER_STRATEGIES_APPLIED,
        DIAGNOSTIC_CODES.RESOLVER_CACHE_MISS_FETCHED,
      ])
    );
    const firstFingerprint =
      (
        firstRun.find(
          (r) => r.code === DIAGNOSTIC_CODES.RESOLVER_STRATEGIES_APPLIED
        )?.details as { registryFingerprint?: string } | undefined
      )?.registryFingerprint ?? '';
    expect(firstFingerprint.length).toBeGreaterThan(0);

    // Run again to exercise cache hit path and ensure fetch is not called again.
    const second = await executePipeline(schemaWithExternal, baseOptions);
    expect(second.status).toBe('completed');
    const secondRun = second.stages.compose.output?.diag?.run ?? [];
    const secondCodes = secondRun.map((r) => r.code);
    expect(secondCodes).toEqual(
      expect.arrayContaining([
        DIAGNOSTIC_CODES.RESOLVER_STRATEGIES_APPLIED,
        DIAGNOSTIC_CODES.RESOLVER_CACHE_HIT,
      ])
    );
    expect(secondCodes).not.toContain(
      DIAGNOSTIC_CODES.RESOLVER_CACHE_MISS_FETCHED
    );

    const secondFingerprint =
      (
        secondRun.find(
          (r) => r.code === DIAGNOSTIC_CODES.RESOLVER_STRATEGIES_APPLIED
        )?.details as { registryFingerprint?: string } | undefined
      )?.registryFingerprint ?? '';
    expect(secondFingerprint).toBe(firstFingerprint);

    for (const entry of [...firstRun, ...secondRun]) {
      expect(entry.canonPath).toBe('#');
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rmSync(tmpCache, { recursive: true, force: true });
  });
});
