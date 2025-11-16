# FoundryData Architecture

> **Status:** Updated and aligned with the **Feature Support Simplification Plan** (canonical spec). This edition supersedes the previous `ARCHITECTURE.md` baseline and harmonizes terminology and defaults with the developer-facing docs.   

---

## Core Principles (v2)

1. **AJV is the oracle** — Always validate against the **original schema** (not internal transforms).
2. **100% schema compliance (scope‑bound)** — The compliance guarantee applies to the **full 5‑stage pipeline**; stage‑only usage has stage‑level contracts, not end‑to‑end compliance.
3. **Deterministic generation** — Same seed ⇒ same data; bounded attempts; no global RNG.
4. **Pipeline simplicity** — Narrow, testable responsibilities: `Normalize → Compose → Generate → Repair → Validate`.
5. **Performance & observability** — Meet documented SLO/SLI targets with budgets and graceful degradation; capture metrics by phase.

> This document replaces the older architecture description while retaining repository structure and intent.

---

## Pre‑flight (Parse)

A preparatory step (not part of the normative pipeline): draft detection, basic shape checks, and rejection of malformed inputs. It does **not** alter guarantees.

---

## 5‑Stage Generation Pipeline

**Core flow:** `Normalize → Compose → Generate → Repair → Validate`

### Stage 1 — Normalize

**Purpose:** Draft‑aware canonicalization while preserving the **original** for AJV.

* **Non‑destructive** transforms; maintain pointer maps (canonical ⇄ original).
* **Conditionals (default)**: **no rewrite** — `rewriteConditionals: 'never'`. The generator uses `conditionals.strategy: 'if‑aware‑lite'` by default (implicit mapping). **Safe rewrite** is opt‑in and guarded.
* **References:** preserve in‑document refs; do not perform remote dereferencing of external `$ref` inside this stage; do not cross `$id` boundaries; keep `$dynamic*` as pass‑through. Any optional remote resolution is handled by the pre‑pipeline resolver extension, not by Normalize.
* **Guards:** cap nested `not` via `guards.maxGeneratedNotNesting`.

**Module:** `packages/core/src/transform/schema-normalizer.ts` (non‑destructive; notes for risky rewrites).

---

### Stage 2 — Compose

**Purpose:** Build an **effective view** by resolving composition (without mutating the canonical form).

* **Domain‑aware `allOf` merge** (types, bounds, rationals).
* **Objects / `additionalProperties:false` (must‑cover):** intersect per‑conjunct recognizers of allowed keys; conservative approximations for complex patterns.
* **Arrays / tuples:** enforce **implicit max length** when `items:false`; propagate through `allOf`.
* **`contains` (bag semantics):** model as independent needs; **concatenate** across `allOf`; perform **unsat checks** (e.g., `sum(min_i) > maxItems`, `min > maxItems`, obvious disjointness).
* **Branch selection (`anyOf`/`oneOf`):** deterministic scoring (discriminants first), Top‑K trials, score‑only path under caps. Post‑gen check for `oneOf` exclusivity.
* **Early‑unsat:** disjoint types, empty enum, bounds contradictions; tuple/contains/pattern‑vs‑`propertyNames` checks.

**Module:** `packages/core/src/transform/composition-engine.ts`.

---

### Stage 3 — Generate

**Purpose:** Deterministic, seeded candidate generation from the effective view.

* `enum/const` outrank broad `type`.
* **Conditionals (no‑rewrite mode):** `if‑aware‑lite` hints; bias toward minimal `then` satisfaction per `minThenSatisfaction`.
* Strings measured in Unicode code points; regex in Unicode mode.
* **Arrays:** satisfy bagged `contains`; then apply `uniqueItems` if present.
* **Numbers:** exact rational `multipleOf` with caps and fallbacks (decimal/float) controlled by plan options.

**Module:** `packages/core/src/generator/foundry-generator.ts`.

---

### Stage 4 — Repair

**Purpose:** AJV‑driven corrections using a `(keyword → action)` registry; idempotent; budgeted.

* Typical actions: clamp bounds, rational snap for `multipleOf`, add required props, de‑dupe via structural hashing for `uniqueItems`, remove extras for `additionalProperties:false`, etc.
* **Stagnation guard:** stop after `complexity.bailOnUnsatAfter` gen→repair→validate cycles when errors do not reduce.

**Module:** `packages/core/src/repair/repair-engine.ts`.

---

### Stage 5 — Validate

**Purpose:** Final compliance check against the **original** schema; pipeline fails on non‑compliance when validation is executed.

* **Two AJV configurations** (separate caches):

  1. **Original‑schema** validator (formats **annotative** by default: `validateFormats:false`).
  2. **Planning/generation** validator (analysis‑friendly flags, `strictTypes:true`).
     When validation runs, always validate output against the **original** schema. In Lax mode, when failures are classified as due only to unresolved external `$ref`, this stage may instead record `skippedValidation:true` with diagnostics (no AJV run on items).
* **Guarantee scope:** 100 % compliance only for **full pipeline** runs.
* Pointer mapping for precise errors; phase metrics collection.

**Module:** `packages/core/src/pipeline/orchestrator.ts`.

---

## Modes (Strict vs Lax)

| Situation                         | **Strict** (default)                             | **Lax**                                                                                                            |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| External `$ref`                   | `failFast.externalRefStrict: 'error'` (no deref in core pipeline) | `warn` then attempt generation **without** deref in core pipeline; validate where possible or mark validation as skipped on externals |
| `$dynamicRef/*` present           | note only                                        | note only                                                                                                          |
| Complexity caps                   | degrade with diagnostics                         | same                                                                                                               |
| Conditional strategy (no‑rewrite) | `if‑aware‑lite`                                  | same                                                                                                               |

