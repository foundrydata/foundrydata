Task: 21   Title: JSG-P1 Preparation: Requirements Analysis and Structured TODO
Anchors: [spec://§0#philosophy-invariants, spec://§1#objective, spec://§4#normative-requirements, spec://§5#diagnostics-observability-coverage, spec://§7#interfaces]

Touched files:
- .taskmaster/docs/jsg-p1-requirements-analysis.md
- PLAN.md

Approach:
This task produces a single source of truth for JSG-P1 by extracting all normative requirements from docs/jsg-p1-automata-smt.md and organizing them by pipeline phase and cross-cutting concern. I will first walk the spec end-to-end, tagging every RFC-2119 statement (MUST, MUST NOT, SHALL, MAY) and grouping them into themes: AJV oracle invariants, name automata under additionalProperties:false, arrays/numbers reasoning (including optional local SMT), diagnostics and metrics, and external-facing interfaces (Node API, CLI, OpenAPI drivers). For each theme I will assign the requirement to one or more of the five stages (Normalize, Compose, Generate, Repair, Validate), making explicit which phase is responsible for satisfying it and what inputs/outputs it relies on. I will then connect these requirement clusters to the existing JSG-P1 tasks 1–20, highlighting foundational work (invariants/diagnostics), the automata stack, arrays/numbers, generator/repair wiring, and interface/acceptance-test layers. The result is a Markdown document under .taskmaster/docs that can be used as a checklist and dependency map when implementing the remaining tasks.

Risks/Unknowns:
- Exact mapping between JSG-P1 document sections and the broader feature-simplification SPEC may need refinement later.
- Task Master status is managed outside this doc and may drift if tasks are edited manually.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

