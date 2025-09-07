# Invariants Documentation

Core invariants that must hold across all FoundryData operations, ensuring consistent behavior and guarantees.

## 🔐 Core Invariants {#core-invariants}

### Invariants
- **100% Schema Compliance**: Every generated row validates against the original schema via AJV
- **Deterministic Generation**: Same schema + seed produces identical output across platforms and runs
- **No Schema Mutation**: Original schema never modified; canonical form maintained separately
- **Pipeline Integrity**: Each stage preserves semantic correctness while transforming representation

### Algorithm
1. **Validate Input** - Ensure schema is well-formed JSON Schema
2. **Preserve Original** - Maintain immutable reference to input schema
3. **Transform Safely** - Apply only semantic-preserving transformations
4. **Validate Output** - Confirm all generated data validates against original schema

### Example
```javascript
const schema = { type: 'string', minLength: 5 };
const result = await generate({ schema, rows: 100, seed: 42 });

// Invariant checks:
// 1. All 100 items are strings with length ≥ 5
// 2. Same seed produces identical 100 strings  
// 3. Original schema unchanged: schema.minLength === 5
// 4. AJV validation passes: ajv.validate(schema, item) === true
```

### Diagnostics
- **Compliance Rate**: Percentage of generated items that pass AJV validation (must be 100%)
- **Determinism Test**: Verify identical output across multiple runs with same seed
- **Schema Integrity**: Confirm original schema objects remain unmodified

## 🎯 AJV is the Oracle {#ajv-is-the-oracle}

### Invariants
- **Final Authority**: AJV validation against original schema is ultimate compliance test
- **No Shortcuts**: Internal validation logic never bypasses AJV check
- **Version Consistency**: Same AJV major version used for compilation and validation
- **Error Transparency**: AJV errors exposed directly, not filtered or transformed

### Algorithm
1. **Compile Schema** - Use AJV to compile original schema for validation
2. **Generate Data** - Create data using internal generation logic
3. **Validate with AJV** - Apply AJV validator to every generated item
4. **Report AJV Results** - Surface AJV validation results without modification

### Example
```javascript
// Internal generation produces value
const generatedValue = { name: 'John', age: 25 };

// AJV is the final arbiter
const isValid = ajvValidator(generatedValue);
if (!isValid) {
  // AJV errors are authoritative
  throw new ValidationError(ajvValidator.errors);
}

// Only AJV-approved values are returned
return generatedValue;
```

### Diagnostics
- **AJV Version**: Track AJV version used for validation consistency
- **Validation Errors**: Raw AJV errors when validation fails
- **Override Detection**: Alerts if internal logic contradicts AJV results

## 🌱 Determinism and Seeding {#determinism-and-seeding}

### Invariants
- **Seed Reproducibility**: Same global seed produces identical results across runs
- **File-path Independence**: File location doesn't affect generation; uses canonical pointer paths for per-node seeds
- **Platform Consistency**: Results identical across different operating systems and Node versions
- **Isolation**: Each generation context has independent, non-interfering RNG state

### Algorithm
1. **Seed Derivation** - Combine global seed with schema path hash for local seed
2. **RNG Isolation** - Create independent RNG instance per generation context
3. **State Management** - Maintain RNG state throughout pipeline without global pollution
4. **Platform Normalization** - Use deterministic algorithms that behave consistently

### Example
```javascript
// Same inputs always produce same outputs
const seed = 42;
const schema = { type: 'string', enum: ['a', 'b', 'c'] };

const run1 = generate({ schema, rows: 10, seed });
const run2 = generate({ schema, rows: 10, seed });

// Invariant: run1.data === run2.data (identical arrays)
// ['a', 'c', 'b', 'a', 'c', 'a', 'b', 'c', 'a', 'b']
```

### Diagnostics
- **Reproducibility Tests**: Verify identical output across multiple runs
- **Seed Traceability**: Track how global seed is transformed to local seeds
- **RNG State Isolation**: Confirm no cross-contamination between generation contexts

## 🎯 Evaluation Scope and Unevaluated {#evaluation-scope-and-unevaluated}

