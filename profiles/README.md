# FoundryData Profiles

This directory now contains both the normative bench fixtures described in the SPEC (`simple.json`, `medium.json`, `pathological.json`) and an opt-in catalog of real-world schemas under `real-world/`. The extra fixtures are copies of widely used public JSON Schemas so we can stress FoundryData against authentic inputs without reaching back to the legacy implementation.

## Refreshing real-world fixtures

Each file is a verbatim download of the upstream schema (latest refresh 2025-10-27). To refresh, re-run the associated `curl -L` command and verify the file parses with `node -e "JSON.parse(fs.readFileSync(path,'utf8'))"` before committing.

| File | Upstream source | License / Notes |
| --- | --- | --- |
| `real-world/npm-package.schema.json` | https://json.schemastore.org/package.json | SchemaStore (MIT); describes npm package manifests. |
| `real-world/tsconfig.schema.json` | https://json.schemastore.org/tsconfig | SchemaStore (MIT); TypeScript compiler options. |
| `real-world/github-workflow.schema.json` | https://json.schemastore.org/github-workflow | SchemaStore (MIT); GitHub Actions workflow syntax. |
| `real-world/openapi-3.1.schema.json` | https://spec.openapis.org/oas/3.1/schema/2022-10-07 | OpenAPI Initiative; CC-BY 4.0, see upstream repo for details. |
| `real-world/asyncapi-3.0.schema.json` | https://raw.githubusercontent.com/asyncapi/spec-json-schemas/master/schemas/3.0.0.json | AsyncAPI Initiative (Apache-2.0). |
| `real-world/cloudevents.schema.json` | https://raw.githubusercontent.com/cloudevents/spec/main/cloudevents/formats/cloudevents.json | CloudEvents Specification (Apache-2.0). |
| `real-world/kubernetes-deployment.schema.json` | https://kubernetesjsonschema.dev/master/deployment-apps-v1.json | Kubernetes JSON Schema project (Apache-2.0). |
| `real-world/google-pubsub-event.schema.json` | https://raw.githubusercontent.com/googleapis/google-cloudevents/master/jsonschema/google/events/cloud/pubsub/v1/MessagePublishedData.json | Google CloudEvents (Apache-2.0). |
| `real-world/google-audit-log-entry.schema.json` | https://raw.githubusercontent.com/googleapis/google-cloudevents/master/jsonschema/google/events/cloud/audit/v1/LogEntryData.json | Google CloudEvents (Apache-2.0). |
| `real-world/google-analytics-event.schema.json` | https://raw.githubusercontent.com/googleapis/google-cloudevents/master/jsonschema/google/events/firebase/analytics/v1/AnalyticsLogData.json | Google CloudEvents (Apache-2.0). |

### Bundled dense fixtures

To comply with spec://§11#strict (no runtime deref of external `$ref`), we keep self-contained bundles of public schemas under `real-world/dense/`. Regenerate with the commands below before updating.

| File | Upstream source | Refresh command | Notes |
| --- | --- | --- | --- |
| `real-world/dense/cityjson.bundled.schema.json` | https://raw.githubusercontent.com/cityjson/specs/master/schemas/cityjson.schema.json | `npx tsx scripts/bundle-schema.ts https://raw.githubusercontent.com/cityjson/specs/master/schemas/cityjson.schema.json profiles/real-world/dense/cityjson.bundled.schema.json` | Includes `metadata`, `cityobjects`, `appearance`, `geomprimitives`, `geomtemplates` definitions. |
| `real-world/dense/kubernetes-deployment.bundled.schema.json` | https://kubernetesjsonschema.dev/master/deployment-apps-v1.json | `npx tsx scripts/bundle-schema.ts profiles/real-world/kubernetes-deployment.schema.json profiles/real-world/dense/kubernetes-deployment.bundled.schema.json` | Inline bundle of Kubernetes apps/v1 Deployment with `_definitions.json`. |
| `real-world/dense/epcis-2.0.bundled.schema.json` | https://raw.githubusercontent.com/gs1/EPCIS/master/JSON-Schema/EPCIS-JSON-Schema-root.json | `npx tsx scripts/bundle-schema.ts https://raw.githubusercontent.com/gs1/EPCIS/master/JSON-Schema/EPCIS-JSON-Schema-root.json profiles/real-world/dense/epcis-2.0.bundled.schema.json` | EPCIS 2.0 root with inlined auxiliary schemas. |
| `real-world/dense/stripe-openapi.bundled.schema.json` | https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json | `npx tsx scripts/bundle-schema.ts https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json profiles/real-world/dense/stripe-openapi.bundled.schema.json` | Full Stripe OpenAPI 3.0 spec (components, responses, etc.). |
| `real-world/dense/cloudformation-provider-definition.bundled.schema.json` | https://raw.githubusercontent.com/aws-cloudformation/aws-cloudformation-resource-schema/master/src/main/resources/schema/provider.definition.schema.v1.json | `npx tsx scripts/bundle-schema.ts https://raw.githubusercontent.com/aws-cloudformation/aws-cloudformation-resource-schema/master/src/main/resources/schema/provider.definition.schema.v1.json profiles/real-world/dense/cloudformation-provider-definition.bundled.schema.json` | CloudFormation resource provider meta-schema with definitions inlined. |
| `real-world/dense/sdm-vehicle.bundled.schema.json` | https://raw.githubusercontent.com/smart-data-models/dataModel.Transportation/master/Vehicle/schema.json | `npx tsx scripts/bundle-schema.ts https://raw.githubusercontent.com/smart-data-models/dataModel.Transportation/master/Vehicle/schema.json profiles/real-world/dense/sdm-vehicle.bundled.schema.json` | Smart Data Models “Vehicle” schema with dependent fragments resolved. |
| `real-world/dense/openbanking-account-info.bundled.json` | https://raw.githubusercontent.com/OpenBankingUK/read-write-api-specs/master/dist/openapi/account-info-openapi.json | `npx tsx scripts/bundle-schema.ts https://raw.githubusercontent.com/OpenBankingUK/read-write-api-specs/master/dist/openapi/account-info-openapi.json profiles/real-world/dense/openbanking-account-info.bundled.json` | Open Banking UK Account & Transaction OpenAPI (full bundle). |
| `real-world/dense/openbanking-obaccount6.schema.json` | n/a (extracted from row above) | `npx tsx scripts/extract-openapi-component.ts profiles/real-world/dense/openbanking-account-info.bundled.json OBAccount6 profiles/real-world/dense/openbanking-obaccount6.schema.json` | Standalone OBAccount6 schema with local refs resolved. |

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
- `asyncapi-3.0` — **fail** (`FINAL_VALIDATION_FAILED`)
- `cloudevents` — **fail** (`FINAL_VALIDATION_FAILED`)

Failures currently exit the script with code 1 but still produce partial metrics and a gate summary so regressions are visible.
