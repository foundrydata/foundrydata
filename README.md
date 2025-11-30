# FoundryData

> AJV-first contract execution, coverage and deterministic fixtures for JSON Schema & OpenAPI.

FoundryData is an AJV-first contract execution engine. It turns your JSON Schema or OpenAPI 3.1 contracts into deterministic, AJV-valid fixtures **plus** coverage and metrics you can plug into CI. The goal is not to “fake” realistic data, but to execute your schemas as they are written, show you what they actually cover (structure / branches / enums), and feed your tests with just enough valid data to exercise those contracts in a reproducible way.

### Why FoundryData?

- **Contract-true**  
  Every generated item is validated by AJV in strict mode before it leaves the pipeline. If FoundryData produces it, your API (using the same AJV config) would accept it.

- **Deterministic by design**  
  `same schema + same seed ⇒ same data`. CI failures are reproducible locally by re-running the same command with the same seed.

- **Observable contracts**  
  Coverage over structure / branches / enums, JSON coverage reports, and per-run metrics (latency, validations per row, complexity caps) make it possible to see how well your contracts are exercised, not just whether individual items validate.

- **Built for CI, not for pretty demos**  
  JSON/NDJSON on stdout, metrics on stderr, and a composable 5-stage pipeline make it easy to plug into Jest/Vitest, GitHub Actions, or any other CI system.

### What FoundryData is not

FoundryData focuses on **valid instances, contract coverage and reproducibility**. It is not:

- a fake data generator for pretty or “realistic” demo payloads,
- an HTTP mock server or full API simulator,
- a fuzzing engine for large volumes of invalid inputs.

If you need synthetic data for demos or front-end prototypes, or if you want to fuzz invalid payloads aggressively, you should pair FoundryData with other tools. FoundryData’s role is to keep your tests and CI honest about what your contracts actually say and what they really cover.

---

### Try it in 60 seconds

```bash
npx foundrydata generate \
  --schema ./examples/user.schema.json \
  --n 5 \
  --seed 42
```

This will:

1. Compile `user.schema.json` with AJV in strict mode.
2. Generate 5 JSON instances that are valid for this schema.
3. Produce the exact same 5 objects every time you run with `--seed 42`.

You can also try the full CLI+AJV flow via:

```bash
./examples/01-basic-json-schema/demo.sh
```

This script uses the same schema, shows the first 3 generated user objects, and validates all items with AJV from this repo.

* * *

