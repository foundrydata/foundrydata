# Features Documentation

Comprehensive documentation of FoundryData's supported JSON Schema features and implementation details.

## ⚙️ Configuration {#configuration}

### Invariants
- **Optional Everything**: All configuration options have sensible defaults
- **Composable**: Options can be combined without conflicts
- **Deterministic**: Same configuration produces same results across environments
- **Fail-Safe**: Invalid configurations fail fast with clear error messages

### Algorithm
1. **Load Defaults** - Apply conservative baseline configuration values
2. **Merge Options** - Layer user-provided options over defaults
3. **Validate Config** - Check for conflicts and invalid combinations
4. **Apply Settings** - Configure pipeline stages with validated options

### Example
```typescript
const options: PlanOptions = {
  // Default is 'never' (no rewrite)
  rewriteConditionals: 'never',
  rational: {
    maxRatBits: 128,
    fallback: 'decimal',
    decimalPrecision: 12 // aligns with AJV tolerance
  },
  trials: {
    maxBranchesToTry: 12,
    skipTrialsIfBranchesGt: 50
  },
  complexity: {
    maxOneOfBranches: 200,
    bailOnUnsatAfter: 12 // stagnation guard
  }
};
```

Default mapping between `rewriteConditionals` and `conditionals.strategy`:
- `rewriteConditionals: 'never'` ⇒ `conditionals.strategy: 'if-aware-lite'`
- `rewriteConditionals: 'safe' | 'aggressive'` ⇒ `conditionals.strategy: 'rewrite'`
- An explicit `conditionals.strategy` overrides this mapping.

### Diagnostics
- **Config Validation**: Reports invalid option combinations
- **Default Overrides**: Logs when defaults are changed
- **Performance Impact**: Warns about performance-sensitive settings

## 🔄 Normalizer {#normalizer}

### Invariants
- **Draft Agnostic**: Converts all drafts to canonical 2020-12-like form
- **Non-Destructive**: Original schema preserved for final validation
- **Pointer Mapping**: Maintains bidirectional mapping between original and canonical pointers
- **Safe Transformations**: Only applies transformations that preserve semantics

### Algorithm
1. **Draft Detection** - Identify JSON Schema draft version
2. **Unification** - Convert draft-specific keywords to canonical form
3. **Reference Rewriting** - Normalize `$ref` paths and resolve definitions
4. **Conditional Processing** - Handle `if/then/else` based on rewrite policy
5. **Pointer Mapping** - Build canonical ↔ original pointer relationships

### Example
```javascript
// Input (Draft-07)
{
  "definitions": { "Person": { "type": "object" } },
  "items": [{"type": "string"}],
  "additionalItems": false,
  "exclusiveMinimum": true,
  "minimum": 0
}

// Output (Normalized)
{
  "$defs": { "Person": { "type": "object" } },
  "prefixItems": [{"type": "string"}],
  "items": false,
  "exclusiveMinimum": 0
}
```

### Diagnostics
- **Transformation Notes**: `IF_REWRITE_DOUBLE_NOT`, `DEFS_TARGET_MISSING`, `EXCLMIN_IGNORED_NO_MIN`
- **Pointer Mapping**: Tracks canonical → original pointer relationships
- **Draft Compatibility**: Reports draft-specific transformations applied

## 🧩 Composition {#composition}

### Invariants
- **Effective View**: Produces single schema representing all constraints
- **Domain Awareness**: Type-specific constraint merging (numbers, objects, arrays)
- **Unsat Detection**: Identifies impossible constraint combinations early
- **Deterministic Resolution**: Same composition choices for same input + seed

