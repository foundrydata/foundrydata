# FoundryData Comprehensive Feature Support

> **Status**: Updated to align with [Feature Support Simplification Plan](feature-simplification/feature-support-simplification.md)
> 
> **Previous limitations have been lifted** - this document now covers the full feature matrix.

## JSON Schema Features - Comprehensive Support

### ✅ Core Logic & Composition
- **`allOf`** - Domain-aware merging with type intersection, exact rational arithmetic  
- **`anyOf` / `oneOf`** - Deterministic branch selection with discriminant-first scoring
- **`not`** - Schema inversion with complexity guards and depth capping
- **Early unsat detection** - Short-circuit impossible schemas before generation

### ✅ Conditionals & Smart Generation  
- **`if` / `then` / `else`** - If-aware-lite strategy with configurable satisfaction levels
- **Safe rewriting** - Optional double-negation transform with strict annotation guards  
- **Conservative generation** - Pre-evaluate conditions on partial instances, minimal backtracking

### ✅ Advanced Object Features
- **`properties` / `patternProperties`** - Full pattern property support with overlap analysis
- **`additionalProperties`** - Must-cover intersection algorithm for `false` across `allOf`
- **`unevaluatedProperties`** - Conservative effective view, preserved for AJV validation
- **`propertyNames`** - Pattern-based key validation with anchored pattern rewrites
- **`dependencies` / `dependentRequired` / `dependentSchemas`** - Full dependency support with guards

### ✅ Advanced Array Features  
- **`prefixItems` / `items` / `additionalItems`** - Full tuple support with implicit max length
- **`contains` / `minContains` / `maxContains`** - Bag semantics across `allOf` with independent needs
- **`uniqueItems`** - Structural hashing with collision detection and contains re-satisfaction

### ✅ Numeric Precision & Exact Arithmetic
- **`multipleOf`** - Exact rational arithmetic with configurable bit-length caps
- **Rational fallbacks** - Decimal quantization or float alignment when caps exceeded  
- **Bounds handling** - `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`
- **Performance protection** - Configurable caps prevent arithmetic explosion

### ✅ Schema Organization & References
- **`$ref`** - In-document references with cycle detection, preserve anchors/dynamic anchors
- **`$recursiveRef` / `$recursiveAnchor`** - Pass-through for AJV (Draft 2019-09)
- **`$dynamicRef` / `$dynamicAnchor`** - Pass-through for AJV (Draft 2020-12)  
- **`definitions` / `$defs`** - Legacy and modern support with normalization
- **`$id`** - Schema identifiers with cache integration

### ✅ String Formats & Patterns
- **Standard formats**: `uuid`, `email`, `date`, `date-time` with optional validation
- **Regex patterns**: Basic to moderate complexity with Unicode support and ReDoS protection
- **Format behavior**: Draft-aware (Assertive vs Annotative) with policy compliance

### ⚠️ Controlled Limitations

These features have **configurable behavior** rather than hard blocks:

- **External `$ref`** - Error by default, configurable to warn + attempt generation
- **Complex regex patterns** - Heuristic generation with safety limits, configurable ReDoS protection
- **Deep schema nesting** - Configurable complexity caps trigger graceful degradation  
- **Large compositions** - Complexity caps (200+ oneOf branches, 500+ anyOf branches, 10K+ enum values)

### ❌ Not Supported (By Design)

- **Network I/O for external references** - Security/offline requirement
- **Draft-04 exclusive features** - Use `npx swagger2openapi` for migration  
- **`$data` references** - Not part of JSON Schema specification
- **`contentSchema`** - Out of scope for test data generation

## 5-Stage Pipeline Architecture

**Core Flow**: `Normalize → Compose → Generate → Repair → Validate`

### Stage Benefits
1. **Normalize**: Draft-aware canonicalization with pointer mapping
2. **Compose**: Domain-aware merging with complexity protection  
3. **Generate**: Smart conditional handling with if-aware-lite
4. **Repair**: AJV-driven corrections with budgets and stagnation guards
5. **Validate**: Final compliance check against original schema

## Performance & Complexity Management

### Automatic Protection
- **Complexity caps** trigger graceful degradation (not hard failures)
- **Budget guards** prevent infinite repair loops
- **Memory bounds** with size-gated hashing and LRU caching
- **Performance metrics** track validations/row, repair passes/row

### SLO/SLI Targets (documented guidance)
- **Simple/Medium schemas**: `~1000 rows` in p50 ≈ 200–400ms, `validationsPerRow ≤ 3`
- **Pathological schemas**: Degradation paths engaged with clear diagnostics
- **Memory**: <100MB for 10K records with complexity protection

## Configuration & Tuning

### PlanOptions (Brief Overview)
Full specification: [Feature Support Simplification Plan](feature-simplification/feature-support-simplification.md) §5

```typescript
type PlanOptions = {
  rewriteConditionals?: 'never' | 'safe' | 'aggressive';
  conditionals?: { strategy?: 'rewrite' | 'if-aware-lite' | 'repair-only' };
  complexity?: { bailOnUnsatAfter?: number; /* ... */ };
  rational?: { maxRatBits?: number; fallback?: 'decimal' | 'float' };
  // ... plus trials, guards, cache, metrics, encoding
};
```

Default mapping between `rewriteConditionals` and `conditionals.strategy`:
- `rewriteConditionals: 'never'` ⇒ `conditionals.strategy: 'if-aware-lite'`
- `rewriteConditionals: 'safe' | 'aggressive'` ⇒ `conditionals.strategy: 'rewrite'`
- An explicit `conditionals.strategy` overrides this mapping.

### Configuration Strategies
- **Development**: `rewriteConditionals: 'never'`, `debugFreeze: true`
- **Production**: `rewriteConditionals: 'safe'`, performance optimizations  
- **Testing**: `skipTrials: true`, deterministic branch selection

## Migration from Previous Versions

### v0.1 → Current
- **Schema composition** now fully supported (no workarounds needed)
- **Conditionals** supported with smart generation (remove manual flattening)  
- **Deep nesting** supported with configurable complexity caps
- **Performance** improved with 5-stage pipeline and complexity protection

### Removed Workarounds
- ❌ ~~Manual flattening of nested objects~~ → ✅ Configurable depth limits
- ❌ ~~Avoiding schema composition~~ → ✅ Full `allOf`/`anyOf`/`oneOf` support  
- ❌ ~~Removing conditionals~~ → ✅ If-aware-lite generation
- ❌ ~~Complex pattern avoidance~~ → ✅ ReDoS protection with heuristics

## Testing & Quality

### Multi-Level Testing Strategy
- **Unit**: Per-stage testing (normalizer, composer, generator, repair, validator)
- **Integration**: End-to-end pipeline validation against original schemas
- **Property-based**: Metamorphic testing with fast-check (deterministic, seed 424242)
- **Benchmark**: SLO/SLI tracking with automated regression detection

### Quality Guarantees
- **100% Schema Compliance**: Every generated row validated by AJV
- **Deterministic Generation**: Same seed ⇒ identical output  
- **Performance Protection**: Graceful degradation, never crashes on complex schemas
- **Correctness over Features**: Add complexity only when guarantees hold

---

**Next**: See [Architecture](../ARCHITECTURE.md) for implementation details or [Feature Simplification Plan](feature-simplification/feature-support-simplification.md) for complete specification.
