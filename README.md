<div align="center">
  <br />
  <img src="https://raw.githubusercontent.com/foundrydata/foundrydata/main/assets/banner.svg"  alt="FoundryData Logo"/>
  <br />
  <br />
  
  <h1>FoundryData</h1>
  
  <p>
    <strong>Stop wasting hours on test data that breaks your API. Generate perfectly valid records in seconds.</strong>
  </p>
  <p>
    <em>Schema-first, deterministic test data with guaranteed compliance</em>
  </p>
  
  <p>
    <a href="https://www.npmjs.com/package/foundrydata"><img src="https://img.shields.io/npm/v/foundrydata?style=flat-square&labelColor=000000&color=3b82f6" alt="npm version" /></a>
    <a href="https://github.com/foundrydata/foundrydata/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square&labelColor=000000" alt="MIT License" /></a>
    <a href="https://github.com/foundrydata/foundrydata/stargazers"><img src="https://img.shields.io/github/stars/foundrydata/foundrydata?style=flat-square&labelColor=000000&color=3b82f6" alt="GitHub stars" /></a>
    <a href="https://www.npmjs.com/package/foundrydata"><img src="https://img.shields.io/npm/dm/foundrydata?style=flat-square&labelColor=000000&color=3b82f6" alt="npm downloads" /></a>
    <a href="https://github.com/foundrydata/foundrydata/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/foundrydata/foundrydata/test.yml?branch=main&style=flat-square&labelColor=000000&label=tests" alt="Tests Status" /></a>
    <a href="https://github.com/foundrydata/foundrydata/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/foundrydata/foundrydata/ci.yml?branch=main&style=flat-square&labelColor=000000&label=build" alt="Build Status" /></a>
    <img src="https://img.shields.io/badge/coverage-%E2%89%A5%2090%25-brightgreen?style=flat-square&labelColor=000000" alt="Coverage ≥ 90%" />
    <img src="https://img.shields.io/badge/performance-baseline%20tracked-3b82f6?style=flat-square&labelColor=000000&color=3b82f6" alt="Performance baseline tracked" />
  </p>
  
  <p>
    <a href="#-features">Features</a> •
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-why-foundrydata">Why?</a> •
    <a href="#-examples">Examples</a> •
    <a href="#-api">API</a> •
    <a href="#-validator-configuration">Validator Config</a> •
    <a href="#-contributing">Contributing</a>
  </p>
  
  <br />
  
  <img src="https://raw.githubusercontent.com/foundrydata/foundrydata/main/assets/demo.gif" width="700" alt="FoundryData Demo" />
</div>

<br />

## ✅ CI Overview

- Matrix: `draft-07 × 2019-09 × 2020-12` × Node `18.x · 20.x · 22.x` × OS `ubuntu · macOS · windows`.
- Jobs: `lint` (zero errors), `quick-tests` (5m, 100 runs), `full-tests` (30m, 1000 runs + coverage), `performance-tests` (baseline + regression), `memory-tests` (leak/GC).
- Env: `TEST_SEED=424242`, `FC_NUM_RUNS` per job, `SCHEMA_DRAFT` from matrix, `DEBUG=false` (CI), `PERF_LOG=true` (perf).
- Quality gates: coverage lines ≥ 90%, performance regression p95 > 20% fails, memory regression > 100MB fails, ESLint must pass.
- Artifacts: coverage (`lcov`, summary, HTML), performance `baseline.json` + report, optional JUnit XML.
- Workflow: see `.github/workflows/test.yml`.

## ✨ Features

- 🎯 **100% Schema Compliance** - Every generated row is validated against your schema
- 🚀 **CLI First** - Run locally, no account needed, no data leaves your machine
- 📦 **Fully Open Source** - MIT licensed, audit the code, contribute features
- ⚡ **Fast Generation** - Generate 1,000 rows in under 200ms
- 🔧 **Zero Config** - Just point to your schema and go
- 🎲 **Deterministic** - Same seed = same data, perfect for tests
- 🛠️ **Developer Friendly** - Clear errors when schemas aren't supported

## 🚀 Quick Start