*See also: [Invariants → AP-false Must Cover](Invariants.md#ap-false-must-cover), [Invariants → Contains Bag Semantics](Invariants.md#contains-bag-semantics)*

### Algorithm
1. **Constraint Merging** - Domain-aware merge of `allOf` constraints
2. **Branch Selection** - Deterministic choice from `anyOf`/`oneOf` alternatives
3. **Unsat Checking** - Early detection of impossible constraint combinations
4. **Effective View** - Build consumable schema for generation stage

### Example
```javascript
// Input: allOf with conflicting constraints
{
  "allOf": [
    { "type": "number", "minimum": 10 },
    { "type": "number", "maximum": 5 }
  ]
}

// Composition Result: Early unsat detection
{
  "error": "UNSAT_NUMERIC_BOUNDS",
  "details": "minimum (10) > maximum (5)"
}
```

### Diagnostics
- **Merge Results**: Domain-specific constraint combinations
- **Unsat Reasons**: `UNSAT_PATTERN_PNAMES`, `UNSAT_DEPENDENT_REQUIRED_AP_FALSE`
- **Branch Choices**: Selected `anyOf`/`oneOf` branches with scores

## 🎯 Branch Selection {#branch-selection}

### Invariants
- **Deterministic**: Same schema + seed produces same branch choices
- **Discriminant-First**: Prioritizes branches with clear distinguishing features
- **Scored Selection**: Uses quantitative scoring for consistent ranking
- **Budget Awareness**: Respects trial limits and complexity caps

### Algorithm
1. **Score Calculation** - Assign scores based on discriminant quality
2. **Ranking** - Sort branches by score (discriminants > types > overlap penalties)
3. **Trial Selection** - Choose Top-K branches for generation attempts
4. **Fallback Logic** - Handle budget exhaustion and complexity caps

### Example
```javascript
// anyOf with discriminant scoring
{
  "anyOf": [
    { "type": "object", "properties": { "type": { "const": "user" } } },    // +1000 (discriminant)
    { "type": "object", "properties": { "type": { "const": "admin" } } },   // +1000 (discriminant)
    { "type": "string" }                                                    // +10 (disjoint type)
  ]
}

// Selection: Choose first two (highest discriminant scores)
```

### Diagnostics
- **Score Details**: Breakdown of scoring factors per branch
- **Trial Budget**: `tried`, `limit`, `skipped` counts
- **Selection Reason**: Why specific branches were chosen/rejected

## 🏭 Generator {#generator}

### Invariants
- **Constraint Compliance**: Respects all effective view constraints
- **Enum Priority**: `enum`/`const` values override type-based generation
- **Deterministic**: Same effective schema + seed produces identical output
- **Format Support**: Handles JSON Schema formats with proper validation

### Algorithm
1. **Type Resolution** - Determine target type from effective constraints
2. **Enum Processing** - If enum present, filter values by remaining constraints
3. **Value Selection** - Choose from valid enum values or generate based on type
4. **Constraint Validation** - Ensure generated values satisfy all effective constraints

### Example
```javascript
// Enum values filtered by constraints
{
  "type": "string",
  "minLength": 10,
  "enum": ["short", "very_long_string"]
}

// Generation picks "very_long_string" (only member satisfying minLength: 10)
// Note: "short" filtered out by constraint validation
// If no enum values satisfy constraints → early unsat detection
```

### Diagnostics
- **Generation Path**: Which constraints drove value selection
- **Format Usage**: Formats applied during generation
- **Constraint Violations**: Pre-repair constraint mismatches

## 🎛️ Conditionals Generation (if-aware-lite) {#conditionals-generation}

### Invariants
- **No Heavy Rewriting**: Avoids complex conditional rewrites when `rewriteConditionals: 'never'`
- **Partial Evaluation**: Pre-evaluates `if` clauses on partial instances being built
- **Minimal Satisfaction**: Satisfies minimal subset of `then` when `if` appears true
- **Repair Fallback**: Relies on repair phase for complex conditional constraint satisfaction

### Algorithm
1. **If Pre-evaluation** - Evaluate `if` clause against partial instance being constructed
2. **Then Hint Application** - If `if` satisfied, bias generation toward `then` requirements
3. **Minimal Satisfaction** - Apply `minThenSatisfaction` strategy (discriminants/required/bounds)
4. **Else Avoidance** - If `if` unsatisfied, avoid choices that would activate `then`
5. **Repair Delegation** - Let repair phase handle complex conditional violations

### Example
```javascript
// Schema with conditional
{
  "properties": {
    "type": { "type": "string" },
    "email": { "type": "string", "format": "email" }
  },
  "if": { "properties": { "type": { "const": "user" } } },
  "then": { "required": ["email"] }
}

// If-aware generation:
// 1. Generate type: "user" 
// 2. Pre-evaluate if: type="user" ✓ (satisfied)
// 3. Apply then hint: include "email" (required-only strategy)
// Result: { "type": "user", "email": "user@example.com" }
```

### Diagnostics
- **Hint Application**: `IF_AWARE_HINT_APPLIED` when conditional hints successfully applied
- **Insufficient Info**: `IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO` when partial evaluation unclear
- **Strategy Used**: Which `minThenSatisfaction` strategy was applied

## 🔧 Repair {#repair}

### Invariants
- **AJV-Driven**: Uses actual AJV validation errors to guide repairs
- **Keyword-Specific**: Different repair strategies per JSON Schema keyword
- **Idempotent**: Repeated repairs produce no additional changes
- **Budget-Limited**: Bounded repair attempts prevent infinite loops

*See also: [Invariants → AJV is the Oracle](Invariants.md#ajv-is-the-oracle), [Complexity Caps](#complexity-caps)*

### Algorithm
1. **Error Analysis** - Parse AJV validation errors by keyword
2. **Repair Strategy** - Apply keyword-specific repair actions
3. **Validation Check** - Re-validate after each repair attempt
4. **Budget Tracking** - Count attempts and detect stagnation

### Example
```javascript
// AJV Error: { keyword: "minLength", instancePath: "/name", params: { limit: 5 } }
// Value: "Joe"
// Repair Action: Pad string to meet minimum length
// Result: "Joe  " (padded to 5 characters)
```

### Diagnostics
- **Repair Actions**: Log of applied repairs per validation error
- **Budget Usage**: Attempts per path, stagnation detection
- **Success Rate**: Percentage of errors successfully repaired

## 📊 Metrics {#metrics}

### Invariants
- **Non-Intrusive**: Metrics collection doesn't affect generation determinism
- **Comprehensive**: Covers all pipeline stages and quality indicators  
- **Structured**: Consistent JSON format for programmatic consumption
- **Performance-Aware**: Minimal overhead during collection

### Algorithm
1. **Stage Timing** - High-resolution timestamps around pipeline stages
2. **Quality Tracking** - Count repairs, validations, cache efficiency
3. **Resource Monitoring** - Track memory usage and compilation overhead
4. **Aggregation** - Calculate per-row averages and efficiency ratios

### Example
```json
{
  "durations": { "generateMs": 45, "repairMs": 8, "validateMs": 12 },
  "validationsPerRow": 1.2,
  "repairPassesPerRow": 0.008,
  "validatorCacheHitRate": 0.95
}
```

### Diagnostics
- **Performance Regression**: Track against baseline metrics
- **Quality Thresholds**: Alert when repair rates exceed targets
- **Efficiency Indicators**: Cache hit rates and compilation overhead

## 🐛 Debug Flags {#debug-flags}

### Invariants
- **Development Aid**: Additional diagnostics for debugging complex schemas
- **Performance Impact**: Clear trade-offs between debugging detail and speed
- **Non-Production**: Debug flags should not be used in production pipelines
- **Comprehensive Coverage**: Debug info available for all pipeline stages

### Algorithm
1. **Flag Detection** - Check for debug options in configuration
2. **Enhanced Logging** - Enable detailed diagnostics per enabled flag
3. **State Preservation** - Maintain intermediate pipeline state for inspection
4. **Performance Monitoring** - Track overhead introduced by debug features

### Example
```typescript
const options = {
  debugFreeze: true,        // Deep-freeze schemas to catch mutations
  debug: {
    normalizer: true,       // Log transformation details
    composer: true,         // Show constraint merging
    generator: true         // Track generation decisions
  }
};
```

### Diagnostics
- **Debug Overhead**: Performance cost of enabled debug features
- **State Snapshots**: Intermediate pipeline state at each stage
- **Decision Logs**: Detailed rationale for generation choices

## 🛡️ Complexity Caps and Degradation {#complexity-caps}

### Invariants
- **Correctness Preserved**: Degradation maintains 100% AJV compliance guarantee
- **Predictable Behavior**: Degradation follows documented patterns and emits clear diagnostics
- **Never Crash**: System continues operating even when complexity limits exceeded
- **Configurable Limits**: All complexity caps configurable via `options.complexity`

### Algorithm
1. **Monitor Complexity** - Track metrics during processing (branch counts, schema size, etc.)
2. **Apply Caps** - Enforce configured limits: `maxOneOfBranches`, `maxAnyOfBranches`, `maxPatternProps`
3. **Trigger Degradation** - When caps exceeded, apply degradation strategies
4. **Emit Diagnostics** - Clear reporting of which caps triggered and what was limited

### Example
```javascript
// Configuration with caps
const options = {
  complexity: {
    maxOneOfBranches: 200,      // Cap oneOf branch trials
    maxAnyOfBranches: 500,      // Cap anyOf branch trials  
    maxPatternProps: 64,        // Cap pattern property analysis
    maxEnumCardinality: 10000,  // Cap enum value count
    maxContainsNeeds: 16,       // Cap contains bag size
    bailOnUnsatAfter: 12        // Cap repair cycles
  }
};

// Large oneOf triggers degradation
{
  "oneOf": [/* 300+ schemas */]  // Exceeds maxOneOfBranches: 200
}

// Degradation applied:
// - Score-only selection (skip trials)
// - Diagnostic: "COMPLEXITY_CAP_ONEOF - reduced to score-only selection"
// - Result: Still generates valid data, reduced optimization
```

### Diagnostics
- **Cap Triggers**: `COMPLEXITY_CAP_ONEOF`, `COMPLEXITY_CAP_ANYOF`, `COMPLEXITY_CAP_PATTERNS`
- **Resource Limits**: `COMPLEXITY_CAP_ENUM`, `COMPLEXITY_CAP_CONTAINS`, `COMPLEXITY_CAP_SCHEMA_SIZE`
- **Budget Exhaustion**: `UNSAT_BUDGET_EXHAUSTED` when repair cycles exceed limit
- **Performance Impact**: How degradation affected generation performance vs quality

## 💾 Cache and Compiler {#cache-and-compiler}

### Invariants
- **Identity-First**: WeakMap caching by schema object reference
- **Multi-Level**: ID-based and hash-based fallback strategies
- **Version-Aware**: Cache keys include AJV version and critical flags
- **Size-Bounded**: LRU eviction prevents unbounded memory growth

### Algorithm
1. **Identity Check** - WeakMap lookup by schema object reference
2. **ID Fallback** - Use `$id` when present and cache-friendly
3. **Hash Strategy** - Stable hash for schemas under size threshold
4. **LRU Management** - Evict oldest entries when cache limit reached

### Example
```typescript
// Cache key composition
const cacheKey = {
  schemaHash: 'sha256:abc123...',
  ajvVersion: '8.12.0',
  strictTypes: true,
  validateFormats: true
};
```

### Diagnostics
- **Hit Rates**: Cache efficiency across different lookup strategies
- **Eviction Stats**: LRU evictions and cache size management
- **Compilation Time**: Time spent compiling vs cache retrieval

## 📐 Drafts and Dynamic Refs {#drafts-and-dynamic-refs}

### Invariants
- **Multi-Draft Support**: Handles Draft-07, 2019-09, and 2020-12
- **Conservative Generation**: Safe handling of unresolved dynamic references
- **Validation Integrity**: Always validate against original schema draft
- **Clear Limitations**: Explicit documentation of dynamic ref constraints

### Algorithm
1. **Draft Detection** - Identify schema draft from `$schema` field
2. **Dynamic Ref Preservation** - Keep `$dynamicRef`/`$recursiveRef` intact
3. **Conservative Generation** - Generate safely when dynamics can't be resolved
4. **AJV Validation** - Let AJV handle dynamic resolution during validation

### Example
```javascript
// Schema with dynamic ref (preserved)
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$dynamicRef": "#meta",
  "properties": { "name": { "type": "string" } }
}

// Note: DYNAMIC_PRESENT (generation proceeds conservatively)
```

### Diagnostics
- **Draft Detection**: Identified schema draft and confidence
- **Dynamic Presence**: `DYNAMIC_PRESENT` notes for unresolved references  
- **Compatibility Issues**: Draft-specific feature availability

## 🧪 Benchmarks and CI {#benchmarks-and-ci}

### Invariants
- **Regression Detection**: Automated performance baseline tracking
- **Multi-Environment**: Testing across Node versions and OS platforms
- **Deterministic Tests**: Fixed seeds ensure reproducible benchmark results
- **Threshold Enforcement**: Automated failure on performance regression

### Algorithm
1. **Baseline Establishment** - Record initial performance metrics
2. **Regression Testing** - Compare current performance to baseline
3. **Multi-Matrix Testing** - Test across Node versions and JSON Schema drafts
4. **Threshold Checking** - Fail CI on performance degradation beyond limits

### Example
```yaml
# CI Matrix
strategy:
  matrix:
    node: ['18.x', '20.x', '22.x']
    draft: ['draft-07', '2019-09', '2020-12']
    schema_complexity: ['simple', 'medium', 'pathological']
```

### Diagnostics
- **Performance Deltas**: Comparison with baseline metrics
- **Matrix Coverage**: Success/failure rates across test matrix
- **Regression Alerts**: Automated notifications on performance issues

## 🔌 API {#api}

### Invariants
- **Type Safety**: Full TypeScript definitions with proper error handling
- **Result Pattern**: Consistent Result<T,E> for all operations
- **Composable**: Individual pipeline stages available independently  
- **Error Codes**: Stable error codes for programmatic error handling

### Algorithm
1. **Input Validation** - Validate schema and options before processing
2. **Pipeline Execution** - Run appropriate pipeline stages
3. **Result Wrapping** - Package results in Result<T,E> containers
4. **Error Mapping** - Convert internal errors to stable public error codes

### Example
```typescript
import { generate, normalize, compose } from '@foundrydata/core';

// Full pipeline
const result = await generate({ schema, rows: 100 });

// Individual stages
const normalizeResult = normalize(schema);
const composeResult = compose(normalizeResult.schema);
```

### Diagnostics
- **API Usage**: Track which API functions are called
- **Error Distribution**: Frequency of different error codes
- **Performance Impact**: API overhead vs direct pipeline usage

## 🧮 Matrix {#matrix}

### Invariants
- **Comprehensive Coverage**: Test matrix covers supported feature combinations
- **Draft Coverage**: All supported JSON Schema drafts tested
- **Platform Coverage**: Multiple Node.js versions and operating systems
- **Feature Interaction**: Test combinations of features, not just individual features

### Algorithm
1. **Matrix Definition** - Define comprehensive test combinations
2. **Test Generation** - Generate test cases for each matrix cell
3. **Parallel Execution** - Run matrix tests in parallel for efficiency
4. **Result Aggregation** - Collect and analyze results across matrix

### Example
```typescript
// Test matrix dimensions
const matrix = {
  drafts: ['draft-07', '2019-09', '2020-12'],
  features: ['allOf', 'anyOf', 'oneOf', 'conditionals'],
  complexity: ['simple', 'medium', 'complex'],
  nodeVersions: ['18.x', '20.x', '22.x']
};
```

### Diagnostics
- **Matrix Coverage**: Percentage of matrix combinations tested
- **Failure Patterns**: Analysis of which combinations fail most often
- **Performance Variance**: Performance differences across matrix dimensions

## 📋 Arrays and Tuples {#arrays-and-tuples}

### Invariants
- **Tuple Semantics**: Proper handling of `prefixItems` with `items:false`
- **Length Constraints**: Implicit maximum length from tuple definitions
- **Item Validation**: Each position validated against appropriate schema
- **Draft Compatibility**: Support for both modern and legacy tuple syntax

### Algorithm
1. **Tuple Detection** - Identify tuple vs array schemas
2. **Length Calculation** - Determine implicit and explicit length constraints  
3. **Item Generation** - Generate items for each tuple position
4. **Additional Items** - Handle `items` and `additionalItems` appropriately

### Example
```javascript
// Tuple schema
{
  "prefixItems": [
    { "type": "string" },
    { "type": "number" }
  ],
  "items": false  // No additional items allowed
}

// Generated: ["hello", 42] (exactly 2 items)
```

### Diagnostics
- **Tuple Recognition**: How schemas are classified as tuples vs arrays
- **Length Compliance**: Validation of generated array lengths
- **Item Compliance**: Per-position validation results

## 🔄 UniqueItems {#uniqueitems}

### Invariants
- **Structural Uniqueness**: Deep equality check, not reference equality
- **Hash-Based Efficiency**: O(n) deduplication using structural hashing
- **Contains Preservation**: Maintains `contains` constraints after deduplication
- **Deterministic Order**: Consistent item order across generations

### Algorithm
1. **Structural Hashing** - Generate hash for each array item
2. **Collision Handling** - Use buckets with deep equality for hash collisions
3. **Deduplication** - Remove duplicate items while preserving order
4. **Constraint Repair** - Re-satisfy `contains` needs if broken by deduplication

### Example
```javascript
// Before deduplication
[{"id": 1}, {"id": 2}, {"id": 1}, {"name": "test"}]

// After uniqueItems processing  
[{"id": 1}, {"id": 2}, {"name": "test"}]
```

### Diagnostics
- **Duplicate Detection**: Count of duplicates found and removed
- **Hash Collisions**: Frequency of hash bucket collisions
- **Constraint Impact**: Whether deduplication affected other constraints

## 🎲 RNG and Determinism {#rng-and-determinism}

### Invariants
- **Reproducible**: Same seed produces identical results across runs
- **Isolated**: Each generation context has independent RNG state
- **Stateless**: No global RNG state that could cause interference
- **Cross-Platform**: Identical results on different operating systems

### Algorithm
1. **Seed Derivation** - Combine global seed with schema path hash
2. **Local RNG** - Create isolated RNG instance per generation context
3. **State Management** - Maintain RNG state throughout generation pipeline
4. **Platform Independence** - Use deterministic algorithms that work consistently

### Example
```typescript
// Deterministic seed combination
const localSeed = globalSeed ^ hash(schemaPath);
const rng = new XorShift32(localSeed);

// Always produces same sequence for same inputs
const values = [rng.next(), rng.next(), rng.next()];
```

### Diagnostics
- **Seed Traceability**: Track how seeds are derived and used
- **Reproducibility Tests**: Verify identical output across multiple runs
- **Platform Consistency**: Ensure same results on different systems

## ➗ MultipleOf Rational {#multipleof-rational}

### Invariants
- **Exact Arithmetic**: Rational arithmetic for precise `multipleOf` handling
- **Cap-Bounded**: Bit length limits prevent arithmetic overflow
- **Fallback Strategies**: Decimal/float fallbacks when caps exceeded
- **AJV Alignment**: Tolerance matching AJV's validation behavior

### Algorithm
1. **Rational Representation** - Store as reduced p/q fractions
2. **LCM Calculation** - Compute least common multiple for intersections
3. **Cap Checking** - Verify bit lengths don't exceed configured limits
4. **Fallback Application** - Apply decimal or float math when needed

### Example
```javascript
// multipleOf intersection
{
  "allOf": [
    { "multipleOf": 0.3 },  // 3/10
    { "multipleOf": 0.5 }   // 1/2
  ]
}

// Rational result: 3/10 ∩ 1/2 = 3/2 (LCM=3, GCD=2)
// Generated values: 1.5, 3.0, 4.5, ...
```

### Diagnostics
- **Rational Operations**: Log of arithmetic operations and results
- **Cap Triggers**: When bit length limits cause fallback to decimal/float
- **Precision Loss**: Measurement of precision degradation in fallbacks

## 🔗 Integration and Metamorphic {#integration-and-metamorphic}

### Invariants
- **End-to-End Validation**: Full pipeline testing with real schemas
- **Property Preservation**: Metamorphic properties hold across transformations
- **AJV Oracle**: All generated data validates against original schemas
- **Cross-Version Compatibility**: Same results across different tool versions

### Algorithm
1. **Integration Testing** - Run complete pipeline with diverse schemas
2. **Property Testing** - Verify metamorphic properties with property-based tests
3. **Oracle Validation** - Use AJV as ground truth for all outputs
4. **Cross-Version Testing** - Compare results across tool versions

### Example
```typescript
// Metamorphic property: normalization preserves semantics
property('normalization preserves validation', fc.jsonSchema(), schema => {
  const normalized = normalize(schema);
  const original_valid = ajv.validate(schema, testData);
  const normalized_valid = ajv.validate(normalized.schema, testData);
  return original_valid === normalized_valid;
});
```

### Diagnostics
- **Property Violations**: When metamorphic properties fail
- **Integration Failures**: Full pipeline failures with complex schemas
- **Oracle Mismatches**: Cases where generated data fails AJV validation

## 🎛️ Modes {#modes}

### Invariants
- **Strict by Default**: Conservative behavior unless explicitly relaxed
- **Clear Boundaries**: Well-defined differences between strict and lax modes
- **Validation Guarantee**: 100% AJV compliance maintained in both modes
- **Predictable Behavior**: Mode selection affects generation, not validation

*See also: [Invariants → Strict vs Lax](Invariants.md#strict-vs-lax), [Known Limits → Conditional Schema Constraints](Known-Limits.md#conditional-schema-constraints)*

### Algorithm
1. **Mode Detection** - Determine strict vs lax from configuration
2. **Feature Gating** - Apply mode-specific feature availability
3. **Error Handling** - Different error strategies per mode
4. **Validation Consistency** - Same validation requirements regardless of mode

### Example
```typescript
// Strict mode (default)
const strictResult = await generate({
  schema: conditionalSchema,
  mode: 'strict'  // Fails on unsupported conditionals
});

// Lax mode
const laxResult = await generate({
  schema: conditionalSchema,
  mode: 'lax'     // Proceeds with best-effort generation
});
```

### Diagnostics
- **Mode Impact**: How mode selection affects generation behavior
- **Feature Degradation**: Which features are limited in lax mode
- **Success Rates**: Comparative success rates between modes

## 📊 JSON Schema Features Support Matrix {#features-matrix}

### Invariants
- **Plan-Based**: Feature support status based on feature-simplification plan §18
- **Clear Status**: ✓ (full support), ~ (partial/pass-through), ✗ (not supported)
- **Implementation Target**: Defines what the feature-simplification system will support

### Algorithm
1. **Plan Reference** - Use plan §18 as single source of truth for feature support
2. **Status Classification** - Apply ✓/~/✗ based on planned implementation approach
3. **Documentation Sync** - Keep implementation aligned with documented support matrix

### Feature Support Matrix

| Feature | Status | Implementation Notes |
|---------|--------|---------------------|
| **allOf/anyOf/oneOf/not** | ✓ | With `oneOf` exclusivity refinement |
| **Conditionals (if/then/else)** | ✓ | No rewrite by default; safe rewrite optional; **if-aware-lite** in generation |
| **Tuples + additionalItems** | ✓ | Implicit max length |
| **patternProperties/propertyNames** | ✓ | Strict equivalence rewrites only; guarded by `unevaluated*` |
| **dependentSchemas/dependentRequired** | ✓ | Guarded; early-unsat with `additionalProperties: false` |
| **contains** | ✓ | **Bag semantics** across `allOf`; independent needs |
| **multipleOf** | ✓ | Exact rational with caps and fallbacks |
| **unevaluated*** | ✓ | Conservative effective view; preserved for validation |
| **$ref (in-document)** | ✓ | Full resolution with cycle detection |
| **$ref (external)** | ✗ | Warns (configurable) |
| **$dynamicRef/$dynamicAnchor/$recursiveRef** | ~ | Pass-through; generation conservative; AJV decides |

### Legend
- **✓** Full support as planned
- **~** Partial support with specific limitations (pass-through to AJV)
- **✗** Not supported (warnings/errors)

### Example
```javascript
// Schema assessment using features matrix
const schema = {
  "allOf": [...],              // ✓ Full support with constraint merging
  "$dynamicRef": "#meta",      // ~ Pass-through to AJV for validation
  "$ref": "http://external",   // ✗ External refs not supported (warn)
  "contains": {...}            // ✓ Bag semantics implementation
};

// Generation proceeds with warnings for unsupported features
```

### Diagnostics
- **Feature Coverage**: Track which planned features are encountered in schemas
- **Support Warnings**: Clear messages for unsupported or partially supported features
- **Implementation Compliance**: Verify actual implementation matches planned support matrix
