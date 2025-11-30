# FoundryData Profiles

This directory contains both the normative bench fixtures described in the SPEC (`simple.json`, `medium.json`, `pathological.json`) and an opt-in catalog of real-world schemas under `real-world/`. The extra fixtures are copies of widely used public JSON Schemas so we can stress FoundryData against authentic inputs without reaching back to the legacy implementation.

---

## Normative Bench Fixtures

These three schemas are referenced in the canonical SPEC for performance SLO/SLI validation:

- `simple.json` — Basic schema with simple types
- `medium.json` — Moderate complexity with nested structures
- `pathological.json` — Complex schema designed to stress-test the pipeline

---

## Real-World Schemas

The `real-world/` directory contains **30+ production JSON Schemas** from public sources, organized by domain. Each file is a verbatim download of the upstream schema (latest refresh **2025-11-29**).

To refresh, re-run the associated `curl -L` command and verify the file parses with `node -e "JSON.parse(fs.readFileSync(path,'utf8'))"` before committing.

### Package Managers & Build Tools

| File | Upstream source | License / Notes |
| --- | --- | --- |
| `npm-package.schema.json` | https://json.schemastore.org/package.json | SchemaStore (MIT); npm package manifests |
| `tsconfig.schema.json` | https://json.schemastore.org/tsconfig | SchemaStore (MIT); TypeScript compiler options |
| `compose-spec.schema.json` | https://raw.githubusercontent.com/compose-spec/compose-spec/master/schema/compose-spec.json | Docker Compose Specification (Apache-2.0) |
| `docker_compose_spec.json` | https://raw.githubusercontent.com/docker/compose/master/compose/config/config_schema_v1.json | Docker Compose v1 schema |
| `docker_compose_config_schema_v1.json` | https://raw.githubusercontent.com/docker/compose/master/compose/config/config_schema_v1.json | Docker Compose config v1 |
| `dependabot-2.0.schema.json` | https://json.schemastore.org/dependabot-2.0 | SchemaStore (MIT); GitHub Dependabot config |

### CI/CD & DevOps

| File | Upstream source | License / Notes |
| --- | --- | --- |
| `github-workflow.schema.json` | https://json.schemastore.org/github-workflow | SchemaStore (MIT); GitHub Actions workflow syntax |
| `azure-pipelines.schema.json` | https://json.schemastore.org/azure-pipelines | SchemaStore (MIT); Azure Pipelines YAML |

### Kubernetes & Container Orchestration

| File | Upstream source | License / Notes |
| --- | --- | --- |
| `kubernetes-deployment.schema.json` | https://kubernetesjsonschema.dev/master/deployment-apps-v1.json | Kubernetes JSON Schema project (Apache-2.0) |
| `kubernetes-pod.schema.json` | https://kubernetesjsonschema.dev/master/pod-v1.json | Kubernetes JSON Schema project (Apache-2.0) |

### API Specifications

| File | Upstream source | License / Notes |
| --- | --- | --- |
| `openapi-3.1.schema.json` | https://spec.openapis.org/oas/3.1/schema/2022-10-07 | OpenAPI Initiative; CC-BY 4.0 |
| `openapi-2024-10-18.schema.json` | https://spec.openapis.org/oas/3.1/schema/2024-10-18 | OpenAPI Initiative; CC-BY 4.0 (latest) |
| `openapi-2017-08-27.schema.json` | https://spec.openapis.org/oas/3.0/schema/2017-08-27 | OpenAPI Initiative; OpenAPI 3.0 |
| `swagger-2.0.schema.json` | https://json.schemastore.org/swagger-2.0 | SchemaStore (MIT); Swagger/OpenAPI 2.0 |
| `asyncapi-3.0.schema.json` | https://raw.githubusercontent.com/asyncapi/spec-json-schemas/master/schemas/3.0.0.json | AsyncAPI Initiative (Apache-2.0) |

### Cloud Events & Event Schemas

| File | Upstream source | License / Notes |
| --- | --- | --- |
| `cloudevents.schema.json` | https://raw.githubusercontent.com/cloudevents/spec/main/cloudevents/formats/cloudevents.json | CloudEvents Specification (Apache-2.0) |
| `google-pubsub-event.schema.json` | https://raw.githubusercontent.com/googleapis/google-cloudevents/master/jsonschema/google/events/cloud/pubsub/v1/MessagePublishedData.json | Google CloudEvents (Apache-2.0) |
| `google-audit-log-entry.schema.json` | https://raw.githubusercontent.com/googleapis/google-cloudevents/master/jsonschema/google/events/cloud/audit/v1/LogEntryData.json | Google CloudEvents (Apache-2.0) |
| `google-analytics-event.schema.json` | https://raw.githubusercontent.com/googleapis/google-cloudevents/master/jsonschema/google/events/firebase/analytics/v1/AnalyticsLogData.json | Google CloudEvents (Apache-2.0) |

### Container Images & OCI

