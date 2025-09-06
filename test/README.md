# FoundryData Testing Architecture v2.1

> **Complete testing guide for FoundryData's JSON Schema data generation engine**

## 🏗️ Architecture Overview

FoundryData Testing v2.1 implements a comprehensive testing strategy combining **Property-Based Testing**, **AJV Oracle Validation**, and **Deterministic Reproducibility** to ensure 100% JSON Schema compliance.

### Core Principles

1. **100% Schema Compliance** - Every generated data point validates against its schema
2. **Deterministic Testing** - Fixed seed (424242) ensures reproducible test runs
3. **Multi-Draft Support** - Draft-07, 2019-09, 2020-12 with draft-specific validation
4. **Performance Guarantees** - p95 targets: <20ms/100 records, <200ms/1000 records
5. **Zero-Tolerance** - Tests must pass consistently without retries

### Directory Structure

```
test/
├── arbitraries/             # Fast-check generators for property-based testing
├── fixtures/                # Static test data and schemas
├── helpers/                 # AJV factory and utilities (ajv-factory.ts)
├── matchers/                # Custom Vitest matchers (toMatchJsonSchema, etc.)
├── patterns/                # Advanced testing patterns
│   ├── invariant-testing.test.ts      # Property invariants
│   ├── metamorphic-testing.test.ts    # Metamorphic relationships
│   └── stateful-testing.test.ts       # Model-based state machines
├── performance/             # Performance benchmarks and regression tests
├── setup.ts                 # Global configuration and propertyTest wrapper
└── README.md               # This file
```

## 🧪 Testing Patterns

### 1. Property-Based Testing

Uses `fast-check` for generating test cases and `propertyTest` wrapper for consistent configuration:

```typescript
import { propertyTest } from '../setup';
import fc from 'fast-check';

test('string generation respects length constraints', () => {
  return propertyTest(
    'string length bounds',
    fc.property(
      fc.record({ minLength: fc.nat(10), maxLength: fc.nat(20) }),
      (constraints) => {
        const schema = { type: 'string', ...constraints };
        const data = generateString(schema);
        expect(data.length).toBeGreaterThanOrEqual(constraints.minLength);
        expect(data.length).toBeLessThanOrEqual(constraints.maxLength);
      }
    ),
    {
      parameters: { seed: 424242, numRuns: 100 },
      context: { invariant: 'length bounds', type: 'string' }
    }
  );
});
```

### 2. AJV Oracle Validation

Every test validates generated data against the original schema using AJV as the source of truth:

```typescript
import { createAjv } from '../helpers/ajv-factory';

test('generated data validates against schema', () => {
  const schema = { type: 'object', properties: { name: { type: 'string' } } };
  const data = generate(schema);
  
  // Oracle validation - AJV is the authoritative validator
  expect(data).toMatchJsonSchema(schema, 'draft-07');
});
```

### 3. Stateful Testing Pattern

Model-based testing with `fc.commands()` for complex state machines:

```typescript
// See test/patterns/stateful-testing.test.ts for complete implementation
class GenerateCommand implements fc.Command<Model, Real> {
  run(model: Model, real: Real): void {
    const data = generateFromSchema(real.schema, real.seed);
    model.lastData = data;
    real.lastData = data;
    
    // Invariant: generated data must validate
    expect(real).toMaintainInvariant();
    expect(real).toHaveValidState();
  }
}
```

## 🔧 Configuration & Environment

### Global Configuration

All tests use consistent configuration via `test/setup.ts`:

```typescript
// Deterministic seed for reproducibility
const TEST_SEED = 424242;

// Fast-check global configuration
fc.configureGlobal({
  endOnFailure: true,
  interruptAfterTimeLimit: 10000,
  markInterruptAsFailure: true
});
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_SEED` | 424242 | Fixed seed for deterministic test runs |
| `FC_NUM_RUNS` | 50 | Number of property test iterations |
| `SCHEMA_DRAFT` | '2020-12' | Default JSON Schema draft version |
| `PERF_LOG` | false | Enable performance logging |
| `DEBUG` | false | Enable debug output |
| `CI` | false | CI environment (stricter thresholds) |

### Test Commands

```bash
# Run all tests
npm run test

# Test with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Performance benchmarks only
npm run test:performance

# Specific pattern tests
npm run test:matchers        # Custom matchers only
npm run test:gen:compliance  # Generator compliance
```

## 📊 Performance Targets

| Records | Time (p95) | Memory (p95) | Environment |
|---------|------------|--------------|-------------|
| 100     | <20ms      | <10MB        | Local/CI    |
| 1,000   | <200ms     | <50MB        | Local/CI    |
| 10,000  | <2s        | <100MB       | Local only  |

Performance tests automatically adjust thresholds based on environment (CI vs local).

## 🛠️ Custom Matchers

FoundryData provides specialized Vitest matchers for JSON Schema validation:

### Core Matchers (`test/matchers/core.ts`)

