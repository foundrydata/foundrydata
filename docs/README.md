# FoundryData — Docs Index

This page lists the authoritative documentation. Each document is source-controlled alongside the implementation so changes stay in lockstep with the pipeline.

## Specification & Guarantees

- Feature Support Simplification Plan (canonical spec) — `docs/feature-simplification/spec-canonical-json-schema-generator.md`
- Cross-phase invariants — `docs/Invariants.md`
- Known limits and guardrails — `docs/Known-Limits.md`
- Feature matrix (✓ / ~ / ⚠️) — `docs/Features.md`
- Phasing and control-plane overview — `docs/feature-simplification/Phasing.md`
- Spec overview — `docs/feature-simplification/README.md`

## Diagnostics & Observability

- Diagnostic catalog (`code`, `budget`, `scoreDetails`) — `docs/error.md`
- Bench & performance gates — `docs/Known-Limits.md#performance-gates`
- Diagnostics envelope schema — `docs/feature-simplification/spec-canonical-json-schema-generator.md` §19 (validated in `packages/core/src/diag/validate.ts`)

## Resolver Extension (R1) — Quick Guide

The optional HTTP(S) resolver is an opt‑in pre‑pipeline step that fetches external `$ref` targets and hydrates a local cache and in‑memory registry. Core phases (`Normalize → Compose → Generate → Repair → Validate`) remain I/O‑free; in Lax, when unresolved externals are stubbed or otherwise deemed skip‑eligible, final validation may be skipped with diagnostics recording `validationsPerRow = 0`, otherwise validation runs against the original schema.

- Enable strategies via CLI:
  - Development (tsx):
    - `npx tsx packages/cli/src/index.ts generate --schema <file> --resolve=local` (default; no network)
    - `npx tsx packages/cli/src/index.ts generate --schema <file> --resolve=local,schemastore --cache-dir "~/.foundrydata/cache"`
  - After build:
    - `foundrydata generate --schema <file> --resolve=local,remote --cache-dir "~/.foundrydata/cache"`
- Offline/Lax stubs (planning‑time only):
  - `--compat lax --fail-on-unresolved=false` maps to Lax mode with `resolver.stubUnresolved:'emptySchema'`.
  - Planning proceeds with `{}` stubs; final validation applies skip eligibility and sets `validationsPerRow = 0` when skipped.
- Observability:
  - Run‑level notes are emitted under `compose(...).diag.run[]` with `canonPath:"#"`:
    - `RESOLVER_STRATEGIES_APPLIED`, `RESOLVER_CACHE_HIT`, `RESOLVER_CACHE_MISS_FETCHED`, `RESOLVER_OFFLINE_UNAVAILABLE`, snapshot events, and add‑schema skips (e.g., `RESOLVER_ADD_SCHEMA_SKIPPED_INCOMPATIBLE_DIALECT`, `RESOLVER_ADD_SCHEMA_SKIPPED_DUPLICATE_ID`).
  - Planning‑time stubs emit `EXTERNAL_REF_STUBBED` warnings (per‑path).
- Determinism:
  - Compose/memo cache keys incorporate a `resolver.registryFingerprint` so outcomes are stable for a fixed registry.

See `docs/Known-Limits.md#resolver-r1-scope--limits` for limits and security posture.

## Architecture & Reference

- High-level architecture: `ARCHITECTURE.md`
- Comprehensive feature reference: `docs/COMPREHENSIVE_FEATURE_SUPPORT.md`
- Agents runbook (operational mode): `AGENTS.md`

## Testing

- Testing architecture overview: `docs/tests/FoundryData Testing Architecture - Initial State Inventory.md`
- JSON Schema format reference: `docs/tests/reference_json_schema_format_v_2.md`
- Test runner config: `vitest.config.ts`
- Test entry readme: `test/README.md`

## Examples

- Examples index: `docs/examples/README.md`
- Draft schemas: `docs/examples/draft-07.json`, `docs/examples/draft-2019-09.json`, `docs/examples/draft-2020-12.json`
- Sample domains: `docs/examples/saas-user-schema.json`, `docs/examples/ecommerce-schema.json`, `docs/examples/api-transaction-schema.json`, `docs/examples/team-with-users-schema.json`

## Operational non-goals

- No remote resolution of external `$ref` during core phases; generation operates on local fragments only. The optional Resolver pre‑phase (R1) may fetch over HTTP(S) to a local cache/registry used read‑only by core phases.
- Deterministic generation only (no learned/scenario-based distributions).
- Generated data is not cached or persisted; every run revalidates against the source schema.

## Development quick links

- From the repository root (`foundrydata-monorepo`, Node.js 20+):
  - Build: `npm run build`
  - Typecheck: `npm run typecheck`
  - Tests: `npm run test`

For a product overview and getting started guide, see the project root `README.md`.