Core pipeline stages perform no network I/O for external `$ref` in either mode. When the optional resolver extension is enabled, HTTP(S) fetch happens in a separate pre‑pipeline step, and the pipeline itself only consults the resulting registry.

---

## Draft Handling

* Detect via `$schema`; internal canon is 2020‑12‑like; validation remains on **original**.
* Keep `$dynamicRef/$dynamicAnchor/$recursiveRef` intact; generation conservative.

---

## AJV Configuration (details)

**Two distinct instances/caches**:

1. **Source/original validation**

   * `validateFormats:false` (default; assertive via `ajv-formats` opt‑in), `allowUnionTypes:true`, `unicodeRegExp:true`.
2. **Planning/generation**

   * `strictSchema:true`, `strictTypes:true`, `allErrors:false`; formats aligned with policy.

The Source instance is intentionally more tolerant (`strictSchema:false`, `strictTypes:false`), while the planning instance is strict. A startup gate enforces parity for `unicodeRegExp`, `validateFormats`, `multipleOfPrecision` (when relevant) and the presence of format validators across both instances; violations produce an `AJV_FLAGS_MISMATCH` error.

**Cache keys include** AJV **major version** and critical flags (`validateFormats`, `allowUnionTypes`, `strictTypes`). **Separate LRU spaces** are recommended for the two instances.

---

## Cache Strategy

Hierarchical: `WeakMap` (object identity) → `$id` (when trusted) → size‑gated `stableHash(schema)` when under `hashIfBytesLt`. LRU bounded by `cache.lruSize`; include AJV version + flags in keys.

---

## Performance & Metrics

**What we track (subset):**

```ts
{
  normalizeMs?: number;
  composeMs?: number;
  generateMs?: number;
  repairMs?: number;
  validateMs?: number;
  validationsPerRow?: number;   // AJV validations / row
  repairPassesPerRow?: number;  // repair loops / row
  branchTrialsTried?: number;
  memoryPeakMB?: number;        // optional (bench harness)
  p50LatencyMs?: number;        // optional (CI)
  p95LatencyMs?: number;        // optional (CI)
}
```

**Documented targets (not hard guarantees):**
For **\~1000 rows (simple/medium)**: **p50 ≈ 200–400 ms**, `validationsPerRow ≤ 3`, `repairPassesPerRow ≤ 1`. Degrade gracefully on pathological schemas (caps, score‑only branch selection, analysis skips).

Repository‑level bench harnesses (`npm run bench`, `npm run bench:real-world`) complement these SLOs by enforcing budgets such as p95 ≤ 120 ms and memory ≤ 512 MB across fixed profiles via `bench/bench-gate*.json`; exceeding those budgets fails the gate but does not change the non‑normative nature of the SLOs.

---

## Repository Structure (overview)

```
foundrydata/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── transform/        # Normalize + Compose (stages 1–2)
│   │   │   ├── generator/        # Stage 3
│   │   │   ├── repair/           # Stage 4
│   │   │   ├── pipeline/         # Orchestrator, AJV wiring, metrics (stage 5 + flow)
│   │   │   ├── diag/             # Diagnostics schemas, codes, validation helpers
│   │   │   ├── errors/           # Error codes and presentation helpers
│   │   │   ├── util/             # RNG, metrics, rational, hashing, ptr-map
│   │   │   └── types/
│   │   └── package.json
│   ├── cli/                      # Core CLI entrypoints
│   ├── shared/                   # Shared type-level & runtime utilities
│   └── reporter/                 # Reporting + bench harness on top of the core pipeline
```

This structure is unchanged; descriptions now reflect the clarified contracts above.

---

## Key Design Decisions (recap)

* **Result\<T,E>** across stages; no exceptions for expected failures.
* **Deterministic RNG:** local seeded generators; seed derivation stable per schema path.
* **Graceful degradation:** when caps trigger, skip costly analyses and switch to score‑only branch selection; emit diagnostics.

---

## Testing Alignment (high level)

* **Unit per stage:** `packages/core/src/transform/__tests__` for normalizer + composer, `packages/core/src/generator/__tests__` for generator determinism/precedence/coverage, `packages/core/src/repair/__tests__` for repair idempotence and error reduction, plus `diag`/`util` unit tests (e.g. draft detection, dynamic refs).
* **Pipeline & policy integration:** `packages/core/src/pipeline/__tests__` and `packages/core/test/e2e/pipeline.integration.spec.ts` cover end‑to‑end `executePipeline` behavior, AJV parity, external `$ref`/`$dynamicRef` policies, skip‑flow modes, exclusivity diagnostics, and final validation against the original schema.
* **Reporter & bench harness:** `packages/reporter/test/reporter.snapshot.test.ts` fixes stable JSON/Markdown/HTML reports, and `packages/reporter/test/bench.runner.test.ts` exercises the bench runner + summary output used by the repo‑level bench/CI workflows (including p50/p95 and caps behavior at the reporting layer).

---

## References

* Canonical spec and defaults: **Feature Support Simplification Plan** (this document follows its terminology and behaviors for conditionals, refs, AJV policies, caps, and metrics).
* Documentation hub for simplification work (pipelines, CLI/API examples) — language and option names harmonized here (e.g., no `--resolve-externals`; policy flag instead).
* Prior architecture baseline used as structural scaffold for module layout and naming.
* Developer guidance for assistants (aligned with the same invariants and SLO/SLI framing).
