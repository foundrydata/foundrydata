# FoundryData — Docs Index

This page lists the authoritative documentation that accompanies the Feature Simplification refactor. Each document is source-controlled alongside the implementation so changes stay in lockstep with the pipeline.

## Specification & Guarantees

- Feature Support Simplification Plan — `docs/feature-simplification/feature-support-simplification.md`
- Cross-phase invariants — `docs/Invariants.md`
- Known limits and guardrails — `docs/Known-Limits.md`
- Feature matrix (✓ / ~ / ⚠️) — `docs/Features.md`
- Phasing and control-plane overview — `docs/feature-simplification/Phasing.md`
- SPEC overview — `docs/feature-simplification/README.md`

## Diagnostics & Observability

- Diagnostic catalog (`code`, `budget`, `scoreDetails`) — `docs/error.md`
- Bench & performance gates — `docs/Known-Limits.md#performance-gates`
- Diagnostics envelope schema — `docs/feature-simplification/feature-support-simplification.md` §19 (referenced by `packages/core/src/diag/schemas.ts`)

## Architecture & Reference

- High-level architecture: ARCHITECTURE.md
- Comprehensive feature reference: docs/COMPREHENSIVE_FEATURE_SUPPORT.md
- Agents runbook (operational mode): AGENTS.md

## Testing

- Testing architecture overview: docs/tests/FoundryData Testing Architecture - Initial State Inventory.md
- JSON Schema format reference: docs/tests/reference_json_schema_format_v_2.md
- Test runner config: vitest.config.ts
- Test entry readme: test/README.md

## Examples

- Examples index: docs/examples/README.md
- Draft schemas: docs/examples/draft-07.json, docs/examples/draft-2019-09.json, docs/examples/draft-2020-12.json
- Sample domains: docs/examples/saas-user-schema.json, docs/examples/ecommerce-schema.json, docs/examples/api-transaction-schema.json, docs/examples/team-with-users-schema.json

## Operational non-goals

- No remote resolution of external `$ref`; generation operates on local fragments only.
- Deterministic generation only (no learned/scenario-based distributions).
- Generated data is not cached or persisted; every run revalidates against the source schema.

## Development quick links

- Build: npm run build
- Typecheck: npm run typecheck
- Tests: npm run test
