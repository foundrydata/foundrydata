Task: 9604.9604006   Title: Surface bench diagnostics when entry fails
Anchors: [spec://§2#observability-surfaces, spec://§19#envelope, spec://§7#platform-kpis-gates]
Touched files:
- packages/reporter/src/bench/runner.ts
- packages/reporter/src/engine/runner.ts
- packages/reporter/test/bench.runner.test.ts
- packages/reporter/src/bench/types.ts
- packages/reporter/test/fixtures/bench.config.smoke.json

Approach:
Expose pipeline diagnostics (repair/validate) in bench outputs without changing pipeline semantics. In bench runner: when a schema run fails, capture the pipelineResult diagnostics and thread them into the bench schema summary (error field or dedicated diagnostics array) and persist them in a sidecar artifact for traceability. In engine runner: plumb validation/repair diagnostics alongside the existing gate evaluation so bench consumers can serialize them. Update the smoke bench test to assert that a failing schema (missing file or validation failure) includes diagnostics content in the summary or artifacts instead of just a generic FINAL_VALIDATION_FAILED/ENOENT. Keep observability passive: only read existing diagnostics, stable-sort them, avoid timestamps/random fields, and do not alter branch decisions or outputs. Ensure the new payload respects diagnosticsEnvelope schema and keeps Reporter/Platform gate behavior unchanged.

Risks/Unknowns:
- Avoid leaking large payloads; need concise diagnostic summaries to keep bench outputs lightweight.
- Must ensure determinism (stable ordering) and avoid breaking existing consumers of bench summaries.
- Confirm schema/typing expectations for bench summary/error; may need minimal format extension.

Parent bullets couverts: [KR4, DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test -- packages/reporter/test/bench.runner.test.ts
- bench: npm run bench
- diag-schema: true