```typescript
// Schema compliance validation
expect(data).toMatchJsonSchema(schema, 'draft-07');

// Performance timing
expect(fn).toCompleteWithin(100); // ms

// Generation bounds
expect(data).toRespectBounds(schema);
```

### Advanced Matchers (`test/matchers/advanced.ts`)

```typescript
// Multi-draft validation
expect(data).toValidateAcrossDrafts(['draft-07', '2019-09']);

// Complex constraints
expect(data).toSatisfyConstraints(schema);

// Error validation
expect(() => parse(invalidSchema)).toThrowSchemaError('E001');
```

### Stateful Matchers (`test/patterns/stateful-testing.test.ts`)

```typescript
// State invariants
expect(systemState).toMaintainInvariant();

// Cache performance
expect(systemState).toHaveHitRate(0.8);
expect(systemState).toCacheEffectively();

// State validation
expect(systemState).toHaveValidState();
```

## 🔄 Migration Guide: v2.0 → v2.1

### Key Changes

1. **Unified `propertyTest` wrapper** replaces direct `fc.assert()`
2. **Deterministic seed** (424242) for all property tests
3. **Enhanced failure context** with samples and debug info
4. **Stricter timeout management** (10s for properties + shrinking)
5. **Improved CI/local environment handling**

### Migration Steps

#### Before (v2.0)
```typescript
import fc from 'fast-check';

test('example test', () => {
  fc.assert(
    fc.property(fc.string(), (str) => {
      expect(str).toBeDefined();
    }),
    { numRuns: 100, seed: 12345 }  // Inconsistent seeds
  );
});
```

#### After (v2.1)
```typescript
import { propertyTest } from '../setup';
import fc from 'fast-check';

test('example test', () => {
  return propertyTest(
    'string generation',
    fc.property(fc.string(), (str) => {
      expect(str).toBeDefined();
    }),
    {
      parameters: { seed: 424242, numRuns: 100 },  // Consistent seed
      context: { type: 'string' }
    }
  );
});
```

#### Key Differences

- **Always return** `propertyTest()` promise
- **Consistent seed** 424242 across all tests
- **Context object** for better failure reporting
- **Timeout handling** built into wrapper
- **Environment awareness** (CI vs local)

## 🐛 Troubleshooting Guide

### Common Issues

#### 1. Property Test Timeouts

**Problem**: Tests timeout during shrinking phase
```
Error: Property failed after 30000ms (shrinking timeout)
```

**Solutions**:
- Check for infinite loops in test logic
- Reduce test complexity or numRuns
- Use `parameters: { interruptAfterTimeLimit: 5000 }` for specific tests

#### 2. Non-Deterministic Failures

**Problem**: Tests pass/fail randomly
```
Error: Expected property to pass consistently, got intermittent failures
```

**Solutions**:
- Verify seed consistency: `parameters: { seed: 424242 }`
- Check for external dependencies (Date.now(), Math.random())
- Use `fc.pre()` for precondition filtering

#### 3. AJV Schema Compilation Errors

**Problem**: Schema validation fails unexpectedly
```
Error: AJV compilation failed for schema
```

**Solutions**:
- Verify JSON Schema draft compatibility
- Check for unsupported features (see CLAUDE.md)
- Use `createAjv(draft)` with specific draft version

#### 4. Performance Test Failures

**Problem**: Performance tests exceed thresholds
```
Error: Expected generation time <100ms, got 150ms
```

**Solutions**:
- Run on stable hardware (avoid CI variability)
- Check for memory leaks in test setup
- Use `CI=true` for stricter CI thresholds

#### 5. Custom Matcher Issues

**Problem**: Custom matchers not recognized
```
Error: expect(...).toMatchJsonSchema is not a function
```

**Solutions**:
- Ensure `import '../matchers'` in test files
- Check matcher registration in `test/setup.ts`
- Verify TypeScript declarations are current

### Debug Techniques

#### 1. Enable Verbose Logging
```bash
DEBUG=true npm run test
```

#### 2. Examine Counterexamples
```typescript
return propertyTest(
  'debug failing test',
  fc.property(arbitrary, (value) => {
    console.log('Testing with:', value);  // Debug output
    expect(value).toSatisfyCondition();
  }),
  {
    parameters: { verbose: 2 }  // Max verbosity
  }
);
```

#### 3. Reproduce Specific Failures
```typescript
// Use specific seed from failure log
return propertyTest(
  'reproduce failure',
  property,
  {
    parameters: { seed: 1234567, path: "0:1:0" }  // From failure output
  }
);
```

## 📈 Performance Optimization Tips

### 1. Schema Caching
```typescript
// Cache compiled AJV validators
const ajvCache = new Map();
function getCachedValidator(schema, draft) {
  const key = JSON.stringify({ schema, draft });
  if (!ajvCache.has(key)) {
    ajvCache.set(key, createAjv(draft).compile(schema));
  }
  return ajvCache.get(key);
}
```