```bash
# Install globally
npm install -g foundrydata

# Create a schema file (user.json)
echo '{
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "email": { "type": "string", "format": "email" },
    "age": { "type": "integer", "minimum": 18, "maximum": 99 },
    "tags": { 
      "type": "array", 
      "items": { "type": "string" },
      "minItems": 1,
      "maxItems": 3
    }
  },
  "required": ["id", "email"]
}' > user.json

# Generate 100 test users
foundrydata generate --schema user.json --rows 100

# Output:
# ✅ Generated 100 rows (125ms)
# [
#   {
#     "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
#     "email": "john.doe@example.com",
#     "age": 42,
#     "tags": ["developer", "javascript", "api"]
#   },
#   ...
# ]
```

## 🏗️ Built Right from Day 1
- **Clean Architecture** - Simple to extend when needed
- **Type-Safe** - Full TypeScript, fewer runtime surprises
- **Well-Tested** - Works reliably, catches edge cases
- **Future-Proof** - Easy to add features as we grow

## 🤔 Why FoundryData?

**The Problem:** You spend hours debugging API tests because Faker.js generated an email without an `@` symbol, or a number outside your schema's range. Every "realistic" data generator violates your constraints.

**Our Solution:** FoundryData reads your JSON Schema and generates data that's **guaranteed** to pass validation. If we can't guarantee compliance, we tell you exactly why and when we'll support it.

### FoundryData vs Others

| Feature | FoundryData | Faker.js | Mockaroo | JSON Generator |
|---------|------------|----------|----------|----------------|
| Schema Validation | ✅ 100% | ❌ None | ⚠️ Partial | ⚠️ Basic |
| Open Source | ✅ MIT | ✅ MIT | ❌ No | ⚠️ Freemium |
| CLI Tool | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| Deterministic | ✅ Yes | ✅ Yes | ⚠️ Limited | ✅ Yes |
| Clear Errors | ✅ Yes | N/A | ❌ No | ❌ No |

## 📚 Examples

### Real-World Schemas

**E-commerce Product Catalog**
```bash
# Generate 1000 products for your store
foundrydata generate --schema examples/ecommerce-schema.json --rows 1000 --output products.json

# Sample output:
# {
#   "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
#   "sku": "PROD-12345",
#   "name": "Wireless Bluetooth Headphones",
#   "price": 79.99,
#   "category": "electronics",
#   "inStock": true,
#   "stockQuantity": 150,
#   "rating": 4.3
# }
```

## ❗ Error Handling

- Stable error codes: all errors expose a durable `error.errorCode` (see `docs/errors/README.md`).
- Mappings: `getExitCode(error.errorCode)` and `getHttpStatus(error.errorCode)` are exported from `@foundrydata/core`.
- Presentation layer: use `ErrorPresenter` to format errors for CLI, API, or production logs.

Example (CLI):
```ts
import { ErrorPresenter, ErrorCode, FoundryError } from '@foundrydata/core';

const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
const presenter = new ErrorPresenter(env, { colors: true });

// Wrap unknown errors safely
function toFoundryError(err: unknown) {
  return err instanceof FoundryError
    ? err
    : new (class extends FoundryError {})({
        message: err instanceof Error ? err.message : String(err),
        errorCode: ErrorCode.INTERNAL_ERROR,
      });
}

try {
  // ... your code
} catch (e) {
  const error = toFoundryError(e);
  const view = presenter.formatForCLI(error);
  // render view.title/code/location/etc.
  process.exit(error.getExitCode());
}
```

Example (API-style):
```ts
const view = presenter.formatForAPI(error);
// Send RFC 7807-like response:
// status = view.status
// body = { type: view.type, title: view.title, detail: view.detail, code: view.code, path: view.path }
```

Documentation pages for each error code are linked via `type: https://foundrydata.dev/errors/{CODE}`.

## 🧰 Validator Configuration

FoundryData guarantees compliance by validating every generated row with AJV. The validator is strict by default (types, numbers, formats) and supports multiple JSON Schema drafts.

Key behaviors
- Draft auto‑detection: picks AJV 2020‑12, 2019‑09, or draft‑07 based on `$schema` (with heuristics if absent). Default is 2020‑12.
- Formats asserted: `validateFormats: true` with `ajv-formats` (+ 2019‑specific formats when needed).
- Tuple handling: tolerant by default for concise tuple schemas (see `strictTuples` below).

