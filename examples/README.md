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

---

## Diagnostic & debugging tips

### View effective configuration and metrics

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

What you’ll see:
- `--debug-passes` → effective configuration (rational limits, trials, guards, cache, complexity caps) and, when available, compose‑time diagnostics/coverage.
- `--print-metrics` → pipeline metrics (per‑stage timings, `validationsPerRow`, `repairPassesPerRow`, branch trials).

### Advanced generation options

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

## Quality & performance (orientation only)

As a rough orientation for simple/medium schemas:

- ~1000 rows: p50 ≈ 200–400 ms.
- `validationsPerRow` ≤ 3.
- `repairPassesPerRow` ≤ 1.

These are documented targets, not guarantees. Use `--print-metrics` to inspect actual behavior on your machine.

---

## Contributing new examples

When adding new example schemas:

- Keep them small and focused on one or two mechanics (e.g. `allOf` + `additionalProperties:false`, `oneOf` discriminants, `contains` + `uniqueItems`).
- Make sure they are usable from the CLI with a single `foundrydata generate` or `foundrydata openapi` command.
- Add a short comment or entry in this README describing the scenario they illustrate.
npx tsx packages/cli/src/index.ts generate --schema ecommerce-schema.json --n 20 --resolve=local

# Restrict to SchemaStore and write/read local cache
foundrydata generate --schema profiles/real-world/asyncapi-3.0.schema.json   --n 10   --resolve=local,schemastore   --cache-dir "~/.foundrydata/cache"

# General remote (pre-phase only), with cache directory
foundrydata generate --schema profiles/real-world/asyncapi-3.0.schema.json   --n 10   --resolve=local,remote   --cache-dir "~/.foundrydata/cache"

# Remote + Lax: best-effort planning with possible skip of final validation on unresolved externals
foundrydata generate --schema profiles/real-world/kubernetes-deployment.schema.json \
  --n 1 --seed 101 \
  --resolve=local,remote --cache-dir "~/.foundrydata/cache" \
  --external-ref-strict warn --compat lax --debug-passes

# Offline/Lax planning stubs: proceed even if externals are unreachable
foundrydata generate --schema profiles/real-world/asyncapi-3.0.schema.json   --n 10   --compat lax   --fail-on-unresolved=false   --resolve=local
```

Observability

- Run‑level notes are exported under `compose(...).diag.run[]` with `canonPath:"#"` (e.g., `RESOLVER_STRATEGIES_APPLIED`, `RESOLVER_CACHE_HIT`, `RESOLVER_CACHE_MISS_FETCHED`, `RESOLVER_OFFLINE_UNAVAILABLE`).
- Planning‑time stubs in Lax emit `EXTERNAL_REF_STUBBED` warnings.


---

## What each example highlights

* **Composition & branches:** `api-transaction-schema.json` shows `oneOf/anyOf` with deterministic branch scoring and post‑check for `oneOf` exclusivity.&#x20;
* **Objects under `additionalProperties:false`:** `ecommerce-schema.json` demonstrates the **must‑cover** intersection across `allOf`.&#x20;
* **Arrays with `contains`:** `team-with-users-schema.json` exercises **bag semantics** (`min/maxContains`) and `uniqueItems` interaction.&#x20;
* **Numbers:** `api-transaction-schema.json` includes `multipleOf` cases (exact rational with documented caps/fallbacks).&#x20;
* **Formats:** `saas-user-schema.json` uses `uuid`, `email`, `date-time`. When you call the high‑level `Generate` facade or use the CLI, formats are validated by default (`validateFormats:true`); at the lower pipeline level (`executePipeline`/`Validate`), formats are **annotative** unless you explicitly enable assertive validation.&#x20;

---

## Capability notes (scoped to examples)

* **`uniqueItems`** applies to scalars **and** objects via structural hashing + deep equality.&#x20;
* **`contains`** uses **bag semantics** across `allOf`; examples may include `minContains`/`maxContains` combinations. Unsat cases are detected early (`sum(min_i) > maxItems`, etc.).&#x20;
* **Bounds** support both inclusive and exclusive forms, per draft rules.&#x20;
* **Conditionals:** default **no rewrite**; generation uses an **if‑aware‑lite** strategy (safe rewrite is opt‑in).&#x20;

---

## Known limits relevant to examples

* **External `$ref`**: no remote dereferencing; control behavior via policy (strict/warn/ignore). Validation still targets the original schema.&#x20;
* **Complex regex/patterns**: generation is heuristic and Unicode‑aware; very heavy patterns may trigger degradations.&#x20;
* **Large `oneOf`/`anyOf`**: trials are bounded; beyond thresholds the selector may switch to score‑only mode (with diagnostics).&#x20;

---

## Quality and performance (for orientation)

* Typical target for **\~1000 rows (simple/medium)**: **p50 ≈ 200–400 ms**, with `validationsPerRow ≤ 3` and `repairPassesPerRow ≤ 1`. These are **documented targets**, not hard guarantees. Use `--print-metrics` to observe.&#x20;

---

## Troubleshooting the examples

* **“External ref” error/warning** — The schema points to an external `$ref`. There is no remote deref; set `--external-ref-strict warn` to proceed best-effort (still validated against the original).&#x20;
  * The corresponding diagnostic code is `EXTERNAL_REF_UNRESOLVED`; run with `--debug-passes` to see which reference failed and under which mode/policy.
* **Unsatisfiable `contains`** — Check `minContains/maxContains` against `maxItems` and whether needs are mutually exclusive.&#x20;
* **Format assertions** — If you need strict format validation, use an AJV setup that enables assertive formats; the default is annotative.&#x20;

---

## Contributing new examples

Prefer small schemas that each highlight a single mechanism:

* `allOf` with `additionalProperties:false` (must‑cover)
* `oneOf` discriminants and exclusivity refinement
* `contains` with `min/maxContains` and `uniqueItems` interaction

When in doubt, mirror the spec’s behavior and limits and add a short comment atop the schema explaining the focus area.&#x20;

```

---

### Why these changes

- Remove `--resolve-externals` and clarify **policy‑only** behavior for external refs (no network deref), per the spec. :contentReference[oaicite:38]{index=38} :contentReference[oaicite:39]{index=39}  
- Avoid hard “depth>2” limits; reflect **caps + graceful degradation** instead. :contentReference[oaicite:40]{index=40} :contentReference[oaicite:41]{index=41}  
- Make `uniqueItems` guidance consistent (object deep equality supported). :contentReference[oaicite:42]{index=42} :contentReference[oaicite:43]{index=43}  
- Align draft support wording (Draft‑04 via normalizer) and bounds semantics (exclusive supported). :contentReference[oaicite:44]{index=44} :contentReference[oaicite:45]{index=45}  
- Emphasize stdout/stderr split and use redirection in examples instead of a bespoke `--output` flag. :contentReference[oaicite:46]{index=46} :contentReference[oaicite:47]{index=47}

If you want, I can also generate a minimal PR diff that replaces the existing `examples/README.md` with the version above.
```
