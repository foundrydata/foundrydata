# Feature Simplification Documentation

This directory contains technical documentation for FoundryData's feature simplification implementation, providing detailed specifications for the generation pipeline and supported JSON Schema features.

## 🔄 Pipeline {#pipeline}

### Invariants
- **100% Schema Compliance**: Every generated row validates against the original schema via AJV
- **Deterministic**: Same schema + seed → same output across runs and platforms  
- **No Mutation**: Original schema is never modified; internal canonical form is separate
- **Pipeline Integrity**: Each stage preserves validation guarantees while transforming representation
- **Effective View Conservatism**: Arrays use bag semantics for `contains`; objects enforce must‑cover intersection when `additionalProperties:false` across `allOf`

### Algorithm
1. **Parse** - Detect JSON Schema draft, validate structure, reject malformed inputs
2. **Normalize** - Convert to canonical 2020-12-like internal form with pointer mapping
3. **Compose** - Build effective view by resolving composition (`allOf`/`anyOf`/`oneOf`), handle constraints (bagged `contains`, AP:false must‑cover)
4. **Generate** - Create instances using effective constraints with seeded deterministic RNG
5. **Repair** - AJV-driven corrections when generation doesn't perfectly satisfy original schema
6. **Validate** - Final AJV validation against original schema (fail pipeline if non-compliant)

### Example
```bash
foundrydata generate --schema user.json --rows 100 --seed 42
# Parse user.json → Normalize to canonical form → Compose constraints → 
# Generate 100 rows → Repair violations → Validate all against original → Output JSON
```

### Diagnostics
- **Stage Metrics**: `parseMs`, `normalizeMs`, `composeMs`, `generateMs`, `repairMs`, `validateMs`
- **Quality Indicators**: `validationsPerRow ≤ 3`, `repairPassesPerRow ≤ 1` for simple schemas
- **Budget Tracking**: `itemsRepaired`, `repairAttemptsUsed`, repair cycle limits
- **Efficiency**: `validatorCacheHitRate`, `compiledSchemas` count

## 🖥️ CLI {#cli}

### Invariants
- **Zero Config**: Works with just schema file path, no setup or accounts required
- **Deterministic Output**: Same seed produces identical results across environments
- **Clear Errors**: Stable error codes with actionable messages and exit codes
- **Stream Separation**: Generated data to stdout, metrics/errors to stderr

### Algorithm
1. **Parse Arguments** - Schema path, rows, seed, output options using Commander.js
2. **Load & Validate Schema** - Read JSON file, validate JSON Schema structure
3. **Execute Pipeline** - Run full generation pipeline with user-specified options
4. **Format Output** - Structured JSON array to stdout, optional metrics to stderr
5. **Error Handling** - Map internal error codes to appropriate CLI exit codes

### Example
```bash
# Basic generation - schema validation and 100 rows
foundrydata generate --schema user.json --rows 100

# Advanced options - seed, output file, metrics
foundrydata generate --schema user.json --rows 1000 --seed 42 --output users.json --print-metrics

# External refs and compatibility mode
# External $ref: no remote dereferencing. In 'lax' mode, generation attempts use local constraints only.
foundrydata generate --schema api-schema.json --compat lax --rows 50
```

### Diagnostics
- **Exit Codes**: Mapped from error codes via `getExitCode(error.errorCode)`
- **Metrics Output**: Structured JSON to stderr when `--print-metrics` enabled
- **Compatibility Warnings**: Feature support messages when `--compat lax` used
- **Progress Indicators**: Generation progress for large batches

## 🌐 API {#api}

### Invariants
- **Programmatic Control**: Full pipeline access via TypeScript/JavaScript imports
- **Same Guarantees**: Identical 100% compliance, determinism, error handling as CLI
- **Composable Stages**: Individual pipeline stages can be used independently
- **Type Safety**: Full TypeScript definitions with Result<T,E> error handling

### Algorithm
1. **Import Core** - `import { generate } from '@foundrydata/core'`
2. **Configure Options** - Schema object/path, generation parameters, validator config
3. **Execute Generation** - Call async `generate()` with comprehensive options
4. **Handle Results** - Process `Result<GeneratedData, FoundryError>` with stable error codes
5. **Access Diagnostics** - Extract metrics, repair details, performance data

### Example
```typescript
import { generate, ComplianceValidator } from '@foundrydata/core';

// Basic programmatic usage
const result = await generate({
  schema: { type: 'object', properties: { name: { type: 'string' } } },
  rows: 100,
  seed: 42
});

if (result.isOk()) {
  console.log('Generated:', result.value.data.length, 'items');
  console.log('Metrics:', result.value.metrics);
}

// Advanced configuration with custom validator
const validator = new ComplianceValidator({ 
  strictTuples: 'log',
  validateFormats: true 
});

const advancedResult = await generate({
  schema: complexSchema,
  rows: 1000,
  validator,
  options: { 
    // Default: no rewrite; generation uses if‑aware‑lite
    rewriteConditionals: 'safe', 
    metrics: true,
    trials: { maxBranchesToTry: 8 }
  }
});
```

### Diagnostics
- **Result Metrics**: Detailed timing and quality metrics in `result.value.metrics`
- **Error Classification**: Stable error codes via `error.errorCode` property
- **Validation Details**: Repair diagnostics and AJV validation results
- **Performance Data**: Memory usage, cache efficiency, compilation stats

## 📊 Metrics {#metrics}

### Invariants
- **Performance Tracking**: All pipeline stages timed to millisecond precision
- **Quality Measurement**: Repair attempts and validation efficiency tracked per row
- **Resource Monitoring**: Memory usage tracked during generation with thresholds
- **Deterministic Collection**: Metrics collection doesn't affect generation determinism

### Algorithm
1. **Stage Timing** - High-resolution timestamps around each pipeline stage
2. **Quality Tracking** - Count validation attempts, repair cycles, cache hit rates
3. **Resource Monitoring** - Track heap usage, compiled validator cache size
4. **Aggregation** - Compute per-row averages and efficiency ratios
5. **Reporting** - Structured JSON output with performance and quality indicators

### Example
```json
{
  "durations": {
    "parseMs": 3,
    "normalizeMs": 1, 
    "composeMs": 5,
    "generateMs": 45,
    "repairMs": 8,
    "validateMs": 12,
    "totalMs": 74
  },
  "itemsGenerated": 1000,
  "itemsRepaired": 3,
  "repairAttemptsUsed": 3,
  "validationsPerRow": 1.2,
  "repairPassesPerRow": 0.003,
  "validatorCacheHitRate": 0.95,
  "compiledSchemas": 1,
  "memory": { 
    "rss": 45678912, 
    "heapUsed": 23456789 
  },
  "formatsUsed": ["uuid", "email", "date-time"],
  "complexityCaps": [],
  "degradations": []
}
```

### Diagnostics
- **SLO Tracking**: Performance targets per schema complexity level (simple/medium/pathological)
- **Quality Thresholds**: `validationsPerRow ≤ 3`, `repairPassesPerRow ≤ 1` for simple schemas
- **Resource Limits**: Memory usage caps for different batch sizes with warnings
- **Efficiency Indicators**: Cache hit rates, compilation overhead, repair necessity
