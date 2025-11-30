# FoundryData — Examples

This directory contains real‑world schemas and usage patterns you can run locally to understand how FoundryData behaves on typical web/API models.

All examples are designed to stay aligned with the Feature Support Simplification spec (no network deref in core, AJV as oracle, deterministic generation, graceful degradation under caps).

---

## Available example schemas

| File                       | Scenario it illustrates                                              |
|----------------------------|---------------------------------------------------------------------|
| `ecommerce-schema.json`    | Product catalog (objects + patternProperties + enums)               |
| `saas-user-schema.json`    | SaaS users with plans, flags, formats (uuid/email)                 |
| `api-transaction-schema.json` | Transactions with date‑time, numbers, and `oneOf`               |
| `team-with-users-schema.json` | Arrays of objects, `uniqueItems`, tuple‑like shapes             |
| `quick-test-schema.json`   | Minimal schema for smoke tests                                      |
| `payment.json`             | Payment request/event payload (contract‑testing focused)            |
| `llm-output.json`          | Structured LLM summarization output (LLM testing / DX)             |
| `users-api.json`           | Small OpenAPI 3.1 document for `openapi` CLI fixtures               |
| `user.schema.json`         | Basic user schema with common field types                           |
| `draft-07.json`            | JSON Schema Draft-07 example                                        |
| `draft-2019-09.json`       | JSON Schema 2019-09 example                                         |
| `draft-2020-12.json`       | JSON Schema 2020-12 example                                         |

These schemas are intentionally small and focused on one or two mechanics each.

---

## Quick start (from repo root)

```bash
# Generate 100 products
npx foundrydata generate --schema examples/ecommerce-schema.json --n 100

# Deterministic — same seed => same data
npx foundrydata generate --schema examples/saas-user-schema.json --n 50 --seed 42

# Arrays of objects example
npx foundrydata generate --schema examples/team-with-users-schema.json --n 10

# Print metrics (timings, validations/row, etc.) to stderr
npx foundrydata generate --schema examples/api-transaction-schema.json --n 200 --print-metrics

# Write output to a file (stdout -> redirect)
npx foundrydata generate --schema examples/quick-test-schema.json --n 5 > out.json
```

Streams: generated data goes to `stdout`; metrics/errors go to `stderr`. This makes piping in CI straightforward.

---

## Product‑oriented scenarios

The following schemas are used in higher‑level product examples:

- `examples/users-api.json` — with `foundrydata openapi` for API mocks / MSW‑style fixtures.
- `examples/payment.json` — for contract‑testing flows (request/event payloads).
- `examples/llm-output.json` — for LLM structured output testing.

See `docs/use-cases/product-scenarios.md` and the scripts under `scripts/examples/`:

- `scripts/examples/api-mocks.ts`
- `scripts/examples/contract-tests.ts`
- `scripts/examples/llm-output.ts`

Each script calls the public `Generate` / `Validate` APIs with fixed seeds and validates that emitted items are AJV‑valid for the corresponding schema.

For coverage-aware variants of these scenarios (measure/guided runs, thresholds and profiles), see the “Coverage-aware extension” blocks in `docs/use-cases/product-scenarios.md` and the “Coverage-aware generation” section below.

---

## CLI Options & Configuration

### Basic Generation Options

```bash
# Development/testing with tsx (before building)
npx tsx packages/cli/src/index.ts generate \
  --schema examples/ecommerce-schema.json \
  --n 10 \
  --print-metrics \
  --debug-passes

# After build
npx foundrydata generate \
  --schema examples/ecommerce-schema.json \
  --n 10 \
  --print-metrics \
  --debug-passes
```

What you'll see:
- `--debug-passes` → effective configuration (rational limits, trials, guards, cache, complexity caps) and, when available, compose‑time diagnostics/coverage.
- `--print-metrics` → pipeline metrics (per‑stage timings, `validationsPerRow`, `repairPassesPerRow`, branch trials).

### Advanced Generation Options

