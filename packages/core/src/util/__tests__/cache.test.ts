import { describe, it, expect } from 'vitest';
import type Ajv from 'ajv';

import {
  buildBranchMemoKey,
  createCacheKeyContext,
  createPlanOptionsSubKey,
  createSchemaCache,
  createSchemaCachePool,
  SchemaCache,
  SchemaCachePool,
  type CacheKeyContext,
} from '../cache';
import { resolveOptions, type PlanOptions } from '../../types/options';

function createStubAjv(flags: Record<string, unknown>): Ajv {
  const stub = {
    version: '8.12.3',
    opts: { ...flags },
    __fd_ajvClass: 'Ajv2020',
  };
  return stub as unknown as Ajv;
}

function defaultContext(overrides: Partial<CacheKeyContext> = {}): {
  context: CacheKeyContext;
  ajv: Ajv;
} {
  const baseFlags = {
    validateFormats: true,
    allowUnionTypes: true,
    strictTypes: true,
    strictSchema: true,
    unicodeRegExp: true,
    coerceTypes: false,
    multipleOfPrecision: 12,
    discriminator: false,
  };
  const ajv = createStubAjv(baseFlags);
  const context = {
    ...createCacheKeyContext({ ajv }),
    ...overrides,
  };
  return { context, ajv };
}

