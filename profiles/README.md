# FoundryData Profiles

This directory now contains both the normative bench fixtures described in the SPEC (`simple.json`, `medium.json`, `pathological.json`) and an opt-in catalog of real-world schemas under `real-world/`. The extra fixtures are copies of widely used public JSON Schemas so we can stress FoundryData against authentic inputs without reaching back to the legacy implementation.

## Refreshing real-world fixtures

Each file is a verbatim download of the upstream schema on 2025-10-26. To refresh, re-run the associated `curl -L` command and verify the file parses with `node -e "JSON.parse(fs.readFileSync(path,'utf8'))"` before committing.

| File | Upstream source | License / Notes |
| --- | --- | --- |
| `real-world/npm-package.schema.json` | https://json.schemastore.org/package.json | SchemaStore (MIT); describes npm package manifests. |
| `real-world/tsconfig.schema.json` | https://json.schemastore.org/tsconfig | SchemaStore (MIT); TypeScript compiler options. |
| `real-world/github-workflow.schema.json` | https://json.schemastore.org/github-workflow | SchemaStore (MIT); GitHub Actions workflow syntax. |
| `real-world/openapi-3.1.schema.json` | https://spec.openapis.org/oas/3.1/schema/2022-10-07 | OpenAPI Initiative; CC-BY 4.0, see upstream repo for details. |
| `real-world/asyncapi-3.0.schema.json` | https://raw.githubusercontent.com/asyncapi/spec-json-schemas/master/schemas/3.0.0.json | AsyncAPI Initiative (Apache-2.0). |
| `real-world/cloudevents.schema.json` | https://raw.githubusercontent.com/cloudevents/spec/main/cloudevents/formats/cloudevents.json | CloudEvents Specification (Apache-2.0). |

## Using the fixtures

- **CLI smoke tests**: `npx foundrydata generate --schema profiles/real-world/openapi-3.1.schema.json --rows 10 --seed 42`
- **Real-world bench harness**: `npm run bench:real-world` executes the optional dataset with the same seeds `{1,42,4242}` and budgets as spec://§1#bench-sli-gate; set `FOUNDRY_BENCH_QUICK=1` for a 1×3 iteration sanity run.
- **Diagnostics review**: capture `--print-metrics` output when running against these schemas to confirm we still emit the per-stage timings mandated by spec://§15#metrics.

Please keep this README updated when adding/removing fixtures.

## Current bench:real-world status (FOUNDRY_BENCH_QUICK=1)

- `npm-package` — **pass** (p95 ≈ 52 ms, memory ≈ 161 MB)
- `tsconfig` — **pass** (p95 ≈ 46 ms, memory ≈ 172 MB)
- `github-workflow` — **fail** (`FINAL_VALIDATION_FAILED`)
- `openapi-3.1` — **fail** (`FINAL_VALIDATION_FAILED`)
- `asyncapi-3.0` — **fail** (`reference "http://json-schema.org/draft-07/schema" resolves to more than one schema`)
- `cloudevents` — **fail** (`FINAL_VALIDATION_FAILED`)

Failures currently exit the script with code 1 but still produce partial metrics and a gate summary so regressions are visible.