```bash
# Increase repair attempts for complex schemas
foundrydata generate --schema examples/api-transaction-schema.json --n 100 --repair-attempts 3

# Control conditional rewriting
foundrydata generate --schema examples/saas-user-schema.json --n 50 --rewrite-conditionals safe

# Skip branch trials for faster generation (score-only selection)
foundrydata generate --schema examples/api-transaction-schema.json --n 100 --skip-trials

# Fine-tune branch exploration
foundrydata generate --schema examples/api-transaction-schema.json --n 100 \
  --trials-per-branch 3 \
  --max-branches-to-try 15 \
  --skip-trials-if-branches-gt 60
```

### Coverage-aware generation

Coverage is opt-in and off by default (`--coverage=off`). When you pass `--coverage=measure` or `--coverage=guided`, the CLI still uses the same seeded pipeline as above; AJV remains the oracle for validity, and coverage logic computes targets and metrics on top. In `measure` mode the stream of instances stays identical to `coverage=off` for a fixed seed; in `guided` mode the planner uses coverage targets and hints to steer generation while keeping runs deterministic.

The main coverage flags are:

- `--coverage=off|measure|guided` – choose the coverage mode.
- `--coverage-dimensions=structure,branches,enum,…` – select which dimensions to track.
- `--coverage-profile=quick|balanced|thorough` – preset dimensions, planner caps and recommended budgets.
- `--coverage-min=<number>` – global minimum for `coverage.overall` (0–1).
- `--coverage-report=<file>` / `--coverage-report-mode=full|summary` – write a `coverage-report/v1` JSON and optionally truncate details.
- `--coverage-exclude-unreachable=<bool>` – control whether `status:'unreachable'` targets contribute to denominators.

```bash
# Passive coverage audit for a JSON Schema (same instances as coverage=off)
npx foundrydata generate \
  --schema examples/ecommerce-schema.json \
  --n 100 \
  --seed 4242 \
  --out ndjson \
  --coverage=measure \
  --coverage-dimensions=structure,branches \
  --coverage-profile=quick \
  --coverage-report=coverage-ecommerce.json \
  --coverage-exclude-unreachable true

# Guided run with a balanced profile and global coverage threshold
npx foundrydata generate \
  --schema examples/payment.json \
  --coverage=guided \
  --coverage-profile=balanced \
  --coverage-dimensions=structure,branches,enum \
  --coverage-min=0.8 \
  --coverage-report=coverage-payment.json \
  --coverage-exclude-unreachable true \
  --out ndjson
```

Both commands print a human-readable coverage summary to stderr (per-dimension, per-operation and overall coverage, plus target status counts and planner caps/unsatisfied hints). The second one also enforces `minCoverage`: if `coverage.overall` for the enabled dimensions drops below `0.8`, the CLI exits with a dedicated non-zero code while still emitting fixtures.

You can wire this directly into CI. For example, in GitHub Actions:

```yaml
# .github/workflows/coverage.yml (excerpt)
- name: Coverage-guided fixtures for payment schema
  run: |
    npx foundrydata generate \
      --schema examples/payment.json \
      --coverage=guided \
      --coverage-profile=balanced \
      --coverage-dimensions=structure,branches,enum \
      --coverage-min=0.8 \
      --coverage-report=coverage-payment.json \
      --coverage-exclude-unreachable true \
      --out ndjson
```

The job fails automatically when the coverage threshold is not met, thanks to the dedicated exit code used for `minCoverage` failures, while the JSON report and stderr summary remain available for debugging.

---

## OpenAPI driver example

When you have an OpenAPI 3.1 document, you can generate fixtures directly from a chosen response schema using the `openapi` CLI command. The document is loaded from disk (no network I/O); selection uses the OpenAPI driver; data is generated through the same 5‑stage pipeline.

```bash
# By operationId (users-api.json in this directory)
foundrydata openapi \
  --spec examples/users-api.json \
  --operation-id getUsers \
  --n 5 \
  --out ndjson \
  --prefer-examples
```

Relevant options:

- `--operation-id <id>` or `--path <path>` + `--method <method>` to choose the operation.
- Optional `--status <code>` and `--content-type <type>` if multiple responses/content entries exist.
- Shared flags with `generate`: `--n/--rows`, `--seed`, `--mode/--compat`, `--out json|ndjson`, `--prefer-examples`, `--print-metrics`, `--no-metrics`.

All items printed on stdout have been validated by AJV against the selected response schema (AJV remains the oracle).

---

## JSON Schema drafts & refs