describe('createPlanOptionsSubKey', () => {
  it('serializes specified fields with sorted keys and normalized strategy', () => {
    const options: Partial<PlanOptions> = {
      conditionals: {
        strategy: 'rewrite',
        minThenSatisfaction: 'required-only',
      },
      guards: { maxDynamicScopeHops: 5 },
      rational: { decimalPrecision: 9, maxRatBits: 256 },
      trials: { skipTrials: true },
    };

    const subKey = createPlanOptionsSubKey(options);
    const parsed = JSON.parse(subKey) as Record<string, unknown>;

    expect(parsed['conditionals.strategy']).toBe('if-aware-lite');
    expect(parsed['guards.maxDynamicScopeHops']).toBe(5);
    expect(parsed['rational.decimalPrecision']).toBe(9);
    expect(parsed['rational.maxRatBits']).toBe(256);
    expect(parsed['trials.skipTrials']).toBe(true);

    const keys = Object.keys(parsed);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  it('includes defaults from resolved options when partial input omitted values', () => {
    const subKey = createPlanOptionsSubKey();
    const parsed = JSON.parse(subKey) as Record<string, unknown>;

    expect(parsed['rational.decimalPrecision']).toBe(12);
    expect(parsed['guards.maxDynamicScopeHops']).toBe(2);
    expect(parsed['complexity.maxOneOfBranches']).toBe(200);
  });

  it('captures exclusivity string tweak preference in the subkey', () => {
    const preferNul = createPlanOptionsSubKey({
      conditionals: { exclusivityStringTweak: 'preferNul' },
    });
    const preferAscii = createPlanOptionsSubKey({
      conditionals: { exclusivityStringTweak: 'preferAscii' },
    });

    expect(preferNul).not.toBe(preferAscii);
    expect(preferAscii).toContain(
      '"conditionals.exclusivityStringTweak":"preferAscii"'
    );
  });
});

describe('createCacheKeyContext', () => {
  it('captures AJV metadata and PlanOptionsSubKey in a stable payload', () => {
    const flags = {
      validateFormats: false,
      allowUnionTypes: false,
      strictTypes: true,
      strictSchema: true,
      unicodeRegExp: true,
      coerceTypes: 'array',
      multipleOfPrecision: 8,
      discriminator: true,
    };
    const ajv = createStubAjv(flags);
    const planOptions: Partial<PlanOptions> = {
      guards: { maxDynamicScopeHops: 4 },
      conditionals: { strategy: 'rewrite' },
    };

    const context = createCacheKeyContext({
      ajv,
      planOptions,
      userSalt: 'compose-phase',
    });

    expect(context.ajvMajor).toBe(8);
    expect(context.ajvClass).toBe('Ajv2020');
    expect(context.userSalt).toBe('compose-phase');
    expect(context.ajvFlags).toEqual({
      allowUnionTypes: false,
      coerceTypes: 'array',
      discriminator: true,
      multipleOfPrecision: 8,
      strictSchema: true,
      strictTypes: true,
      unicodeRegExp: true,
      validateFormats: false,
    });
    expect(context.planOptionsSubKey).toContain(
      '"guards.maxDynamicScopeHops":4'
    );
    expect(context.planOptionsSubKey).toContain(
      '"conditionals.strategy":"if-aware-lite"'
    );
  });
});

describe('buildBranchMemoKey', () => {
  it('builds memo key including AJV metadata, PlanOptionsSubKey, and optional user key', () => {
    const { ajv } = defaultContext();
    const baseContext = createCacheKeyContext({
      ajv,
      planOptions: { guards: { maxDynamicScopeHops: 3 } },
      userSalt: 'compose',
    });

    const key = buildBranchMemoKey({
      canonPath: '/oneOf/0',
      seed: 42,
      context: baseContext,
      userKey: { sample: true },
    });

    const parsed = JSON.parse(key) as Record<string, unknown>;
    expect(parsed.canonPath).toBe('/oneOf/0');
    expect(parsed.seed).toBe(42);
    expect(parsed.ajvMajor).toBe(baseContext.ajvMajor);
    expect(parsed.ajvClass).toBe(baseContext.ajvClass);
    expect(parsed.planOptionsSubKey).toBe(baseContext.planOptionsSubKey);
    expect(parsed.userSalt).toBe('compose');
    expect(parsed.userKey).toEqual({ sample: true });
    expect(parsed.ajvFlags).toEqual(baseContext.ajvFlags);
  });
});

describe('SchemaCache', () => {
  const defaultOptions = {
    preferWeakMap: true,
    useId: true,
    hashIfBytesLt: 1_000_000,
    lruSize: 4,
  };

  function context(): CacheKeyContext {
    return defaultContext().context;
  }

  it('prefers identity caching when enabled', () => {
    const cache = new SchemaCache<string>(defaultOptions);
    const schema = { type: 'string' };
    const ctx = context();

    cache.set(schema, ctx, 'value');
    expect(cache.get(schema, ctx)).toBe('value');
  });

  it('falls back to $id caching when identity differs', () => {
    const cache = new SchemaCache<string>({
      ...defaultOptions,
      preferWeakMap: false,
    });
    const ctx = context();
    const schemaA = { $id: 'urn:test:a', type: 'string' };

    cache.set(schemaA, ctx, 'value-a');
    const schemaB = { $id: 'urn:test:a', type: 'integer' };
    expect(cache.get(schemaB, ctx)).toBe('value-a');
  });

  it('uses stable hash fallback when $id unavailable', () => {
    const cache = new SchemaCache<string>({
      preferWeakMap: false,
      useId: false,
      hashIfBytesLt: 4_096,
      lruSize: 8,
    });
    const ctx = context();
    const schemaA = { type: 'number', minimum: 0, maximum: 10 };

    cache.set(schemaA, ctx, 'numeric');
    const schemaB = { maximum: 10, minimum: 0, type: 'number' };
    expect(cache.get(schemaB, ctx)).toBe('numeric');
  });

  it('does not cache large canonical schemas beyond threshold', () => {
    const cache = new SchemaCache<string>({
      preferWeakMap: false,
      useId: false,
      hashIfBytesLt: 8,
      lruSize: 4,
    });
    const ctx = context();
    const schemaA = { type: 'array', items: { type: 'string' } };

    cache.set(schemaA, ctx, 'array-items');
    const schemaB = { items: { type: 'string' }, type: 'array' };
    expect(cache.get(schemaB, ctx)).toBeUndefined();
  });

  it('evicts least-recently-used string-keyed entries', () => {
    const cache = new SchemaCache<string>({
      preferWeakMap: false,
      useId: true,
      hashIfBytesLt: 4_096,
      lruSize: 2,
    });
    const ctx = context();

    cache.set({ $id: 'urn:a' }, ctx, 'A');
    cache.set({ $id: 'urn:b' }, ctx, 'B');
    cache.set({ $id: 'urn:c' }, ctx, 'C'); // should evict 'urn:a'

    expect(cache.get({ $id: 'urn:a' }, ctx)).toBeUndefined();
    expect(cache.get({ $id: 'urn:b' }, ctx)).toBe('B');
    expect(cache.get({ $id: 'urn:c' }, ctx)).toBe('C');
  });

  it('distinguishes entries by cache context components', () => {
    const cache = new SchemaCache<string>({
      ...defaultOptions,
      useId: false,
    });
    const schema = { type: 'object' };
    const resolved = resolveOptions();
    const ctxA = createCacheKeyContext({
      ajv: createStubAjv({
        validateFormats: true,
        allowUnionTypes: true,
        strictTypes: true,
        strictSchema: true,
        unicodeRegExp: true,
        coerceTypes: false,
        multipleOfPrecision: 12,
        discriminator: false,
      }),
      planOptions: resolved,
      userSalt: 'A',
    });
    const ctxB = createCacheKeyContext({
      ajv: createStubAjv({
        validateFormats: true,
        allowUnionTypes: true,
        strictTypes: true,
        strictSchema: true,
        unicodeRegExp: true,
        coerceTypes: false,
        multipleOfPrecision: 12,
        discriminator: false,
      }),
      planOptions: resolved,
      userSalt: 'B',
    });

    cache.set(schema, ctxA, 'value-A');
    cache.set(schema, ctxB, 'value-B');

    expect(cache.get(schema, ctxA)).toBe('value-A');
    expect(cache.get(schema, ctxB)).toBe('value-B');
  });

  it('supports factory creation via createSchemaCache', () => {
    const cache = createSchemaCache<string>();
    const ctx = context();
    const schema = { $id: 'urn:factory:test' };

    cache.set(schema, ctx, 'factory');
    expect(cache.get(schema, ctx)).toBe('factory');
  });
});

describe('SchemaCachePool', () => {
  it('separates LRU spaces for source and planning', () => {
    const pool: SchemaCachePool<string> = createSchemaCachePool<string>({
      cache: {
        preferWeakMap: false,
        useId: true,
        hashIfBytesLt: 4096,
        lruSize: 2,
      },
    });
    const ctx = defaultContext().context;

    const src = pool.get('source');
    const plan = pool.get('planning');

    const schema = { $id: 'urn:sep:test' };

    src.set(schema, ctx, 'SRC');
    expect(src.get(schema, ctx)).toBe('SRC');
    // planning space should not see source entries
    expect(plan.get(schema, ctx)).toBeUndefined();

    plan.set(schema, ctx, 'PLAN');
    expect(plan.get(schema, ctx)).toBe('PLAN');
    // source space remains unaffected
    expect(src.get(schema, ctx)).toBe('SRC');
  });

  it('maintains independent LRU eviction across spaces', () => {
    const pool = createSchemaCachePool<string>({
      cache: {
        preferWeakMap: false,
        useId: true,
        hashIfBytesLt: 4096,
        lruSize: 1,
      },
    });
    const ctx = defaultContext().context;

    const src = pool.get('source');
    const plan = pool.get('planning');

    src.set({ $id: 'urn:s:a' }, ctx, 'SA');
    src.set({ $id: 'urn:s:b' }, ctx, 'SB'); // evicts SA in source
    expect(src.get({ $id: 'urn:s:a' }, ctx)).toBeUndefined();
    expect(src.get({ $id: 'urn:s:b' }, ctx)).toBe('SB');

    // planning remains independent
    plan.set({ $id: 'urn:p:a' }, ctx, 'PA');
    expect(plan.get({ $id: 'urn:p:a' }, ctx)).toBe('PA');
  });
});