### 2. Efficient Arbitraries
```typescript
// Prefer focused arbitraries over broad filtering
const goodArbitrary = fc.oneof(
  fc.constant('valid1'),
  fc.constant('valid2')
);

// Avoid expensive filtering
const badArbitrary = fc.string().filter(s => isValid(s)); // <1% success rate
```

### 3. Batch Operations
```typescript
// Generate multiple items efficiently
return propertyTest(
  'batch generation',
  fc.property(fc.array(schemaArbitrary, { maxLength: 100 }), (schemas) => {
    const results = generateBatch(schemas);  // Batch processing
    expect(results).toHaveLength(schemas.length);
  })
);
```

### 4. Memory Management
```typescript
// Clear caches between test suites
afterEach(() => {
  clearGeneratorCache();
  clearAjvCache();
  gc?.(); // Force garbage collection if available
});
```

## 📋 Draft-Specific Differences

| Feature                   | Draft-07              | 2019-09                          | 2020-12                     |
|---------------------------|----------------------|----------------------------------|---------------------------|
| **Format Validation**     | Assertion optionnelle | Annotatif par défaut (activable) | Configurable (vocabulaires) |
| **unevaluatedItems**      | ❌                    | ✅                               | ✅                          |
| **unevaluatedProperties** | ❌                    | ✅                               | ✅                          |
| **$anchor**               | ❌                    | ✅                               | ✅                          |
| **$recursiveRef**         | ❌                    | ✅                               | ❌                          |
| **$dynamicRef**           | ❌                    | ❌                               | ✅                          |
| **dependentSchemas**      | ❌                    | ✅                               | ✅                          |

### Format Behavior by Draft

#### Draft-07 (Assertive)
```typescript
// Invalid format = validation error
const schema = { type: 'string', format: 'email' };
const data = 'invalid-email';
expect(validate(data, schema)).toBe(false);
```

#### 2019-09/2020-12 (Annotative by default)
```typescript
// Invalid format = annotation only, validation passes
const schema = { type: 'string', format: 'email' };
const data = 'invalid-email';
expect(validate(data, schema)).toBe(true);  // Still passes!

// Enable strict format checking
const ajv = createAjv('2019-09', { strictFormats: true });
expect(ajv.compile(schema)(data)).toBe(false);  // Now fails
```

## 📚 Decision Log

### 1. Fixed Seed Strategy (424242)

**Decision**: Use deterministic seed 424242 across all property tests
**Rationale**: 
- Enables reproducible test failures for debugging
- Eliminates flaky tests due to random seed variation
- Maintains coverage while ensuring consistency
- Easy to remember and recognize in logs

**Trade-offs**: 
- ✅ Reproducible debugging
- ✅ Consistent CI behavior
- ❌ Potentially limited scenario coverage per run
- ❌ May miss edge cases not hit by this seed

### 2. AJV Oracle Pattern

**Decision**: Use AJV as the authoritative validator for all schema compliance
**Rationale**:
- Industry standard JSON Schema implementation
- Reference implementation for format validation
- Handles all supported drafts consistently
- Provides detailed error information

**Trade-offs**:
- ✅ Authoritative validation
- ✅ Multi-draft support
- ✅ Battle-tested implementation
- ❌ Additional test dependency
- ❌ Performance overhead for validation

### 3. Custom Matchers Architecture

**Decision**: Implement domain-specific matchers over generic assertions
**Rationale**:
- Clearer test intent and failure messages
- Reusable across test suites
- Better error reporting with context
- Follows Vitest/Jest best practices

**Trade-offs**:
- ✅ Clear, readable tests
- ✅ Consistent error messages
- ✅ Domain-specific assertions
- ❌ Additional maintenance overhead
- ❌ Learning curve for contributors

### 4. Model-Based Testing with Commands

**Decision**: Use `fc.commands()` for stateful testing over manual state management
**Rationale**:
- Automated test case generation
- Better coverage of state transitions
- Shrinking support for complex failures
- Industry best practice for stateful systems

**Trade-offs**:
- ✅ Comprehensive state coverage
- ✅ Automated shrinking
- ✅ Complex scenario generation
- ❌ More complex test setup
- ❌ Harder to debug specific scenarios

### 5. Performance Threshold Strategy

**Decision**: Different thresholds for CI vs local environments
**Rationale**:
- CI hardware variability requires more lenient thresholds
- Local development needs quick feedback
- Real performance issues still caught
- Reduces CI flakiness

**Trade-offs**:
- ✅ Stable CI builds
- ✅ Quick local development
- ✅ Still catches real regressions
- ❌ Potential to miss edge case performance issues
- ❌ Environment-specific behavior

---

## 🚀 Next Steps

1. **Expand Pattern Coverage**: Add more sophisticated metamorphic properties
2. **Performance Optimization**: Implement caching strategies for common schemas
3. **Error Recovery Testing**: Test system behavior under various failure conditions
4. **Multi-Draft Convergence**: Validate behavior consistency across JSON Schema drafts
5. **Benchmark Suite**: Comprehensive performance comparison with other generators

---

*For implementation details, see individual test files and the main [CLAUDE.md](/CLAUDE.md) documentation.*