/* eslint-disable complexity */
/**
 * ================================================================================
 * STATEFUL TESTING PATTERN - FOUNDRYDATA TESTING v2.1
 *
 * Phase 2 - Model-based testing with state consistency using fast-check commands().
 * Implements a deterministic state machine validating invariants after each step.
 *
 * Key goals:
 * - Deterministic reproducibility (seed = 424242)
 * - AJV oracle validation after each state transition
 * - WeakMap-backed cache tracking validator compilations and hit/miss metrics
 * - State recovery and reset behavior
 * - Cache effectiveness and size constraints (simulated index for introspection)
 * ================================================================================
 */

import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import {
  getAjv,
  createAjv,
  type JsonSchemaDraft,
} from '../helpers/ajv-factory';
// Register global core/advanced matchers (toMatchJsonSchema, etc.)
import '../matchers';
import {
  simpleSchemaArbitrary,
  type JsonSchemaDraft as Draft,
} from '../arbitraries/json-schema';
import { propertyTest, getTestConfig } from '../setup';

// ============================================================================
// TYPES AND STATE
// ============================================================================

type SupportedDraft = Draft; // alias for clarity

type GenerationMetrics = {
  generated: number;
  validated: number;
  cacheHits: number;
  cacheMisses: number;
  compilations: number;
};

type CacheState = {
  // Underlying WeakMap for compiled validators
  store: WeakMap<object, any>;
  // Side index for introspection (WeakMap has no size())
  index: Map<object, true>;
  // Approx memory usage proxy in bytes (simulated)
  approxBytes: number;
  // Max cache entries allowed (soft limit for test invariant)
  maxEntries: number;
};

type ScenarioContext = {
  draft: SupportedDraft;
  seed: number;
  // Placeholder for future flags (validation rule toggles)
  rules?: Record<string, boolean>;
};

type SystemState = {
  scenario: ScenarioContext;
  metrics: GenerationMetrics;
  cache: CacheState;
  // Current working schema and last generated data
  schema: Record<string, unknown> | null;
  lastData: unknown;
};

// ============================================================================
// HELPERS
// ============================================================================

const DEFAULT_SEED = 424242; // fixed seed per testing v2.1

function initialState(): SystemState {
  return {
    scenario: {
      draft: (process.env.SCHEMA_DRAFT as SupportedDraft) || '2020-12',
      seed: DEFAULT_SEED,
      rules: {},
    },
    metrics: {
      generated: 0,
      validated: 0,
      cacheHits: 0,
      cacheMisses: 0,
      compilations: 0,
    },
    cache: {
      store: new WeakMap(),
      index: new Map(),
      approxBytes: 0,
      maxEntries: 256,
    },
    schema: null,
    lastData: undefined,
  };
}

// Deterministic RNG (LCG) for seed propagation inside commands
function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// Pick first enum/const or fallback default by type
function generateFromSchema(
  schema: Record<string, unknown>,
  seed: number
): unknown {
  const rng = seededRng(seed);
  // Enum takes precedence
  if (Array.isArray(schema.enum) && (schema.enum as unknown[]).length > 0) {
    const list = schema.enum as unknown[];
    return list[Math.floor(rng() * list.length) % list.length];
  }
  if (schema.const !== undefined) return schema.const;

  switch (schema.type) {
    case 'string': {
      const min = typeof schema.minLength === 'number' ? schema.minLength : 1;
      const max =
        typeof schema.maxLength === 'number'
          ? schema.maxLength
          : Math.max(min, 8);
      const len = Math.min(
        Math.max(min, Math.floor(rng() * (max - min + 1)) + min),
        max
      );
      return 'x'.repeat(len);
    }
    case 'number':
    case 'integer': {
      const min = typeof schema.minimum === 'number' ? schema.minimum : 0;
      const max =
        typeof schema.maximum === 'number'
          ? schema.maximum
          : Math.max(min, 100);
      const n = Math.floor(rng() * (max - min + 1)) + min;
      return schema.type === 'integer' ? n | 0 : Number(n);
    }
    case 'boolean':
      return rng() > 0.5;
    case 'null':
      return null;
    case 'array': {
      // Simple arrays only (items is a primitive type schema)
      const minItems =
        typeof schema.minItems === 'number' ? schema.minItems : 0;
      const maxItems =
        typeof schema.maxItems === 'number'
          ? schema.maxItems
          : Math.max(minItems, 3);
      const size = Math.min(
        Math.max(
          minItems,
          Math.floor(rng() * (maxItems - minItems + 1)) + minItems
        ),
        maxItems
      );
      const itemSchema = (schema.items || { type: 'string' }) as Record<
        string,
        unknown
      >;
      return Array.from({ length: size }, () =>
        generateFromSchema(itemSchema, seed)
      );
    }
    case 'object': {
      const props = (schema.properties || {}) as Record<
        string,
        Record<string, unknown>
      >;
      const required = (schema.required as string[]) || [];
      const obj: Record<string, unknown> = {};
      for (const key of Object.keys(props)) {
        const propSchema = (props[key] ?? { type: 'string' }) as Record<
          string,
          unknown
        >;
        if (required.includes(key)) {
          obj[key] = generateFromSchema(propSchema, seed);
        } else if (rng() > 0.5) {
          obj[key] = generateFromSchema(propSchema, seed);
        }
      }
      return obj;
    }
    default:
      return 'fd-default';
  }
}

