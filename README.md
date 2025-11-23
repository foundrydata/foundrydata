# FoundryData — AJV-first Test Data Engine for CI

> Deterministic, schema-true test data for JSON Schema & OpenAPI.
> **Designed for CI:** reproducible fixtures, AJV-validated, with explicit metrics and limits.

---

**Implementation Status**

- ✅ **Implemented**
  - CLI (`foundrydata`)
  - 5-stage generation pipeline
  - Core engine (`@foundrydata/core`)
  - Performance benchmarks & metrics
  - Comprehensive test coverage
- 📋 **Planned**
  - REST API (`packages/api/`)

---

## Table of contents

- [What is FoundryData?](#what-is-foundrydata)
- [Why use it in CI?](#why-use-it-in-ci)
- [Problems it solves](#problems-it-solves)
- [Key CI use cases](#key-ci-use-cases)
- [How it works (high level)](#how-it-works-high-level)
- [Who is it for?](#who-is-it-for)
- [Installation](#installation)
- [Quick start](#quick-start)
- [CI integration examples](#ci-integration-examples)
- [Core invariants](#core-invariants)
- [Pre-flight & 5-stage pipeline](#pre-flight--5-stage-pipeline)
- [Feature support (summary)](#feature-support-summary)
- [CLI](#cli)
- [Node.js API](#nodejs-api)
- [Metrics & SLO/SLI](#metrics--slosli)
- [Strict vs Lax behavior](#strict-vs-lax-behavior)
- [Development](#development)
- [Testing (high level)](#testing-high-level)
- [License](#license)

---

## What is FoundryData?

FoundryData is an **AJV-first test data engine** for JSON Schema and OpenAPI 3.1.

It generates **deterministic, schema-true fixtures** from your schemas and specs, so your CI pipelines can rely on data that:

- matches the same validator posture you use in production (AJV),
- is fully reproducible (seeded),
- exposes metrics and limits (latency, validations per row, complexity caps).

You can use it as:

- a **CLI** (`foundrydata`) to generate JSON / NDJSON in your test scripts and CI jobs,
- a **Node.js library** (`@foundrydata/core`) to plug directly into your test runner or tooling.

---

## Why use it in CI?

Most teams already have JSON Schemas or OpenAPI specs, but still:

- hand-write fixtures that drift away from the contract,
- rely on “best-effort” generators that don’t always agree with AJV,
- debug intermittent test failures caused par des données non déterministes.

FoundryData is built specifically to make those issues moins fréquents dans les pipelines CI :

- **Same schema + same seed ⇒ same data.**  
  You can replay exactly the dataset that triggered a regression.
- **AJV is the oracle.**  
  Every item is validated against the **original schema** (in strict mode), not an internal rewrite.
- **Metrics & limits.**  
  You can track how much validation is happening per row, how long the pipeline takes, and where it degrades under complex schemas.

---

## Problems it solves

In CI / test pipelines:

- **Fixture drift**
  - JSON fixtures diverge over time from the schema or OpenAPI spec.
  - Tests start passing on data that your real services would never accept or produce.

- **Generators that “almost” respect the schema**
  - Simple cases work, edge cases don’t.
  - Complex constructs (`allOf/anyOf/oneOf`, conditionals, `additionalProperties:false`, etc.) are loosely implemented.

- **Non-deterministic test data**
  - A failing test can’t be reproduced locally because the generator produces different cases on every run.
  - Load tests and contract tests can’t be compared across builds.

- **No visibility on generation cost**
  - Hard to know why a generator suddenly becomes slow or memory-heavy as schemas grow.

---

## Key CI use cases

Some concrete scenarios:

- **Backend / API tests**
  - Generate request and response payloads from JSON Schemas or OpenAPI 3.1.
  - Use them as fixtures in Jest/Vitest/Mocha or integration tests.

- **Contract-driven tests**
  - Use the same schemas that drive AJV in your services to drive the test data.
  - Ensure changes to schemas are reflected in fixtures immediately.

- **End-to-end & load testing**
  - Generate realistic, schema-driven data for E2E tests and load tests (k6, Artillery, etc.).
  - Keep the datasets stable between runs via seeds.

- **Incident reproduction**
  - When a failing CI build generates bad data or reveals a bug, reuse the same seed locally or in a dedicated reproduction job.

---

## How it works (high level)

FoundryData treats your schemas as **executable contracts**:

1. **You provide a JSON Schema or an OpenAPI 3.1 spec.**
2. **FoundryData generates items through a 5-stage pipeline**
   (`Normalize → Compose → Generate → Repair → Validate`).
3. **AJV validates final items against the original schema** (in strict mode).
4. **Metrics and diagnostics** are emitted per stage.

The result is a stream of JSON objects you can pipe into your tests, plus optional metrics you can observe in CI.

---

## Who is it for?

Primarily:

- **API and platform teams**  
  who already use JSON Schema / OpenAPI + AJV and want their CI tests to follow the same contracts.

- **QA and SRE / reliability teams**  
  who need reproducible datasets for debugging, incident analysis, and non-flaky tests.

- **Backend / microservice teams**  
  who want to stop maintaining ad-hoc fixtures by hand and instead treat schemas as the single source of truth.

---

## Installation

Requires **Node.js 20+** and an environment that supports ES modules.

### CLI

```bash
# Try the CLI without a global install
npx foundrydata generate --schema user.json --n 10

# Or install globally
npm install -g foundrydata
foundrydata generate --schema user.json --n 10
````

### Node.js library

```bash
npm install @foundrydata/core
```

---

## Quick start

Generate schema-true test data from a JSON Schema:

```bash
# Basic generation — validate schema then generate 100 rows
foundrydata generate --schema user.schema.json --n 100

# Deterministic output — same seed ⇒ same data
foundrydata generate --schema user.schema.json --n 1000 --seed 42

# Print metrics (timings, validations/row, etc.) to stderr
foundrydata generate --schema user.schema.json --n 1000 --print-metrics
```

Work with OpenAPI 3.1 responses:

```bash
# Generate 3 response payloads for an operationId
foundrydata openapi \
  --spec api.openapi.json \
  --operation-id getUser \
  --n 3 \
  --out ndjson
```

Notes:

* Generated **data goes to stdout** (for piping into tests or files).
* **Metrics and errors go to stderr** (for CI logs).

---

## CI integration examples

### Jest / Vitest (Node.js)

Use the CLI to generate fixtures before running tests:

```bash
# package.json
{
  "scripts": {
    "test": "npm run gen:test-data && jest",
    "gen:test-data": "foundrydata generate --schema ./schemas/user.schema.json --n 200 --seed 424242 > ./test-fixtures/users.json"
  }
}
```

In your tests:

```ts
import users from './test-fixtures/users.json';

test('createUser accepts schema-true payloads', async () => {
  for (const user of users) {
    const res = await api.createUser(user);
    expect(res.status).toBe(201);
  }
});
```

### GitHub Actions

Run FoundryData as part of your CI job:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - name: Generate test data from JSON Schemas
        run: |
          foundrydata generate --schema ./schemas/user.schema.json --n 500 --seed 42 > ./test-fixtures/users.json
          foundrydata generate --schema ./schemas/order.schema.json --n 200 --seed 42 > ./test-fixtures/orders.json

      - name: Run tests
        run: npm test
```

Because generation is deterministic, you can:

* reuse the same seeds locally to reproduce failures,
* compare metrics across runs (e.g. p95 latency, validations/row) if you log them.

---

## Core invariants

These guarantees hold for the full pipeline (CLI and high-level Node API):

* **AJV is the oracle**
  When validation is executed, it is performed **against the original schema** (not internal transforms).

* **Deterministic by design**
  Same schema + same seed ⇒ same data.
  Generation attempts are bounded; there is no global RNG.

* **Pipeline with explicit responsibilities**
  Each stage has a clear role and explicit diagnostics.

* **Performance targets, not promises**
  The engine tracks latency and memory and degrades gracefully under complexity caps. SLOs are documented rather than hard guarantees.

* **External `$ref` behavior is explicit**
  By default, runs are offline-friendly. External `$ref` resolution and skip paths in Lax mode are opt-in and visible via diagnostics.

---

## Pre-flight & 5-stage pipeline

**Pre-flight (Parse)**
Draft detection, basic shape checks, early rejection of malformed schemas.
This is a preparatory step, not part of the normative pipeline.

**Generation pipeline (5 stages)**

```text
Normalize → Compose → Generate → Repair → Validate
```

* **Normalize**
  Draft-aware canonicalization; the original schema is preserved for AJV.
  Conservative handling of conditionals by default.

* **Compose**
  Build an effective view without mutating the canonical schema;
  must-cover for `additionalProperties:false`; bag semantics for `contains`;
  rational arithmetic for `multipleOf`; deterministic branch scoring/Top-K for `anyOf/oneOf`.

* **Generate**
  Seeded, deterministic generation; `enum/const` outrank `type`;
  **if-aware-lite** strategy when not rewriting conditionals.

* **Repair**
  AJV-driven corrections (`keyword → action`) with budgets and stagnation guard; idempotent.

* **Validate**
  Final AJV validation **against the original schema** when executed.
  In Lax mode, when failures are due only to unresolved external `$ref`, this stage may record `skippedValidation:true` plus diagnostics instead of running AJV over generated items.

---

## Feature support (summary)

* **Composition & logic**
  `allOf` / `anyOf` / `oneOf` / `not`; deterministic branch selection; early-unsat checks; graceful degradation under caps.

* **Conditionals**
  Default **no rewrite**; optional **safe** rewrite under strict guards; generator uses **if-aware-lite** hints.

* **Objects**
  Must-cover intersection when `additionalProperties:false` across `allOf`;
  `patternProperties` overlap analysis; `propertyNames`; `dependent*`;
  `unevaluated*` preserved for validation.

* **Arrays**
  Tuples (`prefixItems`), implicit max length with `items:false`;
  `contains` uses **bag semantics** across `allOf`;
  `uniqueItems` with structural hashing.

* **Numbers**
  Exact **rational** `multipleOf` with bit/LCM caps and controlled fallbacks (`decimal` / `float`).

* **Refs**
  In-document `$ref` supported.
  External `$ref`: default **error**, policy configurable; remote/registry resolution is opt-in via resolver options; `$dynamicRef/*` preserved.

---

## CLI

### Usage

```bash
foundrydata generate --schema <path> --n <count> [options]
foundrydata openapi --spec <openapi.json> [selection] [options]
```

### Selected options (`generate`)

| Option                           | Description                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-s, --schema <path>`            | JSON Schema file path (required).                                                                                                                                                                |
| `-c, --count <n>`                | Number of items to generate (primary flag).                                                                                                                                                      |
| `-n, --n <n>`                    | Alias for `--count`; short form used in examples.                                                                                                                                                |
| `-r, --rows <n>`                 | Legacy alias for `--count`; still accepted for backwards compatibility.                                                                                                                          |
| `--seed <n>`                     | Deterministic seed (default: `424242`).                                                                                                                                                          |
| `--out <format>`                 | Output format: `json` | `ndjson` (default: `json`).                                                                                                                                              |
| `--print-metrics`                | Print structured metrics to **stderr**.                                                                                                                                                          |
| `--no-metrics`                   | Disable metrics collection in the pipeline.                                                                                                                                                      |
| `--mode <mode>`                  | Execution mode: `strict` | `lax`. Takes precedence over `--compat` when both are provided.                                                                                                       |
| `--compat <mode>`                | Compatibility surface: `strict` | `lax`. Defaults to `strict` when neither `--mode` nor `--compat` is provided.                                                                                  |
| `--prefer-examples`              | Prefer schema/OpenAPI examples when present, falling back to generated data.                                                                                                                     |
| `--external-ref-strict <policy>` | Policy for external `$ref`: `error` (default) or `warn`. Controls handling of unresolved externals; network resolution is governed separately by resolver options such as `--resolve`. |
| `--resolve <strategies>`         | Resolver strategies for external `$ref`: comma-separated list of `local`, `remote`, `schemastore`. Default is `local` (offline-friendly; no network).                                            |
| `--cache-dir <path>`             | Override on-disk cache directory used by the resolver extension when fetching and caching external schemas.                                                                                      |
| `--fail-on-unresolved <bool>`    | When set to `false` in Lax mode, enables planning-time stubs for unresolved externals (maps to `resolver.stubUnresolved = 'emptySchema'` in plan options).                                       |

For the full set of options:

```bash
foundrydata generate --help
```

---

## Node.js API

Install the library:

```bash
npm install @foundrydata/core
```

> The guarantees below apply to the **full pipeline**.
> Using individual stages is supported, but final schema compliance is only guaranteed if you execute **Validate** at the end.

### High-level facades

* `Normalize(schema, options?)` — run the normalizer and return `{ canonSchema, ptrMap, notes }` without mutating the original schema.
* `Compose(schema, { mode, seed?, planOptions? })` — run normalization + composition and return `{ coverageIndex, planDiag, nameDfaSummary? }`.
* `Generate(k, seed, schema, options?)` — run the full 5-stage pipeline and return an async iterable of instances with an attached `result: Promise<PipelineResult>`.
* `Validate(instance, originalSchema, options?)` — validate a single instance against the original schema using the same AJV posture as the pipeline and return `{ valid, ajvErrors? }`.

### High-level: `Generate` + `Validate`

```ts
import { Generate, Validate } from '@foundrydata/core';

const schema = {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
} as const;

// Deterministic generation: same seed => same data
const stream = Generate(100, 42, schema, {
  mode: 'strict',
  preferExamples: false,
  validateFormats: true,
});

const result = await stream.result;
if (result.status !== 'completed') {
  throw result.errors[0] ?? new Error('Generation pipeline failed');
}

// Items are already repaired + AJV-validated against the original schema
const items =
  result.artifacts.repaired ?? result.stages.generate.output?.items ?? [];

// Optional: spot-check with the public Validate API
for (const item of items) {
  const v = Validate(item, schema, { validateFormats: true });
  if (!v.valid) {
    console.error('Unexpected validation failure', v.ajvErrors);
  }
}
```

### Low-level: full pipeline (`executePipeline`)

```ts
import { executePipeline } from '@foundrydata/core';

const schema = {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
};

const result = await executePipeline(schema, {
  mode: 'strict', // or 'lax'
  metrics: { enabled: true },
  generate: {
    count: 100,
    seed: 42,
    planOptions: {
      // Default conditional policy: no rewrite; generator uses if-aware-lite hints
      rewriteConditionals: 'never',
    },
  },
  repair: {
    attempts: 1,
  },
  validate: {
    validateFormats: true, // Enable format validation via ajv-formats
  },
});

if (result.status === 'completed') {
  const items =
    result.artifacts.repaired ?? result.stages.generate.output?.items ?? [];
  console.log('Generated', items.length, 'items');
  console.error('Metrics', result.metrics);
} else {
  console.error('Pipeline failed:', result.errors);
}
```

### AJV / formats policy

* At the pipeline level (`executePipeline` and the `Validate` facade), formats are **annotative** by default: `validateFormats:false`.
* You can enable assertive format validation via `ajv-formats` by setting `validate.validateFormats: true` (or `Validate(..., { validateFormats: true })`).
* The high-level `Generate` facade (and the CLI, which delegates to it) passes `validateFormats:true` to the pipeline by default, so CLI/`Generate` runs perform assertive format validation unless you explicitly opt out.

---

## Metrics & SLO/SLI

FoundryData tracks metrics for the pipeline; useful when running in CI at scale:

```ts
{
  normalizeMs: number;
  composeMs: number;
  generateMs: number;
  repairMs: number;
  validateMs: number;
  validationsPerRow: number;    // AJV validations / row
  repairPassesPerRow: number;   // repair loops / row
  branchTrialsTried: number;
  memoryPeakMB?: number;        // optional (bench harness)
  p50LatencyMs?: number;        // optional (CI)
  p95LatencyMs?: number;        // optional (CI)
}
```

Heuristics:

* **Quality indicators** (simple/medium schemas):
  `validationsPerRow ≤ 3`, `repairPassesPerRow ≤ 1`.
* **SLO targets** (documented, not hard guarantees):
  ~1000 rows (simple/medium) p50 ≈ 200–400 ms.
* **Memory**
  Usage is tracked; you can hook alerts in CI if desired.

Benchmarks are enforced via repo-level scripts (`npm run bench`, `npm run bench:real-world`), which write `bench/bench-gate*.json` and compare p95 latency and peak memory against budgets.

Metrics are printed to **stderr** when `--print-metrics` is enabled.

---

## Strict vs Lax behavior

| Situation                               | **Strict** (default)     | **Lax**                                                                                                                                      |
| --------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| External `$ref`                         | `error` (configurable)   | `warn` then attempt generation **without deref**; validate against original schema when possible, or mark validation as skipped on externals |
| `$dynamicRef/*` present                 | note only                | note only                                                                                                                                    |
| Complexity caps                         | degrade with diagnostics | same                                                                                                                                         |
| Conditional strategy when not rewriting | **if-aware-lite**        | same                                                                                                                                         |

Strict vs Lax does **not** change whether remote lookup is used; remote/registry resolution is always opt-in via resolver configuration (default is local-only, offline-friendly).

---

## Development

From the repository root (`foundrydata-monorepo`, Node.js 20+):

* **Build**: `npm run build`
* **Typecheck**: `npm run typecheck`
* **Tests**: `npm run test`
* **Formatting**: `npm run format`

Monorepo structure:

* `packages/core` — engine
* `packages/cli` — CLI
* `packages/shared` — shared utilities
* `packages/reporter` — reporting + bench harness

---

## Testing (high level)

* **Unit per stage**

  * `packages/core/src/transform/__tests__` (normalizer + composer)
  * `packages/core/src/generator/__tests__` (determinism, precedence, coverage)
  * `packages/core/src/repair/__tests__` (idempotence, snapping)
  * plus `diag`/`util` units (draft detection, dynamic refs, etc.)

* **Pipeline & integration**

  * `packages/core/src/pipeline/__tests__`
  * `packages/core/test/e2e/pipeline.integration.spec.ts`
    (end-to-end `executePipeline`, AJV flags parity, external `$ref` / `$dynamicRef` policies, skip-flows, diagnostics, final validation).

* **Reporter & bench/CI**

  * `packages/reporter/test/reporter.snapshot.test.ts` (stable JSON/Markdown/HTML reports)
  * `packages/reporter/test/bench.runner.test.ts` (bench runner + summary used by repo-level bench scripts to track p50/p95 and caps).

For a broader docs index (spec, limits, examples, testing architecture), see `docs/README.md`.

---

## License

MIT.

FoundryData is open source-first and offline-friendly by design.
