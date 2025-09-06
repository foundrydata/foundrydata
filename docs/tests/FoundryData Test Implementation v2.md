# 📋 FoundryData Test Implementation v2.1 - Task List

## Phase 0: Analysis & Preparation

```markdown
## Task 0: Inventory Current Test Implementation
- Count and list all existing test files in packages/
- For each test file, document:
  * Number of tests
  * Uses fast-check? (yes/no)
  * Uses Result pattern? (yes/no)
  * Uses FormatRegistry? (yes/no)
  * Current coverage %
- Run existing tests and document:
  * Which tests pass/fail currently
  * Execution time per test suite
  * Any flaky tests identified
- Check current dependencies versions:
  * fast-check version
  * vitest version
  * ajv version (if present)
- Document current test commands in package.json
- Create CURRENT_STATE.md with this inventory
```

## Phase 1: Foundation Setup

```markdown
## Task 1: Setup Test Configuration Infrastructure
- Create test/setup.ts with fast-check global configuration
  * Fixed seed=424242 from TEST_SEED env
  * numRuns from FC_NUM_RUNS env (100 local, 1000 CI)
  * Configure global AJV instance
- Create test/global-setup.ts for pre-test initialization
- Create test/global-teardown.ts for post-test cleanup
- Update vitest.config.ts:
  * Pool selection: process.platform === 'win32' ? 'threads' : 'forks'
  * retry: 0 (no retries for determinism)
  * sequence.shuffle: false in CI
  * sequence.seed: 1 in CI, TEST_SEED in local
- Install missing dependencies:
  * ajv@8.x, ajv-formats@3.x
  * ajv-formats-draft2019@1.x
  * @vitest/coverage-v8
- Verify setup with: npm test -- --run test/setup.test.ts

## Task 2: Create AJV Factory System
- Create test/helpers/ajv-factory.ts
- Implement createAjv(draft: JsonSchemaDraft) function
  * Support draft-07, 2019-09, 2020-12
  * Configure with allowUnionTypes: false
  * Configure with validateFormats: true
  * Add WeakMap cache for compiled validators
- Implement getAjv() singleton function
- Add draft-specific format loading (ajv-formats vs ajv-formats-draft2019)
- Create unit tests for AJV factory
- Verify each draft validates correctly

## Task 3: Implement Custom Vitest Matchers
- Create test/matchers/index.ts
- Implement toMatchJsonSchema(schema) using cached AJV
- Implement toBeWithinRange(min, max) for numbers
- Implement toHaveCompliance(expected) for compliance scores
- Implement toBeValidUUID() for UUID v4
- Implement toBeValidEmail() using AJV format
- Implement toBeValidISO8601() using AJV date-time
- Implement toBeDistinct(deep) with stable stringify (sorted keys)
- Implement toHaveErrorRate(rate, tolerance) with zero division protection
- Implement toBeGeneratedWithSeed({seed, schema, generate})
- Register matchers with expect.extend()
- Create test/matchers/__tests__/matchers.test.ts

## Task 4: Create JSON Schema Arbitraries
- Create test/arbitraries/json-schema.ts
- Implement createBounds(min, max) helper
- Implement jsonSchemaArbitraryFor(draft: JsonSchemaDraft):
  * stringSchema with valid enum/const respecting minLength/maxLength
  * numberSchema with valid enum/const respecting bounds
  * booleanSchema with enum/const support
  * nullSchema basic implementation
  * objectSchema with required ⊆ properties
  * arraySchema with draft-specific items/prefixItems
  * combinedSchema (allOf, anyOf, oneOf, not)
  * conditionalSchema (if/then/else)
- Handle draft-specific keywords:
  * draft-07: dependencies
  * 2019-09+: dependentRequired, dependentSchemas, unevaluatedProperties, unevaluatedItems
- Implement getSchemaArbitrary() using process.env.SCHEMA_DRAFT
- Create tests verifying no contradictions possible

## Task 5: Create Business Scenario Arbitraries
- Create test/arbitraries/business.ts
- Implement businessScenarioArbitrary:
  * scenario: 'normal' | 'edge' | 'peak' | 'error'
  * load: {users, requestsPerSecond, duration, rampUp, rampDown}
  * distribution: {normal, edge, error} where sum = 1
  * errorConfig: {rate, types[], retryable, maxRetries}
  * edgeCases: boolean flags for edge case types
  * seed: integer for determinism
  * metadata: {name, description, tags, version}
- Create tests for distribution sum validation
- Create tests for seed generation

## Task 6: Format Registry Integration Strategy
- Analyze current FormatRegistry usage in existing tests
- Compare FormatRegistry capabilities with AJV formats
- Decision: Keep, Replace, or Adapter pattern
- If Adapter needed:
  * Create test/helpers/format-adapter.ts
  * Map FormatRegistry formats to AJV formats
  * Ensure backward compatibility
- If Replace:
  * Document migration from FormatRegistry to AJV formats
  * Update all format references
- Update existing tests to use decided approach
```

## Phase 2: Core Test Patterns