### Invariants
- **Scope Tracking**: Accurate tracking of which properties/items are evaluated by schema keywords
- **Unevaluated Enforcement**: `unevaluatedProperties`/`unevaluatedItems` properly restrict generation
- **Conservative Generation**: When evaluation scope unclear, prefer conservative approach
- **AJV Alignment**: Evaluation scope matches AJV's interpretation exactly

### Algorithm
1. **Scope Analysis** - Determine which properties/items are evaluated by each keyword
2. **Unevaluated Detection** - Identify properties/items not covered by evaluation
3. **Generation Restriction** - Limit generation to evaluated scope when unevaluated constraints present
4. **AJV Verification** - Validate scope interpretation against AJV behavior

### Example
```javascript
{
  "properties": { "name": { "type": "string" } },
  "unevaluatedProperties": false
}

// Evaluated: "name" property only
// Generated: { "name": "John" } ✓
// Not generated: { "name": "John", "age": 25 } ✗ (age not evaluated)
```

### Diagnostics
- **Evaluation Mapping**: Which schema keywords evaluate which properties/items
- **Scope Violations**: Attempts to generate beyond evaluated scope
- **AJV Alignment**: Verification that scope matches AJV's evaluation

## 🛡️ additionalProperties:false Must Cover {#ap-false-must-cover}

### Invariants
- **Coverage Intersection**: Properties must be covered by ALL `additionalProperties:false` conjuncts
- **Conservative Recognition**: Pattern recognition errs on side of caution
- **Approximation Notes**: Clear diagnostics when approximations are used
- **Generation Safety**: Only generate properties guaranteed to be safe

### Algorithm
1. **Identify AP:false Conjuncts** - Find all `additionalProperties:false` schemas in `allOf`
2. **Compute Coverage** - Determine properties covered by each conjunct's `properties`/`patternProperties`
3. **Intersect Safe Sets** - Only properties covered by ALL conjuncts are safe to generate
4. **Apply Approximations** - Use conservative approximations for complex patterns

### Example
```javascript
{
  "allOf": [
    { 
      "properties": { "name": {}, "age": {} },
      "additionalProperties": false 
    },
    { 
      "properties": { "name": {}, "email": {} },
      "additionalProperties": false 
    }
  ]
}

// Safe intersection: only "name" (covered by both)
// Generated: { "name": "John" } ✓
// Not generated: { "name": "John", "age": 25 } ✗ (age not in second conjunct)
```

### Diagnostics
- **Coverage Analysis**: Which properties are covered by each `additionalProperties:false`
- **Intersection Result**: Final set of safe-to-generate properties
- **Approximation Warnings**: `AP_FALSE_INTERSECTION_APPROX` when patterns approximated

## 🎒 Contains Bag Semantics {#contains-bag-semantics}

### Invariants
- **Independent Needs**: Each `contains` constraint treated as independent requirement
- **Bag Accumulation**: `allOf` concatenates bags rather than intersecting
- **Unsat Detection**: Early detection when needs exceed array capacity
- **Targeted Generation**: Generate specific items to satisfy each need independently

### Algorithm
1. **Need Extraction** - Extract `contains` requirements as independent needs
2. **Bag Construction** - Concatenate needs from `allOf` conjuncts
3. **Capacity Check** - Verify total needs don't exceed `maxItems`
4. **Targeted Generation** - Generate items specifically to satisfy each need

### Example
```javascript
{
  "allOf": [
    { "contains": { "type": "string" }, "minContains": 2 },
    { "contains": { "type": "number" }, "minContains": 1 }
  ]
}

// Bag: [
//   { schema: { type: "string" }, min: 2 },
//   { schema: { type: "number" }, min: 1 }  
// ]
// Generated: ["str1", "str2", 42, ...] (satisfies both needs)
```

### Diagnostics
- **Bag Composition**: How needs are extracted and combined
- **Capacity Analysis**: Whether needs fit within array size constraints
- **Satisfaction Tracking**: Which generated items satisfy which needs

## 👑 Enum/Const Over Type {#enum-const-over-type}

