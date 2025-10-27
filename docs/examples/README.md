Voici d’abord un **contrôle de cohérence** concis du README des *examples*, puis un **nouveau README complet** en anglais qui intègre les corrections.

---

## Coherence check (summary)

**Inconsistencies or misleading items vs. the canonical plan:**

1. **External `$ref` handling / CLI flag** — The examples mention `--resolve-externals` (and suggest “bundle externals”). The spec states **no network dereferencing**; behavior is controlled by a **policy** (e.g., `externalRefStrict`) and validation is always against the original schema. Replace with an option that expresses **policy only** and explicitly say “no remote resolution.” &#x20;

2. **Fixed nesting-depth limits** — The examples claim deep nesting “depth > 2” as unsupported. The spec uses **complexity caps with graceful degradation**, not a hard maximum depth. Remove fixed-depth statements and keep to caps/diagnostics framing. &#x20;

3. **`uniqueItems` scope** — One section limits `uniqueItems` to scalars, another later claims deep equality for objects is supported. Align to spec: structural hashing + deep equality are supported for objects. &#x20;

4. **Draft support** — The examples say Draft‑04 “not supported.” The spec allows Draft‑04 **via the normalizer** (compat layer), with validation still against the original; keep this nuance instead of a blanket “not supported.” &#x20;

5. **Number constraints wording** — One bullet implies only inclusive `min/max`; the spec covers exclusive bounds too (per draft). Adjust wording to include exclusive forms. &#x20;

6. **Output option** — The examples show `--output <file>`. The core contract is **data → stdout**, **metrics/errors → stderr**; demonstrate redirection rather than a bespoke output flag (unless the CLI truly implements it). &#x20;

7. **API/CSV forward‑looking claims** — “API in month 3+”, “CSV API‑only” are outside the plan’s normative scope. Remove or clearly mark as future/non‑normative.&#x20;

8. **Guarantee scope** — Keep the “100% compliance” statement but add that it applies to the **full pipeline**; stage‑only usage or unresolved external `$ref` do not carry the guarantee.&#x20;

9. **SLO/SLI reminders** — It helps to restate the documented targets used in examples (`~1K rows simple/medium: p50 ≈ 200–400 ms; validationsPerRow ≤ 3; repairPassesPerRow ≤ 1`).&#x20;

---

## **New README (examples) — drop‑in replacement (English)**

````markdown
# FoundryData — Examples

This directory contains real‑world schemas and usage patterns you can run locally to understand how FoundryData behaves on typical web/API models.  
**Canonical spec:** Feature Support Simplification Plan (this file aligns terminology and limits with the spec). :contentReference[oaicite:15]{index=15}

---

## Available example schemas

| File | Scenario it illustrates |
|------|-------------------------|
| `ecommerce-schema.json` | Product catalog (objects + patternProperties + enums) |
| `saas-user-schema.json` | Users, plans, dependent fields, formats (uuid/email) |
| `api-transaction-schema.json` | Transactions with date‑time, numbers, and oneOf |
| `team-with-users-schema.json` | Arrays of objects, `uniqueItems`, tuple-ish shapes |
| `quick-test-schema.json` | Minimal schema for smoke tests |

> These schemas are intentionally small and focused on one or two mechanics each. :contentReference[oaicite:16]{index=16}

---

## Quick start

```bash
# Generate 100 products
foundrydata generate --schema ecommerce-schema.json --rows 100

# Deterministic — same seed => same data
foundrydata generate --schema saas-user-schema.json --rows 50 --seed 42

# Arrays of objects example
foundrydata generate --schema team-with-users-schema.json --rows 10

# Print metrics (timings, validations/row, etc.) to stderr
foundrydata generate --schema api-transaction-schema.json --rows 200 --print-metrics

# Write output to a file (stdout -> redirect)
foundrydata generate --schema quick-test-schema.json --rows 5 > out.json
````

**Streams:** generated data goes to **stdout**; metrics/errors to **stderr**. This enables simple piping in CI.&#x20;

---

## Diagnostic & Debugging

### View effective configuration and metrics

```bash
# Development/testing with tsx (before building)
npx tsx packages/cli/src/index.ts generate \
  --schema profiles/real-world/openapi-3.1.schema.json \
  --rows 10 \
  --print-metrics \
  --debug-passes