function getOrCompileValidator(
  state: SystemState,
  draft: SupportedDraft,
  schema: Record<string, unknown>
): any {
  // Use separate ajv per draft for strictness alignment
  const ajv = draft ? createAjv(draft as JsonSchemaDraft) : getAjv();

  // Check cache
  if (state.cache.store.has(schema as object)) {
    state.metrics.cacheHits++;
    const validator = state.cache.store.get(schema as object);
    return validator;
  }

  // Compile and cache
  const validator = ajv.compile(schema);
  state.metrics.cacheMisses++;
  state.metrics.compilations++;
  state.cache.store.set(schema as object, validator);
  state.cache.index.set(schema as object, true);
  // Approx memory: assume ~2KB per compiled validator (arbitrary proxy)
  state.cache.approxBytes = state.cache.index.size * 2048;
  return validator;
}

// ============================================================================
// CUSTOM MATCHERS (LOCAL TO THIS SUITE)
// ============================================================================

function toMaintainInvariant(received: SystemState): {
  pass: boolean;
  message: () => string;
  actual: unknown;
  expected: unknown;
} {
  const { metrics, cache, schema, lastData, scenario } = received;
  const totalLookups = metrics.cacheHits + metrics.cacheMisses;
  const hitRate = totalLookups > 0 ? metrics.cacheHits / totalLookups : 0;
  const cacheSizeOk = cache.index.size <= cache.maxEntries;

  // If we have both schema and data, ensure AJV validates it
  let validationOk = true;
  if (schema && typeof lastData !== 'undefined') {
    try {
      const ajv = createAjv(scenario.draft);
      const validate = ajv.compile(schema);
      validationOk = Boolean(validate(lastData));
    } catch {
      validationOk = false;
    }
  }

  const pass =
    cacheSizeOk &&
    validationOk &&
    hitRate >= 0 &&
    metrics.compilations >= metrics.cacheMisses;

  return {
    pass,
    message: () =>
      `Expected state invariants to hold. Details: {cacheSize:${cache.index.size}/${cache.maxEntries}, hitRate:${hitRate.toFixed(2)}, compilations:${metrics.compilations}, misses:${metrics.cacheMisses}}`,
    actual: received,
    expected: 'valid invariant state',
  };
}

function toHaveValidState(received: SystemState): {
  pass: boolean;
  message: () => string;
  actual: unknown;
  expected: unknown;
} {
  const { schema, lastData, scenario } = received;
  if (!schema) {
    return {
      pass: true,
      message: () => 'No schema set; state is trivially valid',
      actual: received,
      expected: 'schema present or trivial state',
    };
  }
  try {
    const ajv = createAjv(scenario.draft);
    const validate = ajv.compile(schema);
    const ok = Boolean(validate(lastData));
    return {
      pass: ok,
      message: () => `Expected lastData to validate against current schema`,
      actual: received,
      expected: 'data matches schema',
    };
  } catch (e) {
    return {
      pass: false,
      message: () => `Failed to compile/validate schema: ${String(e)}`,
      actual: received,
      expected: 'compilable schema and valid data',
    };
  }
}

function toHaveHitRate(
  received: SystemState,
  expectedMinRate: number,
  tolerance = 0.0
): {
  pass: boolean;
  message: () => string;
  actual: unknown;
  expected: unknown;
} {
  const total = received.metrics.cacheHits + received.metrics.cacheMisses;
  const hitRate = total > 0 ? received.metrics.cacheHits / total : 0;
  const pass = hitRate + tolerance >= expectedMinRate;
  return {
    pass,
    message: () =>
      `Expected cache hit rate ${hitRate.toFixed(2)} to be >= ${expectedMinRate} (±${tolerance})`,
    actual: hitRate,
    expected: `>= ${expectedMinRate}`,
  };
}

function toCacheEffectively(received: SystemState): {
  pass: boolean;
  message: () => string;
  actual: unknown;
  expected: unknown;
} {
  // Simple heuristic: after some validations, we expect at least 1 cache hit if same schema reused
  const { metrics, cache } = received;
  const total = metrics.cacheHits + metrics.cacheMisses;
  const effective =
    cache.index.size === 0 ? true : metrics.cacheHits >= 1 || total < 2;
  return {
    pass: effective,
    message: () =>
      `Expected cache to show effectiveness (hits>=1 when reused). Hits=${metrics.cacheHits}, Misses=${metrics.cacheMisses}, Size=${cache.index.size}`,
    actual: {
      hits: metrics.cacheHits,
      misses: metrics.cacheMisses,
      size: cache.index.size,
    },
    expected: 'at least one cache hit when schema reused',
  };
}

