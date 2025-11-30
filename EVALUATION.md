# FoundryData — Quick Evaluation (&lt; 1 h)

Goal: help a team quickly feel whether FoundryData brings value on **a real existing project**, without changing their test architecture.

Core vs optional:
- **Core evaluation (~30–45 min):** Steps 1–4
- **Optional deep-dive:** Step 5 + Bonus

Prerequisites:
- Node.js ≥ 20
- Access to at least one real JSON Schema or OpenAPI schema from your project
- `npx` available (no global install required)

---

## Step 1 — Pick a real schema

- Take **a real schema** from your project (ideally a key endpoint or a core domain model).
- It can be:
  - a JSON Schema file (for example `./schemas/user.schema.json`), or
  - an OpenAPI 3.1 spec (for example `./openapi/api.openapi.json` with an `operationId`).

Keep this schema exactly as it is today: the point is to see what it actually expresses.

---

## Step 2 — Generate 100 rows with FoundryData

In your project (not in the FoundryData repo), run:

```bash
# JSON Schema case — write to a sample file
mkdir -p ./tmp

npx foundrydata generate \
  --schema ./path/to/your-schema.json \
  --n 100 \
  --seed 42 \
  > ./tmp/foundrydata.sample.json

# OpenAPI case (operation responses) — also redirect if you prefer
npx foundrydata openapi \
  --spec ./path/to/your-api.openapi.json \
  --operation-id getUser \
  --n 100 \
  --seed 42 \
  > ./tmp/foundrydata.openapi.sample.json
```

We will inspect the generated sample file(s) in the next step. If you also want to get a feel for the cost of the contract, you can add `--print-metrics` to these commands and glance at `validationsPerRow` / `generateMs` in stderr.

---

## Step 3 — Look at the shape of the data

When looking at the 100 generated items:

- If you see **mostly `{}` or very empty objects**:
  - Your schema is probably **very permissive** (few `required` fields, no `min*`, little structural constraint).
  - **Do not treat this as a failure of FoundryData.** It is telling you that, according to JSON Schema, an empty object is a valid instance for this contract.
  - Ask yourself: “Is this consistent with what the API really accepts in production?”
  - This is often the first useful insight: your schema behaves as a very permissive *acceptance* contract, not as an *expressive* model of typical payloads.
- If the shape is **structurally close to your real payloads** (expected fields present, non-empty lists where you set `minItems`, strings with `minLength` > 0, etc.):
  - Your schema already captures a good portion of your domain constraints.
  - Check whether surprising cases appear (edge values, rarely-tested optional fields, unusual combinations).

FoundryData does not try to mimic production distributions or generate “realistic” fake data; it focuses on respecting the structural and scalar constraints expressed in your schemas.

Spend 5–10 minutes comparing this with a few production payloads or existing fixtures.

---

## Step 4 — Slightly tighten the schema and regenerate

Without refactoring everything, make 2–3 small tightenings on the same schema:

- Add some properties to `required` for fields that are **always present in practice**.
- Add simple minimum constraints (`minLength`, `minimum`, `minItems`, etc.) where it makes sense.
- If some values must come from a closed set, add a small `enum`.

Then regenerate the same 100 rows with **the same seed**:

```bash
npx foundrydata generate \
  --schema ./path/to/your-schema.json \
  --n 100 \
  --seed 42
```

Reusing the same seed means you can compare “before vs after tightening” without random noise.

Observe the difference:

- Are the generated objects closer to what you really expect?
- Do some constraints feel too strict (legitimate cases disappear) or, on the contrary, necessary (you discover gaps in your current tests)?

You do not have to commit these schema changes; treat this as a “what if” exercise to see how sensitive your payload space is to small tightenings.

---

## Step 5 — Plug it quickly into an existing test

Goal: see whether FoundryData surfaces cases that your static fixtures don’t cover, without rewriting your whole test setup.

A minimal approach:

1. Add a script to your `package.json` (in **your** project) that generates fixtures. You can either:

   - use **`npx` only** (no install):

     ```jsonc
     {
       "scripts": {
         "gen:test-data": "npx foundrydata generate --schema ./schemas/user.schema.json --n 200 --seed 424242 > ./test-fixtures/users.generated.json"
       }
     }
     ```

   - or install the CLI as a dev dependency and call it directly:

     ```bash
     npm install --save-dev foundrydata
     ```

     ```jsonc
     {
       "scripts": {
         "gen:test-data": "foundrydata generate --schema ./schemas/user.schema.json --n 200 --seed 424242 > ./test-fixtures/users.generated.json"
       }
     }
     ```

2. In an existing test (Jest / Vitest, etc.):
   - Load `users.generated.json`.
   - Iterate over the items to call your code (validation, parsing, business logic).
   - Keep your existing fixtures in parallel to compare the types of bugs you catch.

3. Run your tests by calling the generation script just before, for example:

   ```bash
   npm run gen:test-data && npm test
   ```

Questions to ask yourself:

- Do **new kinds of cases** appear (edge values, rare combinations, optional fields)?
- Do some tests fail because the schema and the code are not aligned?
- When tests fail, is it because the code is stricter than the schema (schema too permissive), or because the schema is looser than the real service (schema not updated)? In other words, did FoundryData surface a **contract/code drift** you had not noticed?
- Does the perceived integration cost feel acceptable for the benefits?

If you only have ~30 minutes, you can stop after Step 4 and still get a solid initial feel for the value. Step 5 (and the optional coverage step below) is optional but recommended if you want to see FoundryData in a real test run.

---

## Optional — Observe coverage for your schema

If you want to go one step further and understand **how well your schema is exercised** (structure, branches, enums, operations) without changing the data your tests see, you can run FoundryData with `coverage=measure` on the same schema:

```bash
# JSON Schema case — measure structure/branches coverage while keeping instances identical
npx foundrydata generate \
  --schema ./path/to/your-schema.json \
  --n 100 \
  --seed 42 \
  --coverage=measure \
  --coverage-dimensions=structure,branches,enum \
  --coverage-report=./tmp/foundrydata.coverage.json \
  --summary

# OpenAPI case — measure coverage for a specific operation
npx foundrydata openapi \
  --spec ./path/to/your-api.openapi.json \
  --operation-id getUser \
  --n 100 \
  --seed 42 \
  --coverage=measure \
  --coverage-dimensions=structure,branches,enum,operations \
  --coverage-report=./tmp/foundrydata.openapi.coverage.json \
  --summary
```

In `coverage=measure` mode, the sequence of generated instances is the same as in `coverage=off` for a fixed `(schema, options, seed, ajv posture)` tuple; the coverage layer only tracks which targets are hit. Two things to look at:

1. **CLI summary on stderr**  
   With `--summary`, each run prints a compact coverage summary to stderr (per-dimension, per-operation and overall coverage, plus target status counts and planner caps/unsatisfied hints when relevant). This gives you a quick feel for whether, for example, branch/enum coverage is healthy or very low.

2. **JSON coverage report (coverage-report/v1)**  
   The `--coverage-report` file contains a structured coverage report (versioned `coverage-report/v1`) with:
   - `metrics.overall`, `metrics.byDimension`, and `metrics.byOperation` (when OpenAPI is in play),
   - `metrics.targetsByStatus` (how many targets are active vs unreachable).  
   Start by looking at these metrics to understand whether coverage is very low (e.g. a handful of branches hit) or reasonably high for your schema.

   If you want to go deeper, you can inspect `uncoveredTargets` and planner diagnostics in the same JSON, or use this file as input to `foundrydata coverage diff` to compare coverage across branches or versions. For a more complete description of the `coverage-report/v1` format and diff tooling, see `packages/reporter/README.md`.

If you prefer a higher-level entry point for contract tests, you can also try `foundrydata contracts ...`, which defaults to `coverage=measure` and a balanced coverage profile (see the “Recommended contract-testing profile” section in `README.md` for an example).

This step is deliberately **optional** in the evaluation: it should help you judge whether coverage-aware features are relevant for your use case, without being required to assess the core “schema‑true, deterministic data” promise. Coverage here is a contract-level signal that complements your usual business-level and code coverage metrics; it is not meant to replace them.

---

In under an hour, you should have:

- a clear intuition about the **potential value** of FoundryData for your real code, and
- a first list of improvements for your schemas or for how you integrate tests.