Advanced options (programmatic)
```ts
import { ComplianceValidator } from '@foundrydata/core';

// Defaults: auto draft, strict types/formats, tolerant tuple checks
const validator = new ComplianceValidator({
  // Force a specific draft instead of auto-detection
  // draft: 'draft-07' | '2019-09' | '2020-12'
  // draft: '2020-12',

  // Control how AJV enforces tuple shape hints
  // - false: allow concise tuples (default)
  // - 'log': report tuple shape issues without failing
  // - true: require minItems/maxItems/items to reflect prefixItems exactly
  // strictTuples: false,

  // Other strict options (defaults shown)
  // Most strict flags also accept 'log' to report without failing
  strict: true,            // boolean | 'log'
  validateFormats: true,
  strictTypes: true,       // boolean | 'log'
  strictNumbers: true,     // boolean | 'log'
  strictRequired: false,   // boolean | 'log'
  strictSchema: true,      // boolean | 'log'
  allowUnionTypes: false,  // allow TS-like "string|number" (non-standard)
  removeAdditional: false,
  useDefaults: false,
  coerceTypes: false,
});

// Validate a batch (used internally by the generation pipeline)
const result = validator.validate([{ id: '...' }], schemaObject);
if (result.isErr()) {
  console.error(result.error);
}
```

When to override
- `draft`: force a draft in CI or when ingesting third‑party schemas with ambiguous/missing `$schema`.
- `strictTuples`: set to `'log'` in CI to surface tuple modeling issues early, or `true` to enforce explicit tuple constraints.
- `strictSchema`: set to `'log'` if clients use unknown keywords or mixed drafts; keep `true` for owned schemas.
- `strictRequired`: set to `'log'` if `required` sometimes omet properties; keep `true` for strict schema hygiene.

**SaaS User Management**
```bash
# Generate test users for your SaaS dashboard
foundrydata generate --schema examples/saas-user-schema.json --rows 500 --seed 42

# Perfect for testing user onboarding, billing, and analytics
```

**Financial Transaction Data**
```bash
# Generate payment transactions for testing
foundrydata generate --schema examples/api-transaction-schema.json --rows 2000

# Includes realistic amounts, currencies, and status distributions
```

### 🔗 Resolve (CLI)

If your schema uses external `$ref` (pointing to other documents), you can ask the CLI to resolve them (bundle) before generation. In‑document `$ref` are already handled by the core; this flag is only needed for external references.

```bash
# Resolve external refs, then generate 100 items with a deterministic seed
foundrydata generate \
  --schema path/to/schema.json \
  --resolve-externals \
  --rows 100 \
  --seed 424242

# Note: Validation still runs against your original schema
# (including refs). Resolution is used for planning/generation.
```

Best practice
- Provide an explicit `$schema` and `$id` in your documents
- Prefer `$defs` (2020‑12) to share local definitions
- Use `prefixItems` + `unevaluatedItems: false` and `unevaluatedProperties: false` when targeting 2020‑12

### ⚙️ Compat Mode (CLI)

FoundryData supports common composition and object keywords for planning/generation:

- Composition: `allOf` (merged), `anyOf`/`oneOf` (deterministic branch), `not` (inverted)
- Arrays: tuple validation via `items: []` (draft‑07) and `additionalItems` (boolean | schema)
- Objects: `patternProperties`, `propertyNames`, `dependentSchemas` (phase 1)
- References: in‑document `$ref` (with `definitions` → `$defs` normalization)

Conditional schemas (`if/then/else`) are parsed and supported with pragmatic heuristics during planning and a post‑generation repair pass. In `strict` (default), conditional keywords fail fast; use `lax` to proceed and still guarantee 100% AJV compliance of outputs.

```bash
foundrydata generate \
  --schema path/to/schema.json \
  --rows 100 \
  --seed 424242 \
  --compat lax
```