### Invariants
- **Priority Override**: `enum`/`const` values take precedence over `type`-based generation
- **Type Compatibility**: Enum values must be compatible with specified type
- **Complete Coverage**: All enum values are potential generation targets
- **Deterministic Selection**: Same seed produces same enum choice

### Algorithm
1. **Detect Enum/Const** - Check for `enum` or `const` keywords in effective schema
2. **Override Type Generation** - Skip type-based generation when enum present
3. **Select Value** - Use seeded RNG to select from available enum values
4. **Validate Compatibility** - Ensure selected value matches type constraints if present

### Example
```javascript
{
  "type": "string",
  "minLength": 10,
  "enum": ["short", "very_long_string"]
}

// Generation selects only enum values that satisfy remaining constraints
// Result: generates "very_long_string" only ("short" filtered out by minLength)
// If no enum values satisfy constraints → early unsat detection
```

### Diagnostics
- **Override Detection**: When enum/const overrides type-based generation
- **Value Selection**: Which enum value was chosen and why
- **Type Conflicts**: When enum values conflict with type constraints

## ⚙️ Two AJV Configs {#two-ajv-configs}

### Invariants
- **Source Config**: Original schema compilation with lenient settings for real-world schemas
- **Planning Config**: Internal canonical schema compilation with strict settings
- **Validation Authority**: Source config AJV is authoritative for final validation
- **Cache Separation**: Separate caches for different AJV configurations

### Algorithm
1. **Source AJV Setup** - Configure for original schema with `strictSchema:false`, `allowUnionTypes:true`
2. **Planning AJV Setup** - Configure for canonical schema with `strictSchema:true`, `strictTypes:true`
3. **Cache Key Differentiation** - Include AJV config flags in cache keys
4. **Validation Routing** - Use appropriate AJV instance for each validation purpose

### Example
```javascript
// Source AJV (lenient for real-world schemas)
const sourceAJV = new Ajv({
  strictSchema: false,      // Allow vendor extensions
  allowUnionTypes: true,    // Handle TS-style unions
  validateFormats: false    // Annotate-only by default
});

// Planning AJV (strict for canonical schemas)  
const planningAJV = new Ajv({
  strictSchema: true,       // Strict canonical form
  strictTypes: true,        // Type enforcement
  validateFormats: true     // Validate when planning
});
```

### Diagnostics
- **Config Differences**: How source and planning AJV configs differ
- **Cache Hit Rates**: Separate cache efficiency metrics for each config
- **Validation Routing**: Which AJV instance handled which validation

## 🎯 Effective View Consumption {#effective-view-consumption}

### Invariants
- **Single Consumer Interface**: Generator consumes only the effective view, never original schema
- **Complete Constraint Capture**: Effective view contains all generation-relevant constraints
- **Composition Resolution**: All `allOf`/`anyOf`/`oneOf` resolved into direct constraints
- **Validation Separation**: Original schema retained only for final AJV validation

### Algorithm
1. **Compose Constraints** - Resolve all schema composition into effective constraints
2. **Extract Generation Data** - Pull out all data needed for generation
3. **Provide Interface** - Present single, clean interface to generator
4. **Maintain Separation** - Keep effective view separate from original schema

### Example
```javascript
// Original complex schema
const original = {
  "allOf": [
    { "type": "string", "minLength": 5 },
    { "type": "string", "maxLength": 10 }
  ]
};

// Effective view (consumed by generator)
const effective = {
  "type": "string",
  "minLength": 5,
  "maxLength": 10
};

// Generator only sees effective view, never original
```

### Diagnostics
- **Constraint Extraction**: How constraints are pulled from composition
- **View Completeness**: Whether effective view captures all necessary constraints
- **Generator Interface**: What data generator receives vs original schema

## ⚖️ Strict vs Lax {#strict-vs-lax}

### Invariants
- **Strict Default**: Conservative behavior is default, explicit opt-in for lax mode
- **Validation Consistency**: Both modes maintain 100% AJV compliance guarantee
- **Clear Boundaries**: Well-defined differences in behavior between modes
- **Feature Availability**: Strict mode may reject schemas that lax mode accepts