declare module 'vitest' {
  interface Assertion<T = any> {
    toMaintainInvariant(): T;
    toHaveValidState(): T;
    toHaveHitRate(expectedMinRate: number, tolerance?: number): T;
    toCacheEffectively(): T;
  }
  interface AsymmetricMatchersContaining {
    toMaintainInvariant(): any;
    toHaveValidState(): any;
    toHaveHitRate(expectedMinRate: number, tolerance?: number): any;
    toCacheEffectively(): any;
  }
}

expect.extend({
  toMaintainInvariant,
  toHaveValidState,
  toHaveHitRate,
  toCacheEffectively,
});

// ============================================================================
// COMMANDS (MODEL-BASED TESTING)
// ============================================================================

type Model = SystemState;
type Real = SystemState;

class SetScenarioCommand implements fc.Command<Model, Real> {
  constructor(
    private readonly draft: SupportedDraft,
    private readonly seed: number
  ) {}
  check(_m: Model): boolean {
    return true;
  }
  run(m: Model, r: Real): void {
    m.scenario.draft = this.draft;
    m.scenario.seed = this.seed;
    r.scenario.draft = this.draft;
    r.scenario.seed = this.seed;
    // Changing draft invalidates validators logically; keep schema, reset cache
    m.cache = {
      store: new WeakMap(),
      index: new Map(),
      approxBytes: 0,
      maxEntries: m.cache.maxEntries,
    };
    r.cache = {
      store: new WeakMap(),
      index: new Map(),
      approxBytes: 0,
      maxEntries: r.cache.maxEntries,
    };
    expect(r).toMaintainInvariant();
  }
  toString: () => string = () =>
    `SetScenario(draft=${this.draft}, seed=${this.seed})`;
}

class CompileSchemaCommand implements fc.Command<Model, Real> {
  constructor(private readonly schema: Record<string, unknown>) {}
  check(_m: Model): boolean {
    return true;
  }
  run(m: Model, r: Real): void {
    m.schema = this.schema;
    r.schema = this.schema;
    // Model: simulate a miss and compilation when first seen
    if (!m.cache.index.has(this.schema as object)) {
      m.metrics.cacheMisses++;
      m.metrics.compilations++;
      m.cache.index.set(this.schema as object, true);
      m.cache.approxBytes = m.cache.index.size * 2048;
    } else {
      m.metrics.cacheHits++;
    }

    // Real: actually compile with AJV and cache in WeakMap
    const validator = getOrCompileValidator(r, r.scenario.draft, this.schema);
    // Generate fresh data to keep state valid against the new schema
    const value = generateFromSchema(this.schema, r.scenario.seed);
    r.lastData = value;
    m.lastData = value;
    r.metrics.generated++;
    m.metrics.generated++;
    // Sanity: validator should be a function and validate the freshly generated data
    expect(typeof validator).toBe('function');
    expect(Boolean(validator(value))).toBe(true);
    expect(r).toMaintainInvariant();
  }
  toString: () => string = () =>
    `CompileSchema(${JSON.stringify(this.schema)})`;
}

class GenerateCommand implements fc.Command<Model, Real> {
  check(_m: Model): boolean {
    return true;
  }
  run(m: Model, r: Real): void {
    if (!m.schema || !r.schema) {
      // Nothing to do until a schema is compiled
      return;
    }
    const seed = m.scenario.seed;
    const value = generateFromSchema(m.schema, seed);
    m.lastData = value;
    r.lastData = value;
    m.metrics.generated++;
    r.metrics.generated++;
    expect(r).toMaintainInvariant();
    if (r.schema) {
      // Validate with AJV oracle immediately after generation
      const ajv = createAjv(r.scenario.draft);
      const validate = ajv.compile(r.schema);
      const ok = Boolean(validate(r.lastData));
      expect(ok).toBe(true);
    }
  }
  toString: () => string = () => 'Generate()';
}

