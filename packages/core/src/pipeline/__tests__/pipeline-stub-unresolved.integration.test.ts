import { describe, expect, it, vi, afterEach } from 'vitest';

import { executePipeline } from '../orchestrator.js';
import { buildExternalRefProbeSchema } from '../../util/modes.js';
import { ResolutionRegistry } from '../../resolver/registry.js';
import * as resolverOptions from '../../resolver/options.js';

const externalRef = 'http://example.com/ext.json#/Foo';

function makeCanonicalSchema(): Record<string, unknown> {
  return { $ref: externalRef };
}

function makeNormalizeResult(schema: unknown): {
  schema: unknown;
  ptrMap: Map<string, string>;
  revPtrMap: Map<string, string[]>;
  notes: unknown[];
} {
  return {
    schema,
    ptrMap: new Map<string, string>(),
    revPtrMap: new Map<string, string[]>(),
    notes: [],
  };
}

const noopComposeResult = (
  canonical: ReturnType<typeof makeNormalizeResult>
): unknown => ({
  canonical,
  coverageIndex: new Map(),
  containsBag: [],
  diag: {},
});

const noopGenerateResult = {
  items: [],
  diagnostics: [],
  metrics: {},
  seed: 0,
};

const pipelineOptions = {
  mode: 'lax' as const,
  generate: {
    planOptions: {
      resolver: { stubUnresolved: 'emptySchema' as const },
    },
  },
};

describe('resolver stubUnresolved handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stubs only unresolved external refs and preserves canonical input', async () => {
    const canonical = makeCanonicalSchema();
    const normalizeResult = makeNormalizeResult(canonical);
    const composeSchemaSeen: unknown[] = [];

    vi.spyOn(resolverOptions, 'resolveAllExternalRefs').mockResolvedValue({
      registry: new ResolutionRegistry(),
      notes: [],
      registryFingerprint: 'abc',
      cacheDir: undefined,
    });

    const { probe } = buildExternalRefProbeSchema(canonical);

    const result = await executePipeline(canonical, pipelineOptions, {
      normalize: () => normalizeResult,
      compose: (input) => {
        composeSchemaSeen.push(input.schema);
        return noopComposeResult(normalizeResult);
      },
      generate: () => noopGenerateResult,
      repair: (items) => items,
      validate: () => ({ valid: true }),
    });

    expect(result.status).toBe('completed');
    expect(composeSchemaSeen[0]).toEqual(probe);
    expect(
      result.artifacts.effective?.diag?.warn?.some(
        (w) => w.code === 'EXTERNAL_REF_STUBBED'
      )
    ).toBe(true);
  });

  it('does not stub refs already present in resolver registry', async () => {
    const canonical = makeCanonicalSchema();
    const normalizeResult = makeNormalizeResult(canonical);
    const composeSchemaSeen: unknown[] = [];

    const registry = new ResolutionRegistry();
    registry.add({
      uri: 'http://example.com/ext.json',
      schema: { type: 'string' },
      contentHash: 'deadbeef',
      meta: { contentHash: 'deadbeef' },
    });

    vi.spyOn(resolverOptions, 'resolveAllExternalRefs').mockResolvedValue({
      registry,
      notes: [],
      registryFingerprint: 'abc',
      cacheDir: undefined,
    });

    const result = await executePipeline(canonical, pipelineOptions, {
      normalize: () => normalizeResult,
      compose: (input) => {
        composeSchemaSeen.push(input.schema);
        return noopComposeResult(normalizeResult);
      },
      generate: () => noopGenerateResult,
      repair: (items) => items,
      validate: () => ({ valid: true }),
    });

    expect(result.status).toBe('completed');
    expect(composeSchemaSeen[0]).toEqual(canonical);
    expect(result.artifacts.effective?.diag?.warn).toBeUndefined();
  });
});