# After build
foundrydata generate \
  --schema profiles/real-world/openapi-3.1.schema.json \
  --rows 10 \
  --print-metrics \
  --debug-passes
```

**What you'll see:**
- `--debug-passes` → Effective configuration (rational limits, trials, guards, cache, complexity caps)
- `--print-metrics` → Pipeline metrics (timings per stage, validationsPerRow, repairPassesPerRow, branch trials)

### Advanced generation options

```bash
# Increase repair attempts for complex schemas
foundrydata generate --schema complex.json --rows 100 --repair-attempts 5

# Control conditional rewriting
foundrydata generate --schema conditional.json --rows 50 --rewrite-conditionals safe

# Skip branch trials for faster generation (score-only selection)
foundrydata generate --schema large-oneof.json --rows 100 --skip-trials

# Fine-tune branch exploration
foundrydata generate --schema complex.json --rows 100 \
  --trials-per-branch 3 \
  --max-branches-to-try 15 \
  --skip-trials-if-branches-gt 60
```

### Test profiles

Real-world schemas are available in `profiles/real-world/`:

```bash
# OpenAPI 3.1 meta-schema (complex, many conditionals)
npx tsx packages/cli/src/index.ts generate \
  --schema profiles/real-world/openapi-3.1.schema.json \
  --rows 5 \
  --print-metrics

# JSON Schema Draft-07 meta-schema
npx tsx packages/cli/src/index.ts generate \
  --schema profiles/real-world/json-schema-draft-07.json \
  --rows 5 \
  --print-metrics
```

### Understanding metrics output

Key metrics to monitor:
- `validationsPerRow` → Should be ≤3 for simple/medium schemas (quality indicator)
- `repairPassesPerRow` → Should be ≤1 for simple/medium schemas (efficiency indicator)
- `normalizeMs`, `composeMs`, `generateMs`, `repairMs`, `validateMs` → Per-stage timings
- `branchTrialsTried` → How many branch explorations occurred

**Performance targets** (documented, not guarantees):
- ~1000 rows (simple/medium): p50 ≈ 200–400 ms

---

## JSON Schema drafts (what these examples expect)

* ✅ **Draft‑07**, **2019‑09**, **2020‑12** (auto‑detected via `$schema`).
* ⚠️ **Draft‑04**: accepted via the **normalizer** compatibility path; validation still runs against the original schema; behavior can differ for corner cases.&#x20;

**References:** in‑document `$ref` supported. **External `$ref`** are **not dereferenced** (no network I/O). Use policy flags to decide how to proceed when such refs are present (see below). `$dynamicRef/*` are preserved and validated by AJV at the end.&#x20;

---

## CLI tips for these examples

```bash
# External refs policy (no remote resolution; policy only)
# Values: error | warn | ignore   (default: error)
foundrydata generate --schema api-transaction-schema.json --rows 50 --external-ref-strict warn
```

* There is **no** `--resolve-externals` flag and **no remote dereferencing**. The flag above only sets the policy for encountering external `$ref`; output is still validated against the original schema.&#x20;

---

## What each example highlights

* **Composition & branches:** `api-transaction-schema.json` shows `oneOf/anyOf` with deterministic branch scoring and post‑check for `oneOf` exclusivity.&#x20;
* **Objects under `additionalProperties:false`:** `ecommerce-schema.json` demonstrates the **must‑cover** intersection across `allOf`.&#x20;
* **Arrays with `contains`:** `team-with-users-schema.json` exercises **bag semantics** (`min/maxContains`) and `uniqueItems` interaction.&#x20;
* **Numbers:** `api-transaction-schema.json` includes `multipleOf` cases (exact rational with documented caps/fallbacks).&#x20;
* **Formats:** `saas-user-schema.json` uses `uuid`, `email`, `date-time`. By default, formats are **annotative** (assertive validation is opt‑in).&#x20;

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

* **“External ref” error/warning** — The schema points to an external `$ref`. There is no remote deref; set `--external-ref-strict warn` to proceed best‑effort (still validated against the original).&#x20;
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
