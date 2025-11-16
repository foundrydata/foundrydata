# FoundryData — JSON Schema Test Data Generator

> Deterministic, schema-true data generation with explicit limits.
> **Canonical spec:** *Feature Support Simplification Plan* — this README aligns to it for pipeline, feature semantics, and SLO/SLI targets.

---

## ⚠️ Refactor Status

This branch (`feature-simplification`) is a **complete ground-up refactor** of FoundryData following the new architectural SPEC.

**Implementation Status:**
- ✅ **Implemented**: CLI, 5-Stage Pipeline, Core Generation Engine
- 🚧 **In Progress**: Performance Benchmarks, Comprehensive Test Coverage
- 📋 **Planned**: REST API (`packages/api/`)

**Note**: Some documented features (e.g., performance benchmarks) are being rebuilt for the refactor. The architecture and API signatures described here reflect the new implementation.

---

## Table of contents

* [Quick start](#quick-start)
* [Core invariants](#core-invariants)
* [Pre-flight & 5-stage pipeline](#pre-flight--5-stage-pipeline)
* [Feature support (summary)](#feature-support-summary)
* [CLI](#cli)
* [Node.js API](#nodejs-api)
* [Metrics & SLO/SLI](#metrics--slosli)
* [Strict vs Lax behavior](#strict-vs-lax-behavior)
* [Development](#development)
* [Testing (high level)](#testing-high-level)
* [License](#license)

---

## Quick start

```bash
# Basic generation — validate schema then generate 100 rows
foundrydata generate --schema user.json --n 100

# Deterministic output — same seed ⇒ same data
foundrydata generate --schema user.json --n 1000 --seed 42

# Print metrics (timings, validations/row, etc.) to stderr
foundrydata generate --schema user.json --n 1000 --print-metrics

# External refs policy (no remote resolution by default; policy only)
# Values: error | warn | ignore  (default: error)
foundrydata generate --schema api.json --n 50 --external-ref-strict warn

# Optional compatibility surface (non-normative toggles, e.g., relax warnings)
foundrydata generate --schema user.json --n 100 --compat lax

# Resolver (HTTP) pre-phase — opt-in
# Local-only (default): no HTTP(S) fetch
foundrydata generate --schema real-world.json --n 10 --resolve=local

# With HTTP(S) resolver + cache, strict policy (externals must resolve)
foundrydata generate --schema real-world.json --n 10 \
  --resolve=local,remote --cache-dir "~/.foundrydata/cache" \
  --external-ref-strict error

# With resolver + Lax mode: best-effort planning; may skip final validation when failures are due only to external $ref
foundrydata generate --schema real-world.json --n 10 \
  --resolve=local,remote --cache-dir "~/.foundrydata/cache" \
  --external-ref-strict warn --compat lax --debug-passes
```

* Generated **data goes to stdout**; **metrics/errors go to stderr** (for easy piping in CI).
* By default the resolver runs in **local-only** mode (no network); external `$ref` are not fetched unless you explicitly opt into remote/registry strategies via the resolver options (e.g., CLI `--resolve`). The `--external-ref-strict` flag controls how unresolved externals affect the run. When final validation runs, it is always performed against the original schema. When Source AJV fails solely because of unresolved external `$ref`, the pipeline emits an `EXTERNAL_REF_UNRESOLVED` diagnostic whose details (mode, ref, policy, skippedValidation?) are visible with `--debug-passes`; in Lax mode this may mark validation as skipped instead of running AJV over generated items.

---

## Core invariants

* **AJV is the oracle**: when validation is executed, it is performed **against the original schema** (not internal transforms).
* **Deterministic**: same schema + seed ⇒ same data. Bounded attempts; no global RNG.
* **Pipeline simplicity** with explicit responsibilities and diagnostics.
* **Performance targets** and graceful degradation under complexity caps (documented, not hard guarantees).
* **External `$ref` skip paths (Lax)**: when compile-time failures are due only to unresolved external `$ref` and the run is classified as skip-eligible, the pipeline records `EXTERNAL_REF_UNRESOLVED` with `skippedValidation:true` instead of running final AJV checks; such runs are explicitly outside the strict 100% compliance guarantee.

---

## Pre-flight & 5-stage pipeline

**Pre-flight (Parse)**: draft detection, basic shape checks, reject malformed inputs. This is a preparatory step, not part of the normative pipeline.

**Generation pipeline (5 stages):**

```
Normalize → Compose → Generate → Repair → Validate
```

* **Normalize** — Draft-aware canonicalization; preserve the **original** for AJV; conservative handling of conditionals by default.
* **Compose** — Build an effective view without mutating canonical schema; must-cover for `additionalProperties:false`; bag semantics for `contains`; rational arithmetic for `multipleOf`; deterministic branch scoring/Top-K for `anyOf/oneOf`.
* **Generate** — Seeded, deterministic generation; `enum/const` outrank `type`; **if-aware-lite** strategy when not rewriting conditionals.
* **Repair** — AJV-driven corrections (`keyword → action`) with budgets and stagnation guard; idempotent.
* **Validate** — Final AJV validation **against the original schema** when executed; pipeline fails on non-compliance. In Lax mode, when failures are classified as due only to unresolved external `$ref`, this stage may instead record `skippedValidation:true` plus diagnostics (no AJV run on items).

---

## Feature support (summary)

* **Composition & logic** — `allOf` / `anyOf` / `oneOf` / `not`; deterministic branch selection; early-unsat checks; graceful degradation under caps.
* **Conditionals** — Default **no rewrite**; optional **safe** rewrite under strict guards; generator uses **if-aware-lite** hints.
* **Objects** — Must-cover intersection when `additionalProperties:false` across `allOf`; `patternProperties` overlap analysis; `propertyNames`; `dependent*`; `unevaluated*` preserved for validation.
* **Arrays** — Tuples (`prefixItems`), implicit max length with `items:false`; `contains` uses **bag semantics** across `allOf`; `uniqueItems` with structural hashing.
* **Numbers** — Exact **rational** `multipleOf` with bit/LCM caps and controlled fallbacks (`decimal`/`float`).
* **Refs** — In-document `$ref` supported; **external `$ref`**: default **error**, policy configurable; remote/registry resolution is opt‑in via the resolver extension (otherwise treated as unresolved with diagnostics); `$dynamicRef/*` preserved.

---

## CLI

### Usage

```bash
foundrydata generate --schema <path> --n <count> [options]
foundrydata openapi --spec <openapi.json> [selection] [options]
```

**Selected options (`generate`)**

| Option                           | Description                                                                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-s, --schema <path>`            | JSON Schema file path (required).                                                                                                                                                                                           |
| `-c, --count <n>`                | Number of items to generate (primary flag).                                                                                                                                                                                 |
| `-n, --n <n>`                    | Alias for `--count`; short form used in examples.                                                                                                                                                                           |
| `-r, --rows <n>`                 | Legacy alias for `--count`; still accepted for backwards compatibility.                                                                                                                                                     |
| `--seed <n>`                     | Deterministic seed (default: `424242`).                                                                                                                                                                                     |
| `--out <format>`                 | Output format: `json` \| `ndjson` (default: `json`).                                                                                                                                                                        |
| `--print-metrics`                | Print structured metrics to **stderr**.                                                                                                                                                                                     |
| `--no-metrics`                   | Disable metrics collection in the pipeline.                                                                                                                                                                                 |
| `--mode <mode>`                  | Execution mode: `strict` \| `lax`. Takes precedence over `--compat` when both are provided.                                                                                                                                |
| `--compat <mode>`                | Compatibility surface: `strict` \| `lax`. Defaults to `strict` when neither `--mode` nor `--compat` is provided.                                                                                                           |
| `--prefer-examples`              | Prefer schema/OpenAPI examples when present, falling back to generated data.                                                                                                                                                |
| `--external-ref-strict <policy>` | Policy for external `$ref`: `error` (default) \| `warn` \| `ignore`. Controls handling of unresolved externals; network resolution is governed separately by resolver options such as `--resolve`.                           |
| `--resolve <strategies>`         | Resolver strategies for external `$ref`: comma-separated list of `local`, `remote`, `schemastore`. Default is `local` (offline-friendly; no network).                                                                      |
| `--cache-dir <path>`             | Override on-disk cache directory used by the resolver extension when fetching and caching external schemas.                                                                                                                 |
| `--fail-on-unresolved <bool>`    | When set to `false` in Lax mode, enables planning-time stubs for unresolved externals (maps to `resolver.stubUnresolved = 'emptySchema'` in plan options).                                                                  |

**Examples (`generate`)**

```bash
# Basic
foundrydata generate --schema user.json --n 100

# Deterministic + metrics
foundrydata generate --schema user.json --n 1000 --seed 42 --print-metrics

# External refs policy (no deref)
foundrydata generate --schema api.json --n 50 --external-ref-strict warn
```

### OpenAPI driver (`openapi`)

The `openapi` command lets you target a specific OpenAPI 3.1 response and generate fixtures through the same 5‑stage pipeline:

```bash
# Select by operationId
foundrydata openapi \
  --spec my-api.openapi.json \
  --operation-id getUsers \
  --n 3 \
  --out ndjson

# Select by path + method
foundrydata openapi \
  --spec my-api.openapi.json \
  --path /users \
  --method get \
  --n 3 \
  --out ndjson

# Prefer in‑schema examples when present
foundrydata openapi \
  --spec my-api.openapi.json \
  --operation-id getUsers \
  --n 3 \
  --out ndjson \
  --prefer-examples
```

Selection flags:

- `--operation-id <id>` — target a specific operation.
- or `--path <path>` + `--method <method>` — explicit path/method selection.
- Optional `--status <code>` and `--content-type <type>` when multiple responses/content entries exist.

The command shares the same core flags as `generate` (`--n/--rows`, `--seed`, `--mode/--compat`, `--out json|ndjson`, `--prefer-examples`, `--print-metrics`, `--no-metrics`) and uses the high‑level `Generate` API under the hood. Any item printed as “success” has passed AJV validation against the selected response schema.

For end‑to‑end product scenarios (API mocks/MSW fixtures, contract tests, LLM structured outputs) with concrete CLI and Node examples, see `docs/use-cases/product-scenarios.md`.

---

## Node.js API

> The guarantees below apply to the **full pipeline**. Using individual stages is supported, but final schema compliance is only guaranteed if you execute **Validate** at the end.

**High‑level facades**

- `Normalize(schema, options?)` — runs the normalizer and returns `{ canonSchema, ptrMap, notes }` without mutating the original schema.
- `Compose(schema, { mode, seed?, planOptions? })` — runs normalization + composition and returns `{ coverageIndex, planDiag, nameDfaSummary? }`.
- `Generate(k, seed, schema, options?)` — runs the full 5‑stage pipeline and returns an async iterable of instances with an attached `result: Promise<PipelineResult>`.
- `Validate(instance, originalSchema, options?)` — validates a single instance against the original schema using the same Source AJV posture as the pipeline and returns `{ valid, ajvErrors? }`.

### High‑level: `Generate` + `Validate`

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

// Items are already repaired + AJV‑validated against the original schema
const items =
  result.artifacts.repaired ?? result.stages.generate.output?.items ?? [];

// Optional: spot‑check with the public Validate API
for (const item of items) {
  const v = Validate(item, schema, { validateFormats: true });
  if (!v.valid) {
    console.error('Unexpected validation failure', v.ajvErrors);
  }
}
```

### Low‑level: full pipeline (`executePipeline`)

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

**AJV / formats policy**

* At the pipeline level (`executePipeline` and the `Validate` facade), formats are **annotative** by default: `validateFormats:false`. You can enable assertive format validation via `ajv-formats` by setting `validate.validateFormats: true` (or `Validate(..., { validateFormats: true })`) in the options.
* The high‑level `Generate` facade (and the CLI, which delegates to it) passes `validateFormats:true` to the pipeline by default, so CLI/`Generate` runs perform assertive format validation unless you explicitly opt out.

---

## Metrics & SLO/SLI

**What we track** (subset):

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

* **Quality indicators** (simple/medium): `validationsPerRow ≤ 3`, `repairPassesPerRow ≤ 1`.
* **SLO targets** (documented, not hard guarantees): **~1000 rows (simple/medium)** p50 ≈ **200–400 ms**.
* **Memory**: usage is **tracked**; alerts can be configured in CI. No normative "caps per batch size" in the spec.

> ⚠️ **Note**: Performance benchmarks are enforced via the repo‑level bench harness (`npm run bench`, `npm run bench:real-world`), which writes `bench/bench-gate*.json` and compares p95 latency and peak memory against budgets such as p95 ≤ 120 ms and memory ≤ 512 MB for the configured profiles. These SLOs remain targets rather than strict guarantees, especially for complex real-world schemas.

Example metrics are printed to **stderr** when `--print-metrics` is enabled.

---

## Strict vs Lax behavior

| Situation                               | **Strict** (default)     | **Lax**                                                                                                                                    |
| --------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| External `$ref`                         | `error` (configurable)   | `warn` then attempt generation **without deref**; validate against original schema when possible, or mark validation as skipped on externals |
| `$dynamicRef/*` present                 | note only                | note only                                                                                                                                    |
| Complexity caps                         | degrade with diagnostics | same                                                                                                                                         |
| Conditional strategy when not rewriting | **if-aware-lite**        | same                                                                                                                                         |

Behavior and policies are defined by the spec. Strict vs Lax does **not** change whether remote lookup is used; remote/registry resolution is always opt‑in via resolver configuration (default is local‑only, offline‑friendly).

---

## Development

* **Build**: `npm run build`
* **Typecheck**: `npm run typecheck`
* **Tests**: `npm run test`
* **Formatting**: `npm run format`
* **Monorepo structure**: `packages/core` (engine), `packages/cli` (CLI), `packages/shared`, `packages/reporter` (reporting + bench harness).

---

## Testing (high level)

* **Unit per stage**: `packages/core/src/transform/__tests__` (normalizer + composer), `packages/core/src/generator/__tests__` (determinism, precedence, coverage), `packages/core/src/repair/__tests__` (idempotence, snapping), plus `diag`/`util` units (e.g. draft detection, dynamic refs).
* **Pipeline & integration**: `packages/core/src/pipeline/__tests__` and `packages/core/test/e2e/pipeline.integration.spec.ts` cover end‑to‑end `executePipeline`, AJV flags parity, external `$ref`/`$dynamicRef` policies, skip‑flow, exclusivity diagnostics, and final validation against the original schema.
* **Reporter & bench/CI**: `packages/reporter/test/reporter.snapshot.test.ts` fixes stable JSON/Markdown/HTML reports, and `packages/reporter/test/bench.runner.test.ts` exercises the bench runner + summary used by repo‑level bench scripts to track p50/p95, caps triggers, and optional memory peak.

---

## License

MIT (open source first, offline-friendly; see spec philosophy).
