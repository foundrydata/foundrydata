Task: 19   Title: Acceptance tests: arrays, refs, determinism
Anchors: [spec://§11#modes, spec://§11#strict, spec://§11#lax, spec://§15#performance-determinism-metrics, spec://§15#rng]

Touched files:
- PLAN.md
- test/acceptance/arrays/contains-vs-maxitems.spec.ts
- test/acceptance/refs/external-refs-policy.spec.ts
- test/acceptance/determinism/deterministic-output.spec.ts

Approach:
I will add high-level acceptance tests that exercise the full pipeline via executePipeline, focusing on three areas: arrays with contains vs maxItems, external $ref policies, and deterministic output under fixed seeds. For arrays, I will introduce tests under test/acceptance/arrays/ that use small schemas with conflicting minContains, maxContains, maxItems, and uniqueItems to validate that the compose phase detects impossible bags, emits the expected CONTAINS_* diagnostics, and fails the pipeline without generating items when the sum of minContains exceeds the effective array capacity. For external references, I will build scenarios under test/acceptance/refs/ that cover strict vs lax modes: in strict mode the Source Ajv compile failure on unresolved external $ref must cause EXTERNAL_REF_UNRESOLVED and a hard stop before generation; in lax mode, the pipeline should use the probe strategy to decide when to set skippedValidation:true while still surfacing EXTERNAL_REF_UNRESOLVED with mode:'lax' and keeping validationsPerRow consistent with the SPEC. For determinism, I will add tests under test/acceptance/determinism/ that run the same schema and options (including seed and mode) multiple times and assert equality of generated items and key diagnostics (e.g., oneOf branch decisions’ scoreDetails.tiebreakRand), without depending on wall-clock-based metrics; these tests will complement existing integration and unit tests by asserting behaviour at the pipeline boundary and ensuring that acceptance-level guarantees hold for arrays, external refs, and RNG-based branch selection.

Risks/Unknowns:
- Arrays contains vs maxItems already have detailed unit tests in the composition engine; acceptance tests must avoid over-specifying internal details while still validating the UNSAT behaviour expected by the higher-level spec.
- External $ref behaviour depends on the interaction between Source Ajv error reporting and the probe schema; tests must remain robust to minor changes in diagnostic shape while still asserting the strict vs lax policy differences (hard stop vs skipped validation).
- Determinism tests that look at diagnostics or coverage must be careful to ignore timing fields so that harmless performance noise does not cause flaky assertions.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
