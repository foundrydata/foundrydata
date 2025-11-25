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
  > ./tmp/foundrydata.sample.ndjson

# OpenAPI case (operation responses) — also redirect if you prefer
npx foundrydata openapi \
  --spec ./path/to/your-api.openapi.json \
  --operation-id getUser \
  --n 100 \
  --seed 42 \
  > ./tmp/foundrydata.openapi.sample.ndjson
```

We will inspect the generated sample file(s) in the next step.

---

## Step 3 — Look at the shape of the data

When looking at the 100 generated items:

- If you see **mostly `{}` or very empty objects**:
  - Your schema is probably **very permissive** (few `required` fields, no `min*`, little structural constraint).
  - **Do not treat this as a failure of FoundryData.** It is telling you that, according to JSON Schema, an empty object is a valid instance for this contract.
  - Ask yourself: “Is this consistent with what the API really accepts in production?”
  - This is often the first useful insight: your schema behaves as a very permissive *acceptance* contract, not as an *expressive* model of typical payloads.
- If the shape **looks like your real payloads** (expected fields present, plausible lengths, non-empty lists, etc.):
  - Your schema already captures a good portion of your domain constraints.
  - Check whether surprising cases appear (edge values, rarely-tested optional fields, unusual combinations).

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

---

## Step 5 — Plug it quickly into an existing test

Goal: see whether FoundryData surfaces cases that your static fixtures don’t cover, without rewriting your whole test setup.

A minimal approach:

1. Add a script to your `package.json` (in **your** project) that generates fixtures:

   Assuming you have `foundrydata` installed as a dev dependency so it is available in `node_modules/.bin`, for example:

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

   If you prefer not to install it yet, you can replace `foundrydata` with `npx foundrydata` in that script.

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
- Does the perceived integration cost feel acceptable for the benefits?

If you only have ~30 minutes, you can stop after Step 4 and still get a solid initial feel for the value. Step 5 (and the Bonus below) is optional but recommended if you want to see FoundryData in a real test run.

---

In under an hour, you should have:

- a clear intuition about the **potential value** of FoundryData for your real code, and
- a first list of improvements for your schemas or for how you integrate tests.