Notes
- Validation still runs against your original schema; outputs are guaranteed to be 100% compliant.
- `--compat lax` is best‑effort: a summary of unsupported features is recorded in the internal plan.
- In CLI, `--compat lax` also logs detected unsupported features to stderr (e.g., `[foundrydata] compat=lax unsupported: ["if","then","else"]`).

### 📊 Metrics (CLI)

Ask the CLI to print a structured metrics JSON (to stderr) alongside the generated items (on stdout):

```bash
foundrydata generate \
  --schema examples/quick-test-schema.json \
  --rows 100 \
  --seed 424242 \
  --print-metrics

# stderr (example):
# [foundrydata] metrics: {
#   "durations": { "parseMs": 3, "resolveMs": 1, "planMs": 0, "generateMs": 7, "validateMs": 2, "totalMs": 13 },
#   "itemsGenerated": 100,
#   "formatsUsed": ["uuid","email","date","date-time"],
#   "validatorCacheHitRate": 0.95,
#   "compiledSchemas": 1,
#   "memory": { "rss": 12345678, "heapUsed": 987654 },
#   "itemsRepaired": 2,
#   "repairAttemptsUsed": 2
# }
```

Notes
- Metrics go to stderr to keep stdout a clean JSON stream of items.
- `itemsRepaired`/`repairAttemptsUsed` summarize the bounded, deterministic repair loop used to ensure 100% compliance.

### Basic Usage

```bash
# Generate with deterministic seed (same data every time)
foundrydata generate --schema user.json --rows 50 --seed 42

# Output to file
foundrydata generate --schema user.json --rows 1000 --output users.json

# Help command
foundrydata --help
```

### Supported Schema Features

```javascript
{
  "type": "object",
  "properties": {
    // ✅ Basic types
    "name": { "type": "string", "minLength": 2, "maxLength": 50 },
    "age": { "type": "integer", "minimum": 0, "maximum": 120 },
    "score": { "type": "number", "minimum": 0.0, "maximum": 100.0 },
    "active": { "type": "boolean" },
    
    // ✅ String formats
    "id": { "type": "string", "format": "uuid" },
    "email": { "type": "string", "format": "email" },
    "birthday": { "type": "string", "format": "date" },
    "created": { "type": "string", "format": "date-time" },
    "patternLiteral": { "type": "string", "format": "regex" },
    
    // ✅ Basic regex patterns
    "productCode": { "type": "string", "pattern": "^[A-Z]{3}-[0-9]{4}$" },
    "slug": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    
    // ✅ Enums
    "role": { "type": "string", "enum": ["admin", "user", "guest"] },
    
    // ✅ Arrays (primitives + nested objects up to depth 2)
    "tags": { 
      "type": "array", 
      "items": { "type": "string" },
      "minItems": 1,
      "maxItems": 5
    },
    "scores": {
      "type": "array",
      "items": { "type": "integer", "minimum": 0, "maximum": 100 },
      "minItems": 3,
      "maxItems": 10
    },
    
    // ✅ Arrays of nested objects (depth ≤ 2) supported  
    "permissions": { 
      "type": "array",
      "items": { 
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "level": {"type": "integer"}
        }
      }
    },
    
    // ✅ Nested objects (depth ≤ 2) supported
    "address": {
      "type": "object",
      "properties": {
        "street": { "type": "string" },
        "city": { "type": "string" },
        "details": {
          "type": "object",
          "properties": {
            "unit": { "type": "string" }
          }
        }
      }
    }
  },
  "required": ["id", "email"]
}
```

### Clear Error Messages (strict)

```bash
# When using unsupported features
foundrydata generate --schema complex.json

# ❌ Error: Unsupported features in strict mode: if, then, else
# 
# In strict mode, conditional keywords fail fast. Use `--compat lax` to proceed
# with planning/generation and rely on AJV for 100% validation of outputs.
# 
# Want them sooner? Vote or contribute:
# https://github.com/foundrydata/foundrydata/issues
```

## ☁️ API Access (Planned for Future)

**Current MVP:** CLI only - no API available yet

**Future:** If users request CI/CD integration, we may build a simple API for teams.

The CLI will **always** be free and open source. Any future API would fund continued development.