```markdown
## Task 7: Implement Invariant Testing Pattern
- Create test/patterns/invariant-testing.test.ts
- Implement "MUST generate 100% schema-compliant data" test:
  * Use getAjv() singleton
  * Use getSchemaArbitrary()
  * Log seed, schema, errors on failure
  * Use fc.readConfigureGlobal().numRuns
- Implement "MUST be deterministic with same seed" test
- Implement "MUST generate correct data types" test
- Implement "MUST respect all boundary constraints" test:
  * Numeric: minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf
  * String: minLength, maxLength, pattern, format
  * Array: minItems, maxItems, uniqueItems
  * Object: minProperties, maxProperties, required
- Test with all drafts via SCHEMA_DRAFT env variable

## Task 8: Implement Metamorphic Testing Pattern
- Create test/patterns/metamorphic-testing.test.ts
- Implement complete relaxSchema(schema, draft) function:
  * Remove all constraint keywords
  * Remove unevaluatedItems/Properties for 2019-09+
  * Handle arrays, objects recursively
  * Handle conditional schemas (if/then/else)
- Implement "validity preserved under relaxation" test
- Implement "prefix stability" test:
  * generate(seed, n1+n2)[0:n1] === generate(seed, n1)
- Test all metamorphic relations with each draft
- Add failure logging with full context

## Task 9: Implement Stateful Testing Pattern
- Create test/patterns/stateful-testing.test.ts
- Define SystemState interface with cache, metrics, scenario
- Define Command union type:
  * generate: {schema, count, seed?}
  * validate: {data, schema}
  * clearCache
  * setScenario: {scenario}
  * compileSchema: {schema}
  * reset
- Implement commandArbitrary using fc.oneof
- Implement state consistency test:
  * Track state changes
  * Verify invariants after each command
  * Check cache size limits
  * Verify metrics consistency
- Test error handling and recovery

## Task 10: Implement Oracle Testing Pattern
- Create test/patterns/oracle-testing.test.ts
- Test: Our validator vs AJV (both should agree)
- Test: Our generator output vs AJV validation
- Test: Format validation consistency
- Log any discrepancies with full context
- Test with complex schemas (nested, combined, conditional)
```

## Phase 3: Migration & Adaptation

````markdown
## Task 11: Create Generator Test Adapter Layer
- Create test/adapters/generator-adapter.ts
- Implement adapter between existing Result<T,E> and test expectations:
  ```typescript
  function adaptResult(result: Result<T,E>): any {
    if (result.isOk()) return result.value;
    throw new ValidationError(result.error);
  }
  ```
- Adapt GeneratorContext to include seed and draft:
  ```typescript
  function createTestContext(schema, seed, draft) {
    const context = createGeneratorContext(schema, formatRegistry);
    return { ...context, seed, draft };
  }
  ```
- Create wrapper for array vs {data: array} API consistency
- Ensure backward compatibility with existing tests

## Task 12: Migrate Boolean Generator Tests
- Open packages/core/src/generator/types/__tests__/boolean-generator.test.ts
- Keep existing Result pattern and test structure
- Add AJV validation after isOk() checks:
  ```typescript
  if (result.isOk()) {
    // Existing assertion
    expect(typeof result.value).toBe('boolean');
    // New AJV validation
    const validate = getAjv().compile(schema);
    expect(validate(result.value)).toBe(true);
  }
  ```
- Replace manual schema arbitrary with getSchemaArbitrary().filter()
- Add seed parameter and logging
- Use fc.readConfigureGlobal().numRuns
- Verify tests pass with all drafts

## Task 13: Migrate String Generator Tests
- Open packages/core/src/generator/types/__tests__/string-generator.test.ts
- Keep existing test structure and patterns
- Add AJV validation layer
- Replace manual arbitraries with filtered getSchemaArbitrary()
- Add comprehensive constraint testing:
  * minLength/maxLength coherence
  * pattern validation
  * format validation (transition from FormatRegistry)
- Add seed logging on failures
- Test with all string formats per draft

## Task 14: Migrate Number/Integer Generator Tests
- Migrate number-generator.test.ts
- Migrate integer-generator.test.ts
- Add AJV validation to existing assertions
- Test exclusive bounds properly (draft-07 vs 2019-09+ differences)
- Test multipleOf with decimals and integers
- Ensure enum/const values respect all constraints
- Add determinism tests with seeds

## Task 15: Migrate Complex Type Generator Tests
- Migrate enum-generator.test.ts
- Migrate array-generator.test.ts (if exists)
- Migrate object-generator.test.ts (if exists)
- Handle draft-specific differences:
  * items vs prefixItems for tuples
  * dependencies vs dependentRequired/dependentSchemas
- Test nested schema validation
- Add performance benchmarks for complex schemas

## Task 16: Migrate Validator Tests
- Open packages/core/src/validator/__tests__/compliance-validator.test.ts
- Replace custom validation with AJV oracle
- Update performance tests to use percentiles (p50, p95) not averages
- Cache compiled validators using WeakMap
- Add memory leak detection tests
- Test batch validation performance
- Ensure 100% compliance invariant
````

## Phase 4: Performance & Integration

