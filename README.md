# FoundryData — JSON Schema Test Data Generator

> Deterministic, schema‑true data generation with explicit limits.
> **Canonical spec:** *Feature Support Simplification Plan* — this README aligns to it for pipeline, feature semantics, and SLO/SLI targets.&#x20;

---

## Table of contents

* [Quick start](#quick-start)
* [Core invariants](#core-invariants)
* [Pre‑flight & 5‑stage pipeline](#pre-flight--5-stage-pipeline)
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

# External refs policy (no remote resolution; policy only)
# Values: error | warn | ignore  (default: error)
foundrydata generate --schema api.json --rows 50 --external-ref-strict warn

# Optional compatibility surface (non‑normative toggles, e.g., relax warnings)
foundrydata generate --schema user.json --rows 100 --compat lax
```

* Generated **data goes to stdout**; **metrics/errors go to stderr** (for easy piping in CI).&#x20;
* There is **no network dereferencing** of external `$ref`. The `--external-ref-strict` flag only sets the policy for how to proceed when such refs are present; validation is always against the original schema.&#x20;

---

## Core invariants

* **AJV is the oracle**: final validation is performed **against the original schema** (not internal transforms).&#x20;
* **Deterministic**: same schema + seed ⇒ same data. Bounded attempts; no global RNG.&#x20;
* **Pipeline simplicity** with explicit responsibilities and diagnostics.&#x20;
* **Performance targets** and graceful degradation under complexity caps (documented, not hard guarantees).&#x20;

---

## Pre‑flight & 5‑stage pipeline

**Pre‑flight (Parse)**: draft detection, basic shape checks, reject malformed inputs. This is a preparatory step, not part of the normative pipeline.&#x20;

**Generation pipeline (5 stages):**

```
Normalize → Compose → Generate → Repair → Validate
```

* **Normalize** — Draft‑aware canonicalization; preserve the **original** for AJV; conservative handling of conditionals by default.&#x20;
* **Compose** — Build an effective view without mutating canonical schema; must‑cover for `additionalProperties:false`; bag semantics for `contains`; rational arithmetic for `multipleOf`; deterministic branch scoring/Top‑K for `anyOf/oneOf`.&#x20;
* **Generate** — Seeded, deterministic generation; `enum/const` outrank `type`; **if‑aware‑lite** strategy when not rewriting conditionals.&#x20;
* **Repair** — AJV‑driven corrections (`keyword → action`) with budgets and stagnation guard; idempotent.&#x20;
* **Validate** — Final AJV validation **against the original schema**; pipeline fails on non‑compliance.&#x20;

---

## Feature support (summary)

* **Composition & logic** — `allOf` / `anyOf` / `oneOf` / `not`; deterministic branch selection; early‑unsat checks; graceful degradation under caps.&#x20;
* **Conditionals** — Default **no rewrite**; optional **safe** rewrite under strict guards; generator uses **if‑aware‑lite** hints.&#x20;
* **Objects** — Must‑cover intersection when `additionalProperties:false` across `allOf`; `patternProperties` overlap analysis; `propertyNames`; `dependent*`; `unevaluated*` preserved for validation.&#x20;
* **Arrays** — Tuples (`prefixItems`), implicit max length with `items:false`; `contains` uses **bag semantics** across `allOf`; `uniqueItems` with structural hashing.&#x20;
* **Numbers** — Exact **rational** `multipleOf` with bit/LCM caps and controlled fallbacks (`decimal`/`float`).&#x20;
* **Refs** — In‑document `$ref` supported; **external `$ref`**: default **error**, policy configurable; no remote resolution; `$dynamicRef/*` preserved.&#x20;

---

## CLI

### Usage

```bash
foundrydata generate --schema <path> --rows <n> [options]
```

**Selected options**

| Option                           | Description                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `--rows <n>`                     | Number of rows to generate.                                                           |
| `--seed <n>`                     | Deterministic seed.                                                                   |
| `--print-metrics`                | Print structured metrics to **stderr**.                                               |
| `--external-ref-strict <policy>` | Policy for external `$ref`: `error` (default) \| `warn` \| `ignore`. No network I/O.  |
| `--compat <mode>`                | Optional compatibility surface (e.g., `lax` to relax non‑critical checks).            |

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

> The guarantees below apply to the **full pipeline**. Using individual stages is supported, but final schema compliance is only guaranteed if you execute **Validate** at the end.&#x20;

```ts
import { generate, ComplianceValidator } from '@foundrydata/core';

const res = await generate({
  schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  rows: 100,
  seed: 42,
  options: {
    // Default conditional policy: no rewrite; generator uses if‑aware‑lite hints
    rewriteConditionals: 'never',
    metrics: true
  }
});

if (res.isOk()) {
  console.log('Generated', res.value.data.length, 'items');
  console.error('Metrics', res.value.metrics);
}
```

**AJV / formats policy**

* By default, formats are **annotative**: `validateFormats:false`. You can enable assertive format validation via `ajv-formats` if needed.&#x20;

```ts
// Optional: strict format validation (assertive)
const validator = new ComplianceValidator({
  validateFormats: true // requires ajv-formats; increases cost
});
```

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

* **Quality indicators** (simple/medium): `validationsPerRow ≤ 3`, `repairPassesPerRow ≤ 1`.&#x20;
* **SLO targets** (documented, not hard guarantees): **\~1000 rows (simple/medium)** p50 ≈ **200–400 ms**.&#x20;
* **Memory**: usage is **tracked**; alerts can be configured in CI. No normative “caps per batch size” in the spec.&#x20;

Example metrics are printed to **stderr** when `--print-metrics` is enabled.&#x20;

---

## Strict vs Lax behavior

| Situation                               | **Strict** (default)     | **Lax**                                                                                  |
| --------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| External `$ref`                         | `error` (configurable)   | `warn` then attempt generation **without deref**; still validate against original schema |
| `$dynamicRef/*` present                 | note only                | note only                                                                                |
| Complexity caps                         | degrade with diagnostics | same                                                                                     |
| Conditional strategy when not rewriting | **if‑aware‑lite**        | same                                                                                     |

Behavior and policies are defined by the spec; there is **no remote resolution** in either mode.&#x20;

---

## Development

* **Build**: `npm run build`
* **Typecheck**: `npm run typecheck`
* **Tests**: `npm run test`
* **Formatting**: `npm run format`
* **Monorepo structure**: `packages/core` (engine), `packages/cli` (CLI), `packages/shared`, `packages/api` (future).&#x20;

---

## Testing (high level)

* **Unit per stage**: normalizer (golden + notes), composer (must‑cover, bagged `contains`, rationals), generator (deterministic + enum/const precedence), repair (idempotence, snapping), validator (pointer mapping).&#x20;
* **Integration**: multi‑draft validation against the **original** schema; conditional semantics; oneOf exclusivity after refinement; early‑unsat suites.&#x20;
* **Bench/CI**: profiles (simple/medium/pathological); track p50/p95, quality SLI, caps triggers, optional memory peak.&#x20;

---

## License

MIT (open source first, offline‑friendly; see spec philosophy).&#x20;

---

> *This README is aligned to the **Feature Support Simplification Plan** (source of truth for pipeline, feature semantics, defaults, and targets). Where wording differs from earlier docs (e.g., external refs option name, p50 targets, “parse” placement), this file follows the spec.*  &#x20;
