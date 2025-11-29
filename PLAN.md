Task: 9304.9304006   Title: Enforce coverage profile presets
Anchors: [cov://§6#budget-profiles, cov://§7#cli-summary]
Touched files:
- packages/cli/src/index.ts
- packages/cli/src/config/coverage-options.ts
- packages/cli/src/config/__tests__/coverage-options.test.ts

Approach:
I will extend the CLI coverage parser so the quick/balanced/thorough profiles become the presets described by cov://§6#budget-profiles instead of just a caps shortcut. That means enriching `resolveCliCoverageOptions` with a small lookup from profile to `dimensionsEnabled`, planner caps/priority and a recommended `maxInstances`, then using that recommendation whenever the user runs a guided mode without an explicit `--n`. The `generate` and `openapi` command handlers will be updated to consume the new recommendation (while still honoring `--n/--count/--rows` when supplied) so the pipeline sees the expected budgets while the parser continues to gate coverage options under `coverage=off`. I will also refresh the `--coverage-profile` help text so the CLI documents the implied dimensions and instance ranges, keeping the CLI UI aligned with the spec’s requirement that users understand what each profile wires up.

On the testing side I will add dedicated unit tests for `resolveCliCoverageOptions` to assert that each profile yields the right `dimensionsEnabled`, the planner `caps`/`dimensionPriority` from the preset, and the recommended `maxInstances` only in guided mode, plus that explicit `--coverage-dimensions` overrides the preset list. These tests will cover the `cov://§6#budget-profiles` expectations head-on (dimensions, budgets, caps) and satisfy the CLI test strategy bullet (TS4) by making the internal configuration observable even without running a full CLI invocation.

Risks/Unknowns:
- The default `maxInstances` recommendation must never override an existing `--n` flag or break existing scripts that depend on `count` defaulting to 1; I need to be careful to only apply the preset when no explicit row count is provided.
- The preset for thorough mentions `boundaries` once available; I should verify that enabling it today does not accidentally break runs that still expect only structure/branches/enum in `dimensionsEnabled`.
- The planner caps from the profiles must stay stable even as the planner evolves; snapshotting the exact numbers in the tests makes this subtask sensitive to future refactors, but without it TS4 would remain unverified.

Parent bullets couverts: [KR5, DOD3, TS4]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
