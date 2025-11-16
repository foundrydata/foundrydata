Task: 25   Title: Product scenarios, examples and DX friction log
Anchors: [spec://§1#goal, spec://§2#scope, spec://§3-core-principles, spec://§4-pipeline, spec://§6-phases]

Touched files:
- PLAN.md
- docs/use-cases/product-scenarios.md
- examples/openapi/users-api.json
- examples/schemas/payment.json
- examples/schemas/llm-output.json
- examples/api-mocks.ts
- examples/contract-tests.ts
- examples/llm-output.ts
- packages/core/test/e2e/examples.integration.spec.ts

Approach:
I will capture 2–3 realistic FoundryData scenarios from a user’s perspective and formalize them in a new docs/use-cases/product-scenarios.md file, focusing on API mocks, contract-style integration tests, and LLM structured output validation. For each scenario I will describe the user context, their goal, and plain-language success criteria, then propose concrete CLI invocations using the existing foundrydata generate/openapi flags so they can run flows end-to-end without learning internal details. In parallel I will add small, self-contained Node examples under examples/, each loading a local schema or OpenAPI document from examples/schemas/, calling the public Generate and Validate facades from @foundrydata/core with fixed seeds, printing a compact summary plus a small sample of instances, and spot-checking AJV validity so the scripts behave like real user snippets rather than internal harnesses. To keep these examples from rotting, I will introduce a new e2e test file in packages/core/test/e2e that imports the example helpers, asserts they do not throw, produce at least one AJV-valid instance for their schema, and behave deterministically for a fixed seed when appropriate. Finally, I will extend the product-scenarios.md document with a friction/gaps section and a short “product fit” verdict per scenario, based only on the observed behavior of the public Node API and CLI, without touching pipeline internals.

Risks/Unknowns:
- The example schemas and OpenAPI document must stay intentionally simple so they remain maintainable while still exercising realistic flows; overfitting them to edge cases would blur the boundary between examples and internal test harnesses.
- Importing example scripts from core e2e tests requires careful relative paths so Vitest and TypeScript resolve them cleanly without leaking test-only helpers into the public API surface.
- Some UX friction may stem from broader design choices (for example around compat vs mode flags) that are out of scope for this task; I should document these clearly in the friction log without attempting speculative refactors.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
