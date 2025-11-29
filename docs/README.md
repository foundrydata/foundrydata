# FoundryData — Docs Index

This page lists the authoritative documentation. Each document is source-controlled alongside the implementation so changes stay in lockstep with the pipeline.

## Core Specifications

### Canonical Generation Pipeline

- **Feature Support Simplification Plan** (canonical spec) — `docs/spec-canonical-json-schema-generator.md`

  The authoritative specification for the core 5-stage generation pipeline: Normalize → Compose → Generate → Repair → Validate. Defines all JSON Schema support, branch selection, repair strategies, and performance targets.

### Coverage-Aware Generation (V1.0)

- **Coverage-Aware Spec V1.0** — `docs/spec-coverage-aware-v1.0.md`

  Extends the core pipeline with optional coverage tracking and guided generation. Defines coverage model, dimensions (structure/branches/enum/boundaries), analyzer/planner/evaluator phases, and coverage-report/v1 format.

### Policies & Limits

- Cross-phase invariants — `docs/Invariants.md`
- Known limits and guardrails — `docs/Known-Limits.md`
- Feature matrix (✓ / ~ / ⚠️) — `docs/Features.md`

## Diagnostics & Observability

- Diagnostic catalog (`code`, `budget`, `scoreDetails`) — `docs/error.md`
- Bench & performance gates — `docs/Known-Limits.md#performance-gates`
- Diagnostics envelope schema — `docs/spec-canonical-json-schema-generator.md` §19 (validated in `packages/core/src/diag/validate.ts`)

## Resolver Extension (R1)

The optional HTTP(S) resolver is an opt‑in pre‑pipeline step that fetches external `$ref` targets and hydrates a local cache and in‑memory registry. Core phases (`Normalize → Compose → Generate → Repair → Validate`) remain I/O‑free; in Lax mode, when unresolved externals are stubbed or otherwise deemed skip‑eligible, final validation may be skipped with diagnostics recording `validationsPerRow = 0`, otherwise validation runs against the original schema.

### Quick Reference

**Enable strategies via CLI:**

- Development (tsx):
  ```bash
  # Local only (default; no network)
  npx tsx packages/cli/src/index.ts generate --schema <file> --resolve=local

  # Local + SchemaStore
  npx tsx packages/cli/src/index.ts generate --schema <file> \
    --resolve=local,schemastore \
    --cache-dir "~/.foundrydata/cache"
  ```

- After build:
  ```bash
  # Local + remote with cache
  foundrydata generate --schema <file> \
    --resolve=local,remote \
    --cache-dir "~/.foundrydata/cache"
  ```

**Offline/Lax stubs (planning‑time only):**
- `--compat lax --fail-on-unresolved=false` maps to Lax mode with `resolver.stubUnresolved:'emptySchema'`.
- Planning proceeds with `{}` stubs; final validation applies skip eligibility and sets `validationsPerRow = 0` when skipped.

**Observability:**
- Run‑level notes are emitted under `compose(...).diag.run[]` with `canonPath:"#"`:
  - `RESOLVER_STRATEGIES_APPLIED`, `RESOLVER_CACHE_HIT`, `RESOLVER_CACHE_MISS_FETCHED`, `RESOLVER_OFFLINE_UNAVAILABLE`, snapshot events, and add‑schema skips (e.g., `RESOLVER_ADD_SCHEMA_SKIPPED_INCOMPATIBLE_DIALECT`, `RESOLVER_ADD_SCHEMA_SKIPPED_DUPLICATE_ID`).
- Planning‑time stubs emit `EXTERNAL_REF_STUBBED` warnings (per‑path).

**Determinism:**
- Compose/memo cache keys incorporate a `resolver.registryFingerprint` so outcomes are stable for a fixed registry.

See `docs/Known-Limits.md#resolver-r1-scope--limits` for limits and security posture.

## Architecture & Reference

- High-level architecture: `ARCHITECTURE.md`
- Comprehensive feature reference: `docs/COMPREHENSIVE_FEATURE_SUPPORT.md`
- Agents runbook (operational mode for coverage-aware tasks 9300..9327): `AGENTS.md`
- Development guide for Claude AI: `CLAUDE.md`

## Testing

- Testing architecture overview: root `README.md#testing-high-level`
- JSON Schema format reference: `docs/spec-canonical-json-schema-generator.md`
- Coverage-aware testing: `docs/spec-coverage-aware-v1.0.md` §6 "Testing Strategy"
- Test runner config: `vitest.config.ts`, `test/vitest.config.ts`
- Test entry commands: see `README.md#development`

## Examples & Use Cases

- Examples index: `examples/README.md`
- Product scenarios & use cases: `docs/use-cases/product-scenarios.md`
- Draft schemas: `examples/draft-07.json`, `examples/draft-2019-09.json`, `examples/draft-2020-12.json`
- Sample domains:
  - `examples/saas-user-schema.json` — SaaS users with plans, flags, formats
  - `examples/ecommerce-schema.json` — Product catalog with patternProperties
  - `examples/api-transaction-schema.json` — Transactions with oneOf, date-time
  - `examples/team-with-users-schema.json` — Arrays with uniqueItems, contains
  - `examples/users-api.json` — OpenAPI 3.1 document
  - `examples/payment.json` — Payment events (contract testing)
  - `examples/llm-output.json` — LLM structured output

## Operational Non-Goals

- No remote resolution of external `$ref` during core phases; generation operates on local fragments only. The optional Resolver pre‑phase (R1) may fetch over HTTP(S) to a local cache/registry used read‑only by core phases.
- Deterministic generation only (no learned/scenario-based distributions).
- Generated data is not cached or persisted; every run revalidates against the source schema.

## Development Quick Links

From the repository root (`foundrydata-monorepo`, Node.js 20+):

- **Build**: `npm run build`
- **Typecheck**: `npm run typecheck`
- **Lint**: `npm run lint`
- **Tests**: `npm run test`
- **Bench**: `npm run bench`
- **Task ready** (quality gate): `npm run task-ready` — runs lint, typecheck, build, test

For a product overview and getting started guide, see the project root `README.md`.

## Additional Resources

- **Changelog**: `docs/CHANGELOG.md`
- **Advanced SPEC (P1 automata/SMT)**: `docs/spec-jsg-p1-automata-smt.md` (future optimization research)
- **Internal prompts** (development): `docs/feature-simplification/prompts/` (context expansion, audits, spec-to-tasks)