*See also: [Features → Conditionals Generation](Features.md#conditionals-generation)*

### Algorithm
1. **Mode Detection** - Determine strict vs lax from configuration
2. **Feature Gating** - Apply mode-specific feature availability checks
3. **Error Strategies** - Different error handling approaches per mode
4. **Validation Consistency** - Same final validation requirements regardless of mode

### Example
```javascript
// Conditional schema
const schema = {
  "if": { "properties": { "type": { "const": "user" } } },
  "then": { "required": ["email"] }
};

// Strict mode: applies if-aware-lite (no heavy rewrite); validation remains via AJV
const strictResult = generate({ schema, mode: 'strict' }); // succeeds with if-aware hints

// Lax mode: proceeds with best-effort generation  
const laxResult = generate({ schema, mode: 'lax' }); // succeeds with repair
```

### Diagnostics
- **Mode Impact**: How mode selection affects generation behavior
- **Feature Gates**: Which features are available in each mode
- **Success Rates**: Comparative success rates between strict and lax modes

## 📋 Diagnostics are First Class {#diagnostics-are-first-class}

### Invariants
- **Always Available**: Diagnostics collected even when not explicitly requested
- **Structured Format**: Consistent, machine-readable diagnostic format
- **Non-Intrusive**: Diagnostic collection doesn't affect generation determinism
- **Complete Coverage**: Diagnostics available for all pipeline stages and decisions

### Algorithm
1. **Collect Continuously** - Gather diagnostics throughout pipeline execution
2. **Structure Consistently** - Use consistent format for all diagnostic data
3. **Preserve Determinism** - Ensure diagnostics don't affect generation behavior
4. **Provide Access** - Make diagnostics available through API and CLI

### Example
```javascript
const result = await generate({ schema, rows: 100, diagnostics: true });

// Structured diagnostics always available
console.log(result.diagnostics);
// {
//   "stages": { "parseMs": 3, "generateMs": 45 },
//   "quality": { "validationsPerRow": 1.2, "repairRate": 0.03 },
//   "decisions": { "branchSelected": 2, "enumOverrides": 15 }
// }
```

### Diagnostics
- **Collection Overhead**: Performance cost of diagnostic collection
- **Coverage Completeness**: Which operations provide diagnostic data
- **Format Consistency**: Adherence to structured diagnostic format

## 🔄 Order of Operations {#order-of-operations}

### Invariants
- **Deterministic Sequencing**: Operations always execute in same order
- **Dependency Respect**: Later operations can depend on earlier results
- **Stage Isolation**: Each pipeline stage completes before next begins
- **Error Propagation**: Errors halt pipeline in predictable manner

### Algorithm
1. **Parse** - Schema structure validation and draft detection
2. **Normalize** - Draft unification and canonicalization
3. **Compose** - Constraint resolution and effective view construction
4. **Generate** - Value creation using effective constraints
5. **Repair** - AJV-driven corrections for validation failures
6. **Validate** - Final compliance check against original schema

### Example
```javascript
// Guaranteed execution order
const pipeline = [
  () => parse(schema),           // 1. Always first
  () => normalize(parsed),       // 2. Depends on parsed
  () => compose(normalized),     // 3. Depends on normalized
  () => generate(effective),     // 4. Depends on effective
  () => repair(generated),       // 5. Depends on generated
  () => validate(repaired)       // 6. Always last
];
```

### Diagnostics
- **Stage Timing**: Duration of each pipeline stage
- **Dependency Tracking**: Which stages depend on which results
- **Error Origins**: Which stage generated each error

## 🗺️ Pointer Mapping {#pointer-mapping}

### Invariants
- **Bidirectional Mapping**: Both canonical→original and original→canonical mappings maintained
- **Path Preservation**: JSON Pointer paths maintained across transformations
- **Longest Prefix**: Unmapped paths resolve via longest matching prefix
- **Error Attribution**: Errors can be traced back to original schema locations

### Algorithm
1. **Track Transformations** - Record pointer changes during normalization
2. **Build Maps** - Create bidirectional pointer mapping structures
3. **Prefix Resolution** - Use longest prefix matching for unmapped paths
4. **Error Tracing** - Map error locations back to original schema

### Example
```javascript
// Original schema path: /definitions/User/properties/name
// Canonical path: /$defs/User/properties/name  

const ptrMap = new Map([
  ['/$defs/User', '/definitions/User'],           // Forward mapping
  ['/definitions/User', '/$defs/User']            // Reverse mapping  
]);

// Error at /$defs/User/properties/email maps back to:
// /definitions/User/properties/email (via longest prefix)
```

### Diagnostics
- **Mapping Coverage**: Percentage of paths with explicit mappings
- **Prefix Resolution**: Frequency of longest-prefix lookups
- **Error Attribution**: Success rate of mapping errors to original locations

## 🛡️ Graceful Degradation {#graceful-degradation}

### Invariants
- **Never Crash**: System continues operating even when complexity limits exceeded
- **Clear Diagnostics**: Degradation events clearly reported in diagnostics
- **Predictable Behavior**: Degradation follows documented patterns
- **Validation Maintained**: 100% compliance guarantee preserved even during degradation

### Algorithm
1. **Monitor Complexity** - Track complexity metrics during processing
2. **Apply Limits** - Enforce configured complexity caps
3. **Degrade Gracefully** - Reduce quality while maintaining correctness
4. **Report Degradation** - Clear diagnostics about what was limited

### Example
```javascript
// Large oneOf with 500 branches
{
  "oneOf": [/* 500 schemas */]
}

// Degradation: reduce trials, skip overlap analysis
// Diagnostic: "COMPLEXITY_CAP_ONEOF - reduced to score-only selection"
// Result: Still generates valid data, just with less optimization
```

### Diagnostics
- **Complexity Triggers**: Which complexity caps were exceeded
- **Degradation Actions**: What optimizations were disabled
- **Performance Impact**: How degradation affected generation performance

## 📊 SLO/SLI {#slo-sli}

### Invariants
- **Documented Targets**: Clear performance targets for different schema types
- **Measurable Metrics**: Concrete metrics that can be automatically tracked
- **Realistic Expectations**: Targets based on empirical measurement, not aspirations
- **Degradation Boundaries**: Clear performance limits that trigger degradation

### Algorithm
1. **Define Targets** - Establish performance targets per schema complexity
2. **Measure Continuously** - Track actual performance against targets
3. **Report Variance** - Surface performance deviations in diagnostics
4. **Trigger Degradation** - Apply degradation when targets cannot be met

### Example
```javascript
// Performance targets (SLO)
const targets = {
  simple: { p50: 50, p95: 100, validationsPerRow: 2 },
  medium: { p50: 200, p95: 400, validationsPerRow: 3 },
  complex: { p50: 500, p95: 1000, validationsPerRow: 5 }
};

// Actual measurement (SLI)  
const actual = { p50: 75, p95: 150, validationsPerRow: 2.1 };

// Within targets for simple schema ✓
```

### Diagnostics
- **Target Comparison**: Actual performance vs SLO targets
- **Trend Analysis**: Performance trends over time
- **Degradation Triggers**: When performance targets cause degradation

## 🔒 No Mutation of Canonical {#no-mutation-of-canonical}

### Invariants
- **Immutable Canonical**: Canonical schema never modified after creation
- **Deep Immutability**: Nested objects and arrays also protected from mutation
- **Reference Safety**: Safe to pass canonical schema to multiple consumers
- **Debug Verification**: Optional deep-freeze in debug mode to catch mutations

### Algorithm
1. **Create Immutable Copy** - Deep clone during canonicalization
2. **Optional Freeze** - Apply Object.freeze() in debug mode
3. **Reference Distribution** - Safely share canonical schema references
4. **Mutation Detection** - Debug mode catches accidental mutations

### Example
```javascript
const canonical = normalize(originalSchema);

// Safe to use in multiple contexts
const effective1 = compose(canonical.schema, options1);
const effective2 = compose(canonical.schema, options2);

// Debug mode: canonical.schema is deep-frozen
// Any mutation attempt throws error
```

### Diagnostics
- **Mutation Attempts**: Debug mode reports attempted mutations
- **Reference Sharing**: Track how many consumers access canonical schema
- **Freeze Overhead**: Performance cost of deep-freezing in debug mode