- Draft‑07, 2019‑09, 2020‑12 are supported (auto‑detected via `$schema`).
- Draft‑04 is accepted via the normalizer compatibility path; validation still runs against the original schema (corner cases may differ slightly).

References:

- In‑document `$ref` is supported.
- External `$ref` is not dereferenced by core stages; you control policy with `--external-ref-strict` (`error`/`warn`). Validation is still against the original schema; diagnostics such as `EXTERNAL_REF_UNRESOLVED` explain what happened.

---

## What each example highlights

* **Composition & branches:** `api-transaction-schema.json` shows `oneOf/anyOf` with deterministic branch scoring and post‑check for `oneOf` exclusivity.
* **Objects under `additionalProperties:false`:** `ecommerce-schema.json` demonstrates the **must‑cover** intersection across `allOf`.
* **Arrays with `contains`:** `team-with-users-schema.json` exercises **bag semantics** (`min/maxContains`) and `uniqueItems` interaction.
* **Numbers:** `api-transaction-schema.json` includes `multipleOf` cases (exact rational with documented caps/fallbacks).
* **Formats:** `saas-user-schema.json` uses `uuid`, `email`, `date-time`. When you call the high‑level `Generate` facade or use the CLI, formats are validated by default (`validateFormats:true`); at the lower pipeline level (`executePipeline`/`Validate`), formats are **annotative** unless you explicitly enable assertive validation.

---

## Capability notes (scoped to examples)

* **`uniqueItems`** applies to scalars **and** objects via structural hashing + deep equality.
* **`contains`** uses **bag semantics** across `allOf`; examples may include `minContains`/`maxContains` combinations. Unsat cases are detected early (`sum(min_i) > maxItems`, etc.).
* **Bounds** support both inclusive and exclusive forms, per draft rules.
* **Conditionals:** default **no rewrite**; generation uses an **if‑aware‑lite** strategy (safe rewrite is opt‑in).

---

## Known limits relevant to examples

* **External `$ref`**: no remote dereferencing; control behavior via policy (strict/warn/ignore). Validation still targets the original schema.
* **Complex regex/patterns**: generation is heuristic and Unicode‑aware; very heavy patterns may trigger degradations.
* **Large `oneOf`/`anyOf`**: trials are bounded; beyond thresholds the selector may switch to score‑only mode (with diagnostics).

---

## Quality and performance (for orientation)

* Typical target for **\~1000 rows (simple/medium)**: **p50 ≈ 200–400 ms**, with `validationsPerRow ≤ 3` and `repairPassesPerRow ≤ 1`. These are **documented targets**, not hard guarantees. Use `--print-metrics` to observe.

---

## Troubleshooting the examples

* **"External ref" error/warning** — The schema points to an external `$ref`. There is no remote deref; set `--external-ref-strict warn` to proceed best-effort (still validated against the original).
  * The corresponding diagnostic code is `EXTERNAL_REF_UNRESOLVED`; run with `--debug-passes` to see which reference failed and under which mode/policy.
* **Unsatisfiable `contains`** — Check `minContains/maxContains` against `maxItems` and whether needs are mutually exclusive.
* **Format assertions** — If you need strict format validation, use an AJV setup that enables assertive formats; the default is annotative.

---

## Contributing new examples

Prefer small schemas that each highlight a single mechanism:

* `allOf` with `additionalProperties:false` (must‑cover)
* `oneOf` discriminants and exclusivity refinement
* `contains` with `min/maxContains` and `uniqueItems` interaction

When in doubt, mirror the spec's behavior and limits and add a short comment atop the schema explaining the focus area.

---

## Planned Features

### Scenario‑based generation

Future versions will support scenario‑based generation for targeted datasets:

```bash
# Standard generation - realistic data
foundrydata generate --schema user.json --n 100

# Edge cases - min/max values, boundary conditions, empty arrays
foundrydata generate --schema user.json --n 100 --scenario edge-cases

# Stress test - uncommon values, max arrays, near-boundary values
foundrydata generate --schema user.json --n 100 --scenario stress-test

# Error conditions - invalid formats, missing required fields (for testing error handlers)
foundrydata generate --schema user.json --n 100 --scenario errors
```

> **Note**: The `--scenario` flag is not yet implemented in the current CLI. Use plain `--n` (or `--count`) for now.
