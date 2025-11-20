Task: 26   Title: Preserve fail-fast stage from diagnostic envelopes
Anchors: [spec://§19#diagnostics, spec://§19#envelope, spec://§19#phase-separation]

Touched files:
- PLAN.md
- packages/core/src/pipeline/corpus-harness.ts
- packages/core/src/pipeline/__tests__/corpus-harness.spec.ts

Approach:
I will align the corpus harness with the diagnostics contract in §19 by deriving the fail-fast stage directly from each diagnostic envelope’s recorded `phase` instead of re-mapping codes through `getDiagnosticPhase`. The current lookup silently drops the stage for future fail-fast codes that have envelopes but are not yet whitelisted in the phase map; using the envelope keeps reporting faithful to the emitted diagnostics while still respecting the phase separation rules in §19. I will start by reviewing the existing fail-fast aggregation to confirm the unsat vs fail-fast split and ensure the change does not disturb the derived failureCategory/kind heuristics. Then I will replace the stage derivation with a phase-preserving path that trusts the envelope (the source of truth defined by §19) and only falls back to derived classification if ever needed for malformed inputs, keeping `failFastCode` untouched. After updating the harness, I will add a focused unit test that simulates a future fail-fast diagnostic code that is recognized by the fail-fast filter but absent from the phase map; the test will stub the fail-fast predicate to admit the synthetic code, feed a validation-stage envelope, and assert that `failFastStage` mirrors the envelope’s phase. This ensures we do not regress when new fail-fast codes land before the phase map is updated. I will also double-check that existing AJV/config classification tests still pass to prove behavior stays stable for known codes. Finally, I will run the standard build, test, and bench commands so the change is exercised across the pipeline and validated against the diagnostics schema expectations.

Risks/Unknowns:
- The synthetic fail-fast code in tests must avoid interfering with other diagnostics, so the stubbed predicate needs to fall back cleanly to the real implementation.
- Existing reports already written to disk may still show the legacy stage computation; the fix only affects newly generated harness runs.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