Implementation Status

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
- [Why do I get `{}`?](#why-do-i-get-)
- [Why use it in CI?](#why-use-it-in-ci)
- [Problems it solves](#problems-it-solves)
- [Key CI use cases](#key-ci-use-cases)
- [How it works (high level)](#how-it-works-high-level)
- [Who is it for?](#who-is-it-for)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Quick evaluation on your project](#quick-evaluation-on-your-project)
- [CI integration examples](#ci-integration-examples)
- [Core invariants](#core-invariants)
- [Pre-flight & 5-stage pipeline](#pre-flight--5-stage-pipeline)
- [Coverage-aware generation](#coverage-aware-generation)
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

FoundryData is an **AJV-first contract execution and coverage engine** for JSON Schema and OpenAPI 3.1.

It generates **deterministic, schema-true fixtures** and **contract coverage metrics** from your schemas and specs, so your CI pipelines can rely on data and reports that:

- match the same validator posture you use in production (AJV),
- are fully reproducible (seeded),
- expose metrics and limits (latency, validations per row, complexity caps),
- show which parts of your contracts are actually exercised (structure, branches, enums, operations).

You can use it as:

- a **CLI** (`foundrydata`) to execute contracts in your test scripts and CI jobs (fixtures + coverage reports),
- a **Node.js library** (`@foundrydata/core`) to plug directly into your test runner or tooling.

* * *
## Why do I get `{}`?

If FoundryData returns `{}` (or very minimal data), it is not hiding anything. It is showing you that, according to JSON Schema, an empty object is a valid instance of your schema.

FoundryData intentionally generates the minimal AJV-valid instance for a schema. On many real-world schemas, that minimal instance is `{}` because:

- No properties are marked as `required`.
- There are no `minItems`, `minLength`, `minimum`, etc.
- `additionalProperties` is allowed (or not restricted).

In other words: if you get `{}`, your schema is very permissive. That can be fine for validation in production, but it is usually not expressive enough for generating interesting test data.

### Example: permissive vs expressive schema

#### Before: the permissive schema

```json
{
  "$id": "https://example.com/user.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "description": "A user object",
  "properties": {
    "id": {
      "type": "string"
    },
    "email": {
      "type": "string",
      "format": "email"
    },
    "age": {
      "type": "integer"
    }
  }
}
```

With this schema, all properties are optional, there are no minimums, and `{}` is a perfectly valid instance. FoundryData will therefore generate the minimal valid instance:

```bash
npx foundrydata generate \
  --schema ./user.schema.json \
  --n 1 \
  --seed 42
# → {}
```

#### After: making the schema test-friendly

```json
{
  "$id": "https://example.com/user.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "description": "A user object",
  "properties": {
    "id": {
      "type": "string",
      "minLength": 1
    },
    "email": {
      "type": "string",
      "format": "email",
      "minLength": 3
    },
    "age": {
      "type": "integer",
      "minimum": 0
    }
  },
  "required": ["id", "email"]
}
```

With these constraints, the minimal valid instance is no longer `{}`. Running FoundryData with the same command will now produce a non-empty object (exact values depend on the generator), and it will always be valid according to this schema.

* * *
## Why use it in CI?

Most teams already have JSON Schemas or OpenAPI specs, but still:

- hand-write fixtures that drift away from the contract,
- rely on "best-effort" generators that don't always agree with AJV,
- debug intermittent test failures caused by non-deterministic data.

FoundryData is built specifically to make those issues less frequent in CI pipelines:

- **Same schema + same seed ⇒ same data.**  
  You can replay exactly the dataset that triggered a regression.
- **AJV is the oracle.**  
  Every item is validated against the **original schema** (in strict mode), not an internal rewrite.
- **Metrics & limits.**  
  You can track how much validation is happening per row, how long the pipeline takes, and where it degrades under complex schemas.
- **Contract-level coverage.**  
  Optional coverage reports (structure / branches / enums) help you see which parts of a contract your tests actually exercise, not just whether individual payloads validate.

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

- **No visibility on which parts of the contract are exercised**
  - Tests hit some code paths, but it is unclear which branches / enums / structures of the JSON Schema or OpenAPI spec are actually used.
  - Contract changes can hide dead branches or untested additions without a contract-level coverage signal.

---

## Key CI use cases

Some concrete scenarios:

- **Contract coverage and drift detection**
  - Measure which parts of your JSON Schemas / OpenAPI contracts are exercised by generated fixtures.
  - Gate contract changes in CI with coverage reports and thresholds.

- **Backend / API tests**
  - Generate request and response payloads from JSON Schemas or OpenAPI 3.1.
  - Use them as fixtures in Jest/Vitest/Mocha or integration tests.

- **Contract-driven tests**
  - Use the same schemas that drive AJV in your services to drive the test data and get contract-level coverage reports as part of your test runs.
  - Ensure changes to schemas are reflected in fixtures immediately.

- **End-to-end & load testing**
  - Generate contract-true, schema-driven data for E2E tests and load tests (k6, Artillery, etc.).
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

If you clone this repository and want to run the `examples/01-basic-json-schema/demo.sh` script, run `npm install` once at the root so the bundled AJV dependencies are available.

### CLI

```bash
# Try the CLI without a global install
npx foundrydata generate --schema user.json --n 10

# Or install globally
npm install -g foundrydata
foundrydata generate --schema user.json --n 10
```

In the rest of this README, `foundrydata` assumes the CLI is available
(for example installed globally or as a devDependency and resolved via `node_modules/.bin`).
If you prefer not to install it, you can replace `foundrydata` with `npx foundrydata`
in the examples.

### Node.js library

```bash
npm install @foundrydata/core
```

This package is ESM-only (`"type": "module"`) and targets **Node.js 20+**.

```ts
// ESM / TypeScript
import { Generate, Validate } from '@foundrydata/core';
```

TypeScript type declarations are bundled (`"types": "dist/index.d.ts"`), so no separate `@types` package is required.

---

## Quick start

Generate schema-true test data from a JSON Schema:

```bash
# Basic generation — validate schema then generate 100 rows
foundrydata generate --schema ./examples/user.schema.json --n 100

# Deterministic output — same seed ⇒ same data
foundrydata generate --schema ./examples/user.schema.json --n 1000 --seed 42

# Print metrics (timings, validations/row, etc.) to stderr
foundrydata generate --schema ./examples/user.schema.json --n 1000 --print-metrics
```

Run contract-focused tests with coverage and a simple gate:

```bash
foundrydata contracts \
  --schema ./examples/payment.json \
  --n 200 \
  --seed 424242 \
  --coverage=measure \
  --coverage-profile=balanced \
  --coverage-dimensions=structure,branches,enum \
  --coverage-min 0.8 \
  --coverage-report ./coverage/payment.coverage.json
```

This profile executes the contract in strict mode, emits deterministic fixtures, records which parts of the schema are exercised (structure / branches / enums), and fails CI if overall coverage drops below `0.8`.

Work with OpenAPI 3.1 responses:

```bash
# Generate 3 response payloads for an operationId
foundrydata openapi \
  --spec examples/users-api.json \
  --operation-id getUsers \
  --n 3 \
  --out ndjson
```

Notes:

* Generated **data goes to stdout** (for piping into tests or files).
* **Metrics and errors go to stderr** (for CI logs).

---

## Quick evaluation on your project

If you want to know **in under an hour** whether FoundryData brings value to your existing JSON Schema / OpenAPI-based codebase, follow the short protocol in [EVALUATION.md](./EVALUATION.md).

It walks you through:
- running FoundryData on a **real JSON Schema / OpenAPI schema** from your project,
- inspecting the generated data to see whether your schemas are too permissive (lots of `{}`) or expressive enough,
- tightening the schema slightly and comparing before/after with the **same seed**,
- optionally wiring a minimal “generated fixtures” step into an existing test to see what new cases appear.

This is a good starting point to share with teammates who just want to quickly evaluate the value without committing to a full integration or changing their existing test architecture.

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

### Recommended contract-testing profile

For contract tests and integration tests, a reasonable starting profile is:

**CLI (fixtures + coverage gate + summary)**

```bash
foundrydata generate \
  --schema ./examples/payment.json \
  --n 200 \
  --seed 424242 \
  --mode strict \
  --out ndjson \
  --coverage=measure \
  --coverage-profile=balanced \
  --coverage-dimensions=structure,branches,enum \
  --coverage-min 0.8 \
  --coverage-report ./coverage/payment.coverage.json \
  --summary
```

This command generates deterministic NDJSON fixtures for the payment schema, validates all items with AJV in strict mode, emits a `coverage-report/v1` JSON for coverage=measure with a balanced profile, enforces a global `coverage.overall >= 0.8` threshold, and prints a compact JSON summary to stderr for CI consumption. Contract coverage is a complement to your usual test coverage, not a replacement; tune thresholds like `coverage-min` to your project and schema size.

As a shorter CLI entry point, you can use the dedicated `contracts` command, which defaults to `coverage=measure` and `coverage-profile=balanced`:

```bash
foundrydata contracts \
  --schema ./examples/payment.json \
  --n 200 \
  --seed 424242 \
  --out ndjson \
  --coverage-dimensions=structure,branches,enum \
  --coverage-min 0.8 \
  --coverage-report ./coverage/payment.coverage.json
```

**Node.js harness (same profile, programmatic use)**

```ts
import { runContractTestsExample } from './scripts/examples/contract-tests';

const report = await runContractTestsExample({
  schemaPath: 'examples/payment.json',
  count: 200,
  seed: 424242,
  mode: 'strict',
  coverageMode: 'measure',
  coverageDimensions: ['structure', 'branches', 'enum'],
  coverageMin: 0.8,
});

// report.items        -> validated fixtures (array)
// report.meta         -> { count, seed, schemaPath, mode, coverageMode }
// report.coverage     -> { overall, byDimension, coverageStatus } | undefined
```

The harness is used in the repo’s own e2e tests (`packages/core/test/e2e/examples.integration.spec.ts`) and can be called directly from Jest/Vitest suites or via `npx tsx scripts/examples/contract-tests.ts ...` in CI.

---

## Core invariants

These guarantees hold for the full pipeline (CLI and high-level Node API):

* **AJV is the oracle**
  When validation is executed, it is performed **against the original schema** (not internal transforms).

* **Deterministic by design**
  Same schema + same seed ⇒ same data, given the same options and resolver configuration.
  Generation attempts are bounded; there is no global RNG.

* **Pipeline with explicit responsibilities**
  Each stage has a clear role and explicit diagnostics.

* **Performance targets, not promises**
  The engine tracks latency and memory and degrades gracefully under complexity caps. SLOs are documented rather than hard guarantees.

* **External `$ref` behavior is explicit**
  By default, runs are offline-friendly. Strict stops when unresolved externals remain after resolver hydration; Lax applies the ExternalRefSkipEligibility heuristic and emits `EXTERNAL_REF_UNRESOLVED` with `skippedValidation:true` when validation would fail solely on unresolved externals.

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
  In Lax mode, when failures are due only to unresolved external `$ref`, this stage applies the skip heuristic and records `skippedValidation:true` plus diagnostics instead of running AJV; Strict never skips.

---

## Coverage-aware generation

FoundryData includes an optional coverage layer that measures which parts of your JSON Schema or OpenAPI contract are exercised by generated instances and, in guided mode, can steer generation toward uncovered areas under a fixed budget. This layer is built strictly on top of the existing `Normalize → Compose → Generate → Repair → Validate` pipeline: AJV remains the oracle, and coverage never relaxes or changes validation semantics.

### Coverage modes

- `coverage=off` (default) — coverage is disabled. The pipeline behaves exactly as described above: there is no coverage graph, no instrumentation and no coverage report. Use this when you only need deterministic, schema-true data.
- `coverage=measure` — instrumentation is enabled and FoundryData records which targets are hit, but the sequence of generated instances remains identical to a `coverage=off` run for the same schema, options, seed and AJV posture. This mode is useful to understand how well your existing tests exercise a contract without changing the data they see.
- `coverage=guided` — FoundryData uses coverage-oriented planning to try additional seeds and instance batches that are likely to hit new targets (branches, optional properties, enums, etc.), while still emitting only AJV-valid instances. Guided runs aim to maximise coverage under a configured budget, not to change validation rules.

### Dimensions and unreachable targets

Coverage is organised into dimensions such as structure, branches, enums and, when enabled, boundaries and operations. The `dimensionsEnabled` option controls which dimensions actually materialise coverage targets and appear in metrics and reports. In V1, only dimensions listed in `dimensionsEnabled` produce `CoverageTarget` entries in `targets[]` and contribute to `coverage.overall`, `coverage.byDimension` and `coverage.byOperation`. For OpenAPI inputs, enabling operation-level coverage adds metrics broken down by operation without changing the base generator behavior.

Some targets can be proven unreachable by the planner and analyzer (for example when a schema branch is structurally unsatisfiable). These targets are kept in the report with `status:'unreachable'` so they remain visible for diagnostics and debugging.

The `excludeUnreachable` option only affects denominators when computing coverage percentages. When it is set, unreachable targets are ignored in `coverage.overall` and per-dimension/per-operation metrics, but they are still present in `targets` / `uncoveredTargets` and keep their IDs and statuses.

### Thresholds and reports

Coverage-aware runs emit a versioned JSON coverage report (coverage-report/v1) that contains the full target list, hit flags and aggregated metrics such as `coverage.overall`, `coverage.byDimension` and, when available, `coverage.byOperation`. You can configure an overall `minCoverage` threshold so that coverage-aware runs fail with a dedicated non-zero exit code in CI when the required level is not met. The CLI and Node.js API sections below explain how to enable coverage modes and where coverage reports are returned, and `docs/spec-coverage-aware-v1.0.md` documents the exact JSON schema for coverage-report/v1. By default, the CLI runs coverage with `excludeUnreachable=true` (unreachable targets stay visible in the report but are excluded from denominators), while the Node.js API leaves `excludeUnreachable` unset unless you opt into it explicitly; both share the same coverage model and report format.

For a more detailed description of the `coverage-report/v1` JSON structure and the `foundrydata coverage diff` CLI to compare two reports (baseline vs comparison) in CI, see:

- `packages/reporter/README.md` — coverage-report/v1 overview and coverage diff CLI usage.

---

## Feature support (summary)

* **Composition & logic**
  `allOf` / `anyOf` / `oneOf` / `not`; deterministic branch selection; early unsatisfiability checks; graceful degradation under configured complexity caps.

* **Conditionals**
  Default: no conditional rewrite; optional safe rewrite under strict guards; generator uses if-aware-lite hints.

* **Objects**
  Must-cover intersections for `additionalProperties:false` across `allOf`; `patternProperties` overlap analysis; `propertyNames` and `dependent*` handling; `unevaluated*` preserved for validation.

* **Arrays**
  Tuples (`prefixItems`); implicit max length with `items:false`; `contains` uses bag semantics across `allOf`; `uniqueItems` enforced via structural hashing.

* **Numbers**
  Exact rational `multipleOf` with bit/LCM complexity caps and controlled fallbacks (`decimal` / `float`).

* **Refs**
  In-document `$ref`; external `$ref` with policy-driven handling and opt-in remote/registry resolution; `$dynamicRef` / `$dynamicAnchor` largely passed through to AJV (partial support).

---

## CLI

### Usage

```bash
foundrydata generate --schema <path> --n <count> [options]
foundrydata openapi --spec <openapi.json> [selection] [options]
foundrydata contracts --schema <path> [options]
```

### Selected options (`generate`)

| Option                           | Description                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-s, --schema <path>`            | JSON Schema file path (required).                                                                                                                                                                |
| `-c, --count <n>`                | Number of items to generate (primary flag).                                                                                                                                                      |
| `-n, --n <n>`                    | Alias for `--count`; short form used in examples.                                                                                                                                                |
| `-r, --rows <n>`                 | Legacy alias for `--count`; still accepted for backwards compatibility.                                                                                                                          |
| `--seed <n>`                     | Deterministic seed (default: `424242`).                                                                                                                                                          |
| `--out <format>`                 | Output format: `json` \| `ndjson` (default: `json`).                                                                                                                                             |
| `--print-metrics`                | Print structured metrics to **stderr**.                                                                                                                                                          |
| `--no-metrics`                   | Disable metrics collection in the pipeline.                                                                                                                                                      |
| `--summary` / `--manifest`       | Print a compact JSON summary (counts, metrics, coverage aggregates when enabled) to **stderr**, without changing the fixtures written to **stdout**.                                             |
| `--mode <mode>`                  | Execution mode: `strict` \| `lax`. Takes precedence over `--compat` when both are provided.                                                                                                      |
| `--compat <mode>`                | Compatibility surface: `strict` \| `lax`. Defaults to `strict` when neither `--mode` nor `--compat` is provided.                                                                                 |
| `--prefer-examples`              | Prefer schema/OpenAPI examples when present, falling back to generated data.                                                                                                                     |
| `--external-ref-strict <policy>` | Policy for external `$ref`: `error` (default) or `warn`. Controls handling of unresolved externals; network resolution is governed separately by resolver options such as `--resolve`. |
| `--resolve <strategies>`         | Resolver strategies for external `$ref`: comma-separated list of `local`, `remote`, `schemastore`. Default is `local` (offline-friendly; no network).                                            |
| `--cache-dir <path>`             | Override on-disk cache directory used by the resolver extension when fetching and caching external schemas.                                                                                      |
| `--fail-on-unresolved <bool>`    | When set to `false` in Lax mode, enables planning-time stubs for unresolved externals (maps to `resolver.stubUnresolved = 'emptySchema'` in plan options).                                       |

### Coverage-related options (`generate`)

Coverage is opt-in at the CLI level. By default, `foundrydata generate` runs with coverage disabled and behaves as a plain deterministic generator.

| Option                                  | Description                                                                                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--coverage <mode>`                     | Coverage mode: `off` (default, no coverage graph or report), `measure` (passive measurement; same instances as coverage=off for given schema/options/seed) or `guided` (coverage-guided generation under a fixed budget).  |
| `--coverage-dimensions <list>`          | Comma-separated list of coverage dimensions to enable in metrics and reports (for example `structure,branches,enum`). This selects which dimensions are materialised; it does not change target IDs or the underlying data. |
| `--coverage-min <ratio>`                | Overall coverage threshold in `[0,1]`. When set and not met, the CLI exits with a dedicated non-zero coverage failure code based on `coverage.overall`. Ignored when `--coverage=off`.                                     |
| `--coverage-report <path>`              | Write a JSON coverage-report/v1 file for the run at the given path. The report includes metrics (`coverage.overall`, `coverage.byDimension`, `coverage.byOperation` when available) and the full target set.               |
| `--coverage-profile <profile>`          | Predefined coverage budget/profile: `quick`, `balanced` or `thorough`. Profiles control instance budgets and hints used by `coverage=guided` runs; they do not change JSON Schema semantics or AJV behavior.               |
| `--coverage-exclude-unreachable <bool>` | When `true`, exclude targets proven unreachable from coverage denominators (overall/byDimension/byOperation) while keeping them visible in `targets` / `uncoveredTargets` with `status:'unreachable'`.                     |

### Coverage examples (CLI)

Measure coverage for a JSON Schema and write a report:

```bash
foundrydata generate \
  --schema ./examples/user.schema.json \
  --n 200 \
  --coverage measure \
  --coverage-dimensions structure,branches,enum \
  --coverage-report ./coverage/user.coverage.json
```

Run a coverage-guided profile for an OpenAPI operation:

```bash
foundrydata openapi \
  --spec ./examples/users-api.json \
  --operation-id getUsers \
  --n 500 \
  --coverage guided \
  --coverage-profile balanced \
  --coverage-dimensions structure,branches,enum \
  --coverage-min 0.8 \
  --coverage-report ./coverage/getUsers.coverage.json \
  --summary
```

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

> The guarantees below apply when you run the **full pipeline** (for example via `Generate` or `executePipeline`).
> You can call individual stages directly, but final schema compliance is only guaranteed once the **Validate** stage has run.

Examples below assume Node.js 20+ with ES modules enabled.

### High-level facades

* `Normalize(schema, options?)` — run the normalizer and return `{ canonSchema, ptrMap, notes }` without mutating the original schema.
* `Compose(schema, { mode, seed?, planOptions? })` — run normalization + composition and return `{ coverageIndex, planDiag, nameDfaSummary? }`.
* `Generate(k, seed, schema, options?)` — run the full 5-stage pipeline (Normalize → Compose → Generate → Repair → Validate) and return an async iterable of validated instances with an attached `result: Promise<PipelineResult>` for diagnostics and metrics.
* `Validate(instance, originalSchema, options?)` — validate a single instance against the original schema using the same AJV posture as the pipeline (annotative formats by default) and return `{ valid, ajvErrors? }`.

`Generate` runs the pipeline once and exposes two surfaces: the async iterable (for `for await` consumption) and a `result` promise for full pipeline diagnostics/metrics.

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
  mode: 'strict', // or 'lax'
  preferExamples: false,
  validateFormats: true,
});

// Option 1 — consume as an async iterable of repaired + AJV-validated items
for await (const item of stream) {
  // use item in your tests
}

// Option 2 — inspect the full pipeline result (diagnostics, metrics, artifacts)
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

// Option 3 — when coverage is enabled in options.coverage,
// await the attached CoverageReport Promise for coverage-aware runs
if (stream.coverage) {
  const coverageReport = await stream.coverage;
  if (coverageReport) {
    console.log('coverageStatus:', coverageReport.metrics.coverageStatus);
    console.log('overall coverage:', coverageReport.metrics.overall);
    console.log(
      'branches coverage:',
      coverageReport.metrics.byDimension['branches']
    );
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
* The high-level `Generate` facade defaults to `validateFormats:true`; the CLI always passes `validateFormats:true` and there is no CLI flag to disable this. To get the annotate-only default (`validateFormats:false`), call `executePipeline`/`Validate` with `validateFormats:false` or use `Generate(..., { validateFormats:false })` in your own code.

---

## Metrics & SLO/SLI

FoundryData exposes a metrics snapshot for every pipeline run (CLI, Node API, bench). Metrics are collected by the core pipeline and returned as `result.metrics`.

```ts
{
  normalizeMs: number;
  composeMs: number;
  generateMs: number;
  repairMs: number;
  validateMs: number;
  compileMs?: number;

  // Logical cost (accumulated over the run)
  validationsPerRow: number;    // total AJV validations (≈ number of rows)
  repairPassesPerRow: number;   // total repair iterations across rows
  repairActionsPerRow?: number;
  branchTrialsTried?: number;
  patternWitnessTried?: number;

  // Observability (mostly populated by bench/CI harnesses)
  memoryPeakMB: number;         // 0 in normal runs, set by bench scripts
  p50LatencyMs: number;         // ditto
  p95LatencyMs: number;         // ditto
  branchCoverageOneOf?: Record<string, { visited: number[]; total: number }>;
  enumUsage?: Record<string, Record<string, number>>;
}
```

In practice:

- **CLI**  
  `foundrydata generate ... --print-metrics` writes the exact `result.metrics` JSON from the pipeline to `stderr`.
- **Node.js API**  
  With `Generate(k, seed, schema, { metricsEnabled: true })`, the attached `PipelineResult` (`stream.result`) contains the same snapshot in `result.metrics`.
- **Normal runs vs bench**  
  For regular CLI / API runs, `memoryPeakMB`, `p50LatencyMs`, and `p95LatencyMs` typically remain `0` (no external sampling). The dedicated bench scripts (`npm run bench`, `npm run bench:real-world`) create their own `MetricsCollector`, sample memory and latency, and populate these fields before aggregating them.

Heuristics and SLO/SLI:

- **Per-row cost (simple/medium schemas)**  
  For `n` generated rows, a typical target is:
  - `validationsPerRow / n ≤ 3` (a few AJV passes per fixture),
  - `repairPassesPerRow / n ≤ 1` (few repair cycles needed).  
  Complex or pathological schemas can exceed these ratios without automatically being considered failures, but they signal higher cost.
- **Latency SLO (indicative, not a hard guarantee)**  
  For **~1000 rows** on simple/medium schemas, a typical end-to-end **p50 ≈ 200–400 ms** is observed on a standard CI machine (Node 20, the provided bench profiles). Individual runs may be faster or slower depending on hardware, load, and AJV options.
- **Bench “gate” SLOs (enforced in this repo)**  
  Repo-level bench harnesses (`npm run bench`, `npm run bench:real-world`) run fixed profiles, compute `p50LatencyMs`, `p95LatencyMs`, and `memoryPeakMB` per profile, then write summaries to `bench/bench-gate*.json`. Those gates enforce reference budgets on the aggregate across profiles:
  - `p95LatencyMs ≤ 120 ms`
  - `memoryPeakMB ≤ 512 MB`  
  These budgets apply to per-profile end-to-end latencies for the fixed bench profiles (tens of rows per run) and act as CI regression guards; they live in a different regime than the ~1000-row p50 example above. If these bounds are exceeded, the bench job fails; the exact numeric budgets are specific to this reference harness and can be tuned for other environments if needed.

Metrics are printed to **stderr** when `--print-metrics` is enabled.

---

## Strict vs Lax behavior

| Situation                               | **Strict** (default)     | **Lax**                                                                                                                                      |
| --------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| External `$ref`                         | Hard stop (diag `EXTERNAL_REF_UNRESOLVED`) when unresolved after resolver hydration; policy flag only changes severity | `warn` then attempt; may stub for planning when configured and will skip final validation with `EXTERNAL_REF_UNRESOLVED{ skippedValidation:true }` when ExternalRefSkipEligibility passes |
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

All tests are run with **Vitest**:

- Monorepo entrypoint: `npm run test` (uses `vitest.config.ts`)
- Matchers / test utilities: `npm run test:matchers` (uses `test/vitest.config.ts`)

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