| File | Upstream source | License / Notes |
| --- | --- | --- |
| `oci-image-index.schema.json` | https://raw.githubusercontent.com/opencontainers/image-spec/main/schema/image-index-schema.json | OCI Image Spec (Apache-2.0) |
| `oci-image-manifest.schema.json` | https://raw.githubusercontent.com/opencontainers/image-spec/main/schema/image-manifest-schema.json | OCI Image Spec (Apache-2.0) |

### Standards & Data Formats

| File | Upstream source | License / Notes |
| --- | --- | --- |
| `GeoJSON.schema.json` | https://geojson.org/schema/GeoJSON.json | GeoJSON Specification (public domain) |
| `fhir.schema.json` | https://www.hl7.org/fhir/fhir.schema.json | HL7 FHIR healthcare standard |
| `cyclonedx-1.6.schema.json` | https://raw.githubusercontent.com/CycloneDX/specification/master/schema/bom-1.6.schema.json | CycloneDX SBOM (Apache-2.0) |
| `spdx-2.3.schema.json` | https://raw.githubusercontent.com/spdx/spdx-spec/development/v2.3/schemas/spdx-schema.json | SPDX license metadata (Apache-2.0) |
| `jsonresume-1.0.schema.json` | https://raw.githubusercontent.com/jsonresume/resume-schema/master/schema.json | JSON Resume (public schema) |

### Schema Fragments & Dependencies

These are auxiliary files referenced by other schemas or used for testing purposes:

| File | Purpose |
| --- | --- |
| `content-descriptor.json` | OpenRPC content descriptor fragment |
| `defs.json` | Common definitions fragment |
| `defs-descriptor.json` | Descriptor definitions fragment |
| `metadata.schema.json` | Metadata schema fragment |

---

## Bundled Dense Fixtures

To comply with `spec://§11#strict` (no runtime deref of external `$ref`), we keep self-contained bundles of public schemas under `real-world/dense/`. Regenerate with the commands below before updating.

| File | Upstream source | Refresh command | Notes |
| --- | --- | --- | --- |
| `cityjson.bundled.schema.json` | https://raw.githubusercontent.com/cityjson/specs/master/schemas/cityjson.schema.json | `npx tsx scripts/bundle-schema.ts https://raw.githubusercontent.com/cityjson/specs/master/schemas/cityjson.schema.json profiles/real-world/dense/cityjson.bundled.schema.json` | Includes `metadata`, `cityobjects`, `appearance`, `geomprimitives`, `geomtemplates` definitions |
| `kubernetes-deployment.bundled.schema.json` | https://kubernetesjsonschema.dev/master/deployment-apps-v1.json | `npx tsx scripts/bundle-schema.ts profiles/real-world/kubernetes-deployment.schema.json profiles/real-world/dense/kubernetes-deployment.bundled.schema.json` | Inline bundle of Kubernetes apps/v1 Deployment with `_definitions.json` |
| `epcis-2.0.bundled.schema.json` | https://raw.githubusercontent.com/gs1/EPCIS/master/JSON-Schema/EPCIS-JSON-Schema-root.json | `npx tsx scripts/bundle-schema.ts https://raw.githubusercontent.com/gs1/EPCIS/master/JSON-Schema/EPCIS-JSON-Schema-root.json profiles/real-world/dense/epcis-2.0.bundled.schema.json` | EPCIS 2.0 root with inlined auxiliary schemas |
| `stripe-openapi.bundled.schema.json` | https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json | `npx tsx scripts/bundle-schema.ts https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json profiles/real-world/dense/stripe-openapi.bundled.schema.json` | Full Stripe OpenAPI 3.0 spec (components, responses, etc.) |
| `cloudformation-provider-definition.bundled.schema.json` | https://raw.githubusercontent.com/aws-cloudformation/aws-cloudformation-resource-schema/master/src/main/resources/schema/provider.definition.schema.v1.json | `npx tsx scripts/bundle-schema.ts https://raw.githubusercontent.com/aws-cloudformation/aws-cloudformation-resource-schema/master/src/main/resources/schema/provider.definition.schema.v1.json profiles/real-world/dense/cloudformation-provider-definition.bundled.schema.json` | CloudFormation resource provider meta-schema with definitions inlined |
| `sdm-vehicle.bundled.schema.json` | https://raw.githubusercontent.com/smart-data-models/dataModel.Transportation/master/Vehicle/schema.json | `npx tsx scripts/bundle-schema.ts https://raw.githubusercontent.com/smart-data-models/dataModel.Transportation/master/Vehicle/schema.json profiles/real-world/dense/sdm-vehicle.bundled.schema.json` | Smart Data Models "Vehicle" schema with dependent fragments resolved |
| `openbanking-account-info.bundled.json` | https://raw.githubusercontent.com/OpenBankingUK/read-write-api-specs/master/dist/openapi/account-info-openapi.json | `npx tsx scripts/bundle-schema.ts https://raw.githubusercontent.com/OpenBankingUK/read-write-api-specs/master/dist/openapi/account-info-openapi.json profiles/real-world/dense/openbanking-account-info.bundled.json` | Open Banking UK Account & Transaction OpenAPI (full bundle) |
| `openbanking-obaccount6.schema.json` | n/a (extracted from row above) | `npx tsx scripts/extract-openapi-component.ts profiles/real-world/dense/openbanking-account-info.bundled.json OBAccount6 profiles/real-world/dense/openbanking-obaccount6.schema.json` | Standalone OBAccount6 schema with local refs resolved |
| `oci-image-manifest.bundled.schema.json` | https://raw.githubusercontent.com/opencontainers/image-spec/main/schema/image-manifest-schema.json | `npx tsx scripts/bundle-schema.ts https://raw.githubusercontent.com/opencontainers/image-spec/main/schema/image-manifest-schema.json profiles/real-world/dense/oci-image-manifest.bundled.schema.json` | OCI image manifest with all references inlined |
| `oci-image-manifest.bundled.local.schema.json` | Local variant of above | Manual bundling | OCI image manifest local variant with additional constraints |