Want an API? [Let us know in the discussions →](https://github.com/foundrydata/foundrydata/discussions)

## 🤝 Contributing

We love contributions! FoundryData is 100% open source and community-driven.

```bash
# Clone the repo
git clone https://github.com/foundrydata/foundrydata.git
cd foundrydata

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Submit your PR!
```

See [CONTRIBUTING.md](https://github.com/foundrydata/foundrydata/blob/main/CONTRIBUTING.md) for more details.

### Integration & Generator Compliance Tests

- Run all tests (root config):
  - `npm test`

- Run test utilities and integration (test config):
  - `npm run test:matchers`
  - `npm run test:performance`

- Run Generator Compliance Integration suite only:
  - `npm run test:gen:compliance`
  - With heavy assertions (p50/p99 and large memory check):
    - `npm run test:gen:compliance:extra`

Performance thresholds are centralized in `test/__tests__/integration/setup.ts` and can be tuned via environment variables to account for host variability:

- Pipeline thresholds:
  - `PIPELINE_P50_MS` (default 10)
  - `PIPELINE_P95_MS` (default 20)
  - `PIPELINE_P99_MS` (default 50)

- Generator compliance thresholds:
  - `GEN_COMPLIANCE_P50_MS` (default 120)
  - `GEN_COMPLIANCE_P95_MS` (default 200)
  - `GEN_COMPLIANCE_P99_MS` (default 500)
  - `GEN_COMPLIANCE_ASSERT_EXTRA=true` to enable extra assertions and heavy memory test

Memory thresholds (heap delta) are also centralized:
- `PERFORMANCE_THRESHOLDS.memory.medium` (default 50MB for ~3k records)
- `PERFORMANCE_THRESHOLDS.memory.large` (default 100MB for ~10k records; only asserted when `GEN_COMPLIANCE_ASSERT_EXTRA=true`)

### Planned Integrations (Community Requested)

Future versions may include:
- Prisma schema support (if requested)
- GitHub Action for CI/CD (if requested) 
- VS Code extension (if requested)

Want these features? [Vote on our roadmap →](https://github.com/foundrydata/foundrydata/discussions)

### Good First Issues

Looking to contribute? Here are some features the community has requested:

- Add additional string formats (`ipv4`, `hostname`, `phone`)
- Improve error messages for unsupported features
- Add more example schemas
- Improve documentation
- Create integration examples

[See all issues →](https://github.com/foundrydata/foundrydata/issues)

## 📊 Project Status

- **Current Version:** v0.1.0 (MVP - basic types, arrays of nested objects up to depth 2, core formats)
- **Next Release:** Based on community feedback and requests
- **Philosophy:** Correctness first, determinism, and clarity; add complexity only when guarantees hold.

See our [Discussions](https://github.com/foundrydata/foundrydata/discussions) for what's being considered next.

## 🏗️ Architecture

```
foundrydata/
├── packages/
│   ├── core/                # @foundrydata/core - Generation engine
│   ├── cli/                 # foundrydata CLI wrapper  
│   └── shared/              # Shared utilities
├── examples/                # Sample schemas
└── docs/                    # Documentation & guides
```

**Simple but solid:** Clean code that's easy to understand, extend, and debug. Built to last without the bloat.

## 📈 Stats

*Project statistics will appear here once the project is public and has some usage data.*

## 🙏 Acknowledgements

Built on top of these awesome projects:
- [Faker.js](https://github.com/faker-js/faker) - For base data generation
- [AJV](https://github.com/ajv-validator/ajv) - For schema validation
- [Commander.js](https://github.com/tj/commander.js) - For CLI interface

## 📄 License

MIT © [FoundryData Contributors](https://github.com/foundrydata/foundrydata/graphs/contributors)

---

<div align="center">
  <p>
    <sub>Built with ❤️ by <a href="https://github.com/fstepho">@fstepho</a> and <a href="https://github.com/foundrydata/foundrydata/graphs/contributors">contributors</a></sub>
  </p>
  <p>
    <a href="https://github.com/foundrydata/foundrydata/stargazers">⭐ Star us on GitHub!</a> •
    <a href="https://twitter.com/foundrydata">𝕏 Follow on Twitter</a> •
    <a href="https://foundrydata.dev">🌐 Website</a>
  </p>
</div>
