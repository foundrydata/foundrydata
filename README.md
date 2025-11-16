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
foundrydata generate --schema user.json --rows 100

# Deterministic output — same seed ⇒ same data
foundrydata generate --schema user.json --rows 1000 --seed 42

# Print metrics (timings, validations/row, etc.) to stderr
foundrydata generate --schema user.json --rows 1000 --print-metrics

# External refs policy (no remote resolution by default; policy only)
# Values: error | warn | ignore  (default: error)
foundrydata generate --schema api.json --rows 50 --external-ref-strict warn

# Optional compatibility surface (non-normative toggles, e.g., relax warnings)
foundrydata generate --schema user.json --rows 100 --compat lax
```

* Generated **data goes to stdout**; **metrics/errors go to stderr** (for easy piping in CI).
* By default the resolver runs in **local-only** mode (no network); external `$ref` are not fetched unless you explicitly opt into remote/registry strategies via the resolver options (e.g., CLI `--resolve`). The `--external-ref-strict` flag controls how unresolved externals affect the run; validation is always against the original schema. When Source AJV fails solely because of unresolved external `$ref`, the pipeline emits an `EXTERNAL_REF_UNRESOLVED` diagnostic whose details (mode, ref, policy) are visible with `--debug-passes`.

---

## Core invariants

* **AJV is the oracle**: final validation is performed **against the original schema** (not internal transforms).
* **Deterministic**: same schema + seed ⇒ same data. Bounded attempts; no global RNG.
* **Pipeline simplicity** with explicit responsibilities and diagnostics.
* **Performance targets** and graceful degradation under complexity caps (documented, not hard guarantees).

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
* **Validate** — Final AJV validation **against the original schema**; pipeline fails on non-compliance.

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
foundrydata generate --schema <path> --rows <n> [options]
```

**Selected options**

| Option                            | Description                                                                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--rows <n>`                      | Number of rows to generate.                                                                                                                                |
| `--seed <n>`                      | Deterministic seed.                                                                                                                                        |
| `--print-metrics`                 | Print structured metrics to **stderr**.                                                                                                                    |
| `--external-ref-strict <policy>`  | Policy for external `$ref`: `error` (default) \| `warn` \| `ignore`. Controls handling of unresolved externals; network resolution is governed separately by resolver options such as `--resolve`. |
| `--compat <mode>`                 | Optional compatibility surface (e.g., `lax` to relax non-critical checks).                                                                                 |
| `--resolve <strategies>`          | Resolver strategies for external `$ref`: comma-separated list of `local`, `remote`, `schemastore`. Default is `local` (offline-friendly; no network).     |
| `--cache-dir <path>`              | Override on-disk cache directory used by the resolver extension when fetching and caching external schemas.                                                |
| `--fail-on-unresolved <bool>`     | When set to `false` in Lax mode, enables planning-time stubs for unresolved externals (maps to `resolver.stubUnresolved = 'emptySchema'` in plan options). |

**Examples**

```bash
# Basic
foundrydata generate --schema user.json --rows 100

# Deterministic + metrics
foundrydata generate --schema user.json --rows 1000 --seed 42 --print-metrics

# External refs policy (no deref)
foundrydata generate --schema api.json --rows 50 --external-ref-strict warn
```

---

## Node.js API

> The guarantees below apply to the **full pipeline**. Using individual stages is supported, but final schema compliance is only guaranteed if you execute **Validate** at the end.

```ts
import { executePipeline } from '@foundrydata/core';

const schema = {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name']
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
    }
  },
  repair: {
    attempts: 1
  },
  validate: {
    validateFormats: true // Enable format validation via ajv-formats
  }
});

if (result.status === 'completed') {
  const items = result.artifacts.repaired ?? result.stages.generate.output?.items ?? [];
  console.log('Generated', items.length, 'items');
  console.error('Metrics', result.metrics);
} else {
  console.error('Pipeline failed:', result.errors);
}
```

**AJV / formats policy**

* By default, formats are **annotative**: `validateFormats:false`. You can enable assertive format validation via `ajv-formats` by setting `validate.validateFormats: true` in the pipeline options (as shown above).

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

> ⚠️ **Note**: Performance benchmarks are currently under development in the refactor branch. These targets are based on the canonical SPEC and will be validated once the benchmark suite is restored.

Example metrics are printed to **stderr** when `--print-metrics` is enabled.

---

## Strict vs Lax behavior

| Situation                               | **Strict** (default)     | **Lax**                                                                                  |
| --------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| External `$ref`                         | `error` (configurable)   | `warn` then attempt generation **without deref**; still validate against original schema |
| `$dynamicRef/*` present                 | note only                | note only                                                                                |
| Complexity caps                         | degrade with diagnostics | same                                                                                     |
| Conditional strategy when not rewriting | **if-aware-lite**        | same                                                                                     |

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

---

> *This README is aligned to the **Feature Support Simplification Plan** (source of truth for pipeline, feature semantics, defaults, and targets). Where wording differs from earlier docs (e.g., external refs option name, p50 targets, "parse" placement), this file follows the spec.*