---

## Using the Fixtures

### CLI Smoke Tests

```bash
# Generate from a real-world schema
npx foundrydata generate --schema profiles/real-world/openapi-3.1.schema.json --n 10 --seed 42

# Use bundled dense fixtures
npx foundrydata generate --schema profiles/real-world/dense/cityjson.bundled.schema.json --n 5
```

### Real-World Bench Harness (Performance Gate)

```bash
# Full benchmark run
npm run bench:real-world

# Quick sanity check (1×3 iteration)
FOUNDRY_BENCH_QUICK=1 npm run bench:real-world
```

Executes the optional dataset with seeds `{1,42,4242}` and budgets as per `spec://§1#bench-sli-gate`. Use this primarily to track p50/p95 latency and memory budgets.

### Corpus Harness (Correctness / UNSAT / Caps Overview)

```bash
# Strict mode (default)
npm run corpus:real-world

# Lax mode with custom parameters
npx tsx scripts/run-corpus.ts \
  --corpus profiles/real-world \
  --mode lax \
  --count 5 \
  --seed 123 \
  --out reports/corpus-summary.lax.json
```

Produces a `corpus-summary*.json` aligned with `CorpusRunReport` schema (per-schema success vs UNSAT/fail-fast, caps, and phase metrics). Load this file into the Workbench "corpus-summary.json" panel to explore corpus-level behavior.

### Diagnostics Review

Capture `--print-metrics` output when running against these schemas to confirm we still emit the per-stage timings mandated by `spec://§15#metrics`:

```bash
foundrydata generate \
  --schema profiles/real-world/asyncapi-3.0.schema.json \
  --n 100 \
  --print-metrics \
  --debug-passes
```

---

## Current Bench:real-world Status

**Last run**: FOUNDRY_BENCH_QUICK=1 (Nov 29, 2025)

| Schema | Status | p50 Latency | p95 Latency | Memory | Notes |
|--------|--------|-------------|-------------|--------|-------|
| npm-package | ⚠️ slow | 2034.86 ms | 2094.53 ms | 565.80 MB | **Severe regression** (was ~49ms) |
| tsconfig | ✅ pass | 41.69 ms | 59.71 ms | 565.80 MB | - |
| github-workflow | ❌ FAIL | - | - | - | FINAL_VALIDATION_FAILED |
| openapi-3.1 | ✅ pass | 58.21 ms | 66.24 ms | 565.80 MB | - |
| asyncapi-3.0 | ⚠️ slow | 264.76 ms | 275.63 ms | 565.80 MB | Exceeds 120ms budget |
| cloudevents | ✅ pass | 20.79 ms | 21.61 ms | 565.80 MB | - |

**Gate Status**: ❌ **FAILING** — p95 = 2094.53ms (budget: 120ms), memory = 565.80MB (budget: 512MB)

The aggregate p95 latency is **dominated by npm-package** (2094.53ms), which represents a severe 40x performance regression from the baseline (~49ms). Additionally, github-workflow fails validation entirely, and asyncapi-3.0 exceeds the latency budget.

**Critical Issues**:
- **npm-package**: Severe performance regression (~2000ms vs ~49ms baseline) — requires urgent investigation
- **github-workflow**: Validation failure (FINAL_VALIDATION_FAILED) — schema compatibility issue with tuple constraints
- **asyncapi-3.0**: Exceeds latency budget (275.63ms > 120ms)

`npm run bench:real-world` exits with code 1 but still emits per-profile metrics and the gate summary so regressions remain visible.

---

## Maintenance Guidelines

- **When adding schemas**: Update the appropriate category table above with upstream source and license
- **When refreshing**: Update the "latest refresh" date at the top of this file
- **When bundling**: Add entry to the "Bundled Dense Fixtures" table with refresh command
- **Keep coverage current**: If bench results change significantly, update the status table

Please keep this README updated when adding/removing fixtures.