```markdown
## Task 17: Implement Performance Benchmarks
- Create test/performance/benchmarks.test.ts
- Define benchmark levels:
  * simple: {type: 'string'} → target <0.5ms p95
  * medium: object with 5 properties → target <2ms p95
  * complex: nested arrays/objects → target <20ms p95
- Implement measurement methodology:
  * Warmup phase (10 iterations)
  * Measurement phase (100 iterations)
  * Calculate percentiles (p50, p95, p99)
  * Platform-specific tolerances (Windows +50%)
- Add memory efficiency tests
- Implement baseline.json generation
- Add regression detection
- Use PERF_LOG env for detailed output

## Task 18: Create Integration Tests
- Create test/__tests__/integration/
- Test full generation → validation pipeline
- Test all schema drafts end-to-end
- Test business scenarios with real schemas
- Test error scenarios and recovery
- Test cache behavior under load
- Test memory usage with large datasets
- Verify determinism across full pipeline
```

### Per-Context PRNG Determinism

- Rationale: ensure deterministic, reproducible generation per context without global state.
- Implementation:
  - Each generator uses a per-context RNG (mulberry32) stored in `context.cache`.
  - `prepareFaker(context)` exposes a minimal, deterministic API (helpers/number/string/internet/date, etc.).
  - No `faker.seed` calls; no reliance on global faker state.
  - Seed flows via `createGeneratorContext(schema, formatRegistry, { seed })`.
- Properties verified (see tests in `packages/core/src/generator/__tests__/prng-determinism.test.ts`):
  - Determinism: same seed + same schema ⇒ identical sequences.
  - Prefix-stability: `generate(seed, N)[0:M] === generate(seed, M)`.
  - Concurrency: multiple independent contexts with same seed produce identical sequences.
  - Invariant: repository source contains no `faker.seed(` calls (build/test dirs excluded).
- Micro-benchmark reporting:
  - Logs p95 overhead vs baseline (`Math.random`) with warmup and multiple runs.
  - Informational by default. CI guardrail can be enabled via env var:
    - Set `PRNG_P95_OVERHEAD_MAX="0.05"` (5%) to assert `overhead < max` in CI.
  - Keep the threshold slightly above target initially (e.g., 0.07) to avoid flakiness, then tighten.
- Migration notes for contributors:
  - Do not add `@faker-js/faker` seeding or global RNG usage.
  - When a generator needs randomness, call `this.prepareFaker(context)` and use the provided API.
  - If a missing helper is needed, add a deterministic version under `prepareFaker` only.

## Phase 5: CI/CD & Documentation

```markdown
## Task 19: Configure CI/CD Pipeline
- Create .github/workflows/test.yml
- Configure test matrix:
  * drafts: [draft-07, 2019-09, 2020-12]
  * node: [18, 20, 21]
  * os: [ubuntu-latest, macos-latest, windows-latest]
- Setup job types:
  * quick-tests: FC_NUM_RUNS=100, TEST_SEED=424242
  * full-tests: FC_NUM_RUNS=1000, all drafts
  * performance: benchmark with regression check
  * coverage: with 90% threshold for critical code
- Configure environment variables properly
- Add test result artifact upload
- Setup coverage reporting (Codecov/Coveralls)
- Add status badges to README

## Task 20: Create Documentation
- Create test/README.md with:
  * Architecture overview
  * Pattern explanations
  * Migration guide from v2.0 to v2.1
  * Troubleshooting guide
- Document all environment variables:
  * TEST_SEED (default: 424242)
  * FC_NUM_RUNS (default: 100 local, 1000 CI)
  * SCHEMA_DRAFT (default: 2020-12)
  * PERF_LOG (default: false)
  * DEBUG (default: false)
- Create examples/ directory with:
  * Each test pattern example
  * Migration examples
  * Performance optimization tips
- Document draft-specific differences table
- Add decision log for architectural choices

## Task 21: Final Validation & Release
- Run full test suite with all drafts × all platforms
- Verify determinism: run same tests 10 times with same seed
- Check coverage meets all thresholds
- Remove debug console.log statements (except error paths)
- Verify no flaky tests in CI (10 consecutive runs)
- Update package.json scripts:
  * test:quick (FC_NUM_RUNS=10)
  * test:standard (FC_NUM_RUNS=100)
  * test:full (FC_NUM_RUNS=1000)
  * test:coverage
  * test:bench
  * test:draft (with SCHEMA_DRAFT parameter)
- Create CHANGELOG.md for v2.1.0
- Tag release v2.1.0
- Update main README.md with test badges
```

## Summary

**Total Tasks**: 22  
**Estimated Duration**: 3-4 weeks  
**Critical Path**: Tasks 0 → 1 → 2 → 4 → 7 → 11 → 12  
**Parallel Tracks**: 
- Track A: Tasks 3, 5, 6 (Matchers & Arbitraries)
- Track B: Tasks 8, 9, 10 (Test Patterns)
- Track C: Tasks 13-16 (Migrations)

**Success Metrics**:
- ✅ 100% schema compliance via AJV
- ✅ Deterministic tests (fixed seed)
- ✅ All drafts supported
- ✅ No test regressions
- ✅ Performance within targets
- ✅ 90%+ code coverage