class ValidateCommand implements fc.Command<Model, Real> {
  check(_m: Model): boolean {
    return true;
  }
  run(m: Model, r: Real): void {
    if (!m.schema || !r.schema) return;
    // Ensure there is data to validate; if none, generate deterministically
    if (typeof r.lastData === 'undefined') {
      const value = generateFromSchema(r.schema, r.scenario.seed);
      r.lastData = value;
      m.lastData = value;
      r.metrics.generated++;
      m.metrics.generated++;
    }

    const mHad = m.cache.index.has(m.schema as object);
    // Model: lookup effects
    if (mHad) m.metrics.cacheHits++;
    else {
      m.metrics.cacheMisses++;
      m.metrics.compilations++;
      m.cache.index.set(m.schema as object, true);
      m.cache.approxBytes = m.cache.index.size * 2048;
    }

    // Real: use cached or compile
    const validator = getOrCompileValidator(r, r.scenario.draft, r.schema);
    const ok = Boolean(validator(r.lastData));
    r.metrics.validated++;
    m.metrics.validated++;

    // Consistency with oracle (AJV itself) is intrinsic here
    expect(ok).toBe(true);
    expect(r).toHaveValidState();
    expect(r).toMaintainInvariant();
  }
  toString: () => string = () => 'Validate()';
}

class ClearCacheCommand implements fc.Command<Model, Real> {
  check(_m: Model): boolean {
    return true;
  }
  run(m: Model, r: Real): void {
    m.cache = {
      store: new WeakMap(),
      index: new Map(),
      approxBytes: 0,
      maxEntries: m.cache.maxEntries,
    };
    r.cache = {
      store: new WeakMap(),
      index: new Map(),
      approxBytes: 0,
      maxEntries: r.cache.maxEntries,
    };
    // No metric changes besides future misses expected
    expect(r.cache.index.size).toBe(0);
    expect(r.cache.approxBytes).toBe(0);
    expect(r).toMaintainInvariant();
  }
  toString: () => string = () => 'ClearCache()';
}

class ResetCommand implements fc.Command<Model, Real> {
  check(_m: Model): boolean {
    return true;
  }
  run(m: Model, r: Real): void {
    const mMax = m.cache.maxEntries;
    const rMax = r.cache.maxEntries;
    const mDraft = m.scenario.draft;
    const rDraft = r.scenario.draft;
    Object.assign(m, initialState());
    Object.assign(r, initialState());
    // Preserve limits and current draft across reset to emulate environment policy
    m.cache.maxEntries = mMax;
    r.cache.maxEntries = rMax;
    m.scenario.draft = mDraft;
    r.scenario.draft = rDraft;
    expect(r).toMaintainInvariant();
  }
  toString: () => string = () => 'Reset()';
}

// Deterministic command arbitrary using fixed seed 424242
function commandArbitrary(): fc.Arbitrary<fc.Command<Model, Real>> {
  const draftArb = fc.constantFrom<SupportedDraft>(
    'draft-07',
    '2019-09',
    '2020-12'
  );
  const seedArb = fc.constant(DEFAULT_SEED);
  const setScenario = fc
    .record({ draft: draftArb, seed: seedArb })
    .map(({ draft, seed }) => new SetScenarioCommand(draft, seed));
  const compile = simpleSchemaArbitrary.map((s) => new CompileSchemaCommand(s));
  const generate = fc.constant(new GenerateCommand());
  const validate = fc.constant(new ValidateCommand());
  const clear = fc.constant(new ClearCacheCommand());
  const reset = fc.constant(new ResetCommand());
  return fc.oneof(setScenario, compile, generate, validate, clear, reset);
}

// ============================================================================
// TESTS
// ============================================================================

describe('Stateful Testing Pattern (v2.1)', () => {
  test('model-based state consistency with deterministic commands', async () => {
    const cfg = getTestConfig();

    await propertyTest(
      'stateful model maintains invariants across command sequences',
      fc.property(
        fc.commands([commandArbitrary()], { maxCommands: 50 }),
        (cmds) => {
          // Setup model and real system
          const model = initialState();
          const real = initialState();

          // Execute commands deterministically
          fc.modelRun(() => ({ model, real }), cmds);

          // Final state checks
          expect(real).toMaintainInvariant();
          // Sanity: compilations should be at least misses
          expect(real.metrics.compilations).toBeGreaterThanOrEqual(
            real.metrics.cacheMisses
          );
        }
      ),
      {
        parameters: { seed: DEFAULT_SEED, endOnFailure: true },
        context: {
          pattern: 'stateful',
          seed: DEFAULT_SEED,
          numRuns: cfg.numRuns,
        },
      }
    );
  });

  test('cache metrics behave within expected bounds', () => {
    const state = initialState();
    // Prime with a schema
    const schema = { type: 'string', minLength: 1 } as const;
    // First compile -> miss
    const v1 = getOrCompileValidator(
      state,
      state.scenario.draft,
      schema as any
    );
    expect(typeof v1).toBe('function');
    // Second validate -> hit
    const v2 = getOrCompileValidator(
      state,
      state.scenario.draft,
      schema as any
    );
    expect(typeof v2).toBe('function');

    // Hit rate should be >= 0.5 now
    expect(state).toHaveHitRate(0.5);
    expect(state).toMaintainInvariant();
  });
});
