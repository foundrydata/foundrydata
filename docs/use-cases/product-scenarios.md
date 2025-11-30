# FoundryData product scenarios

This document describes a few realistic ways a developer might use FoundryData today and captures where the current CLI and Node API feel smooth, confusing, or incomplete. It is primarily an internal product/design aid; for a general introduction see `README.md`, for a “try it in under 1 hour” walkthrough see `EVALUATION.md`, and for a capability overview see `docs/Features.md`.

## Scenario 1 — API mocks / MSW-style fixtures

**User context**

You maintain a front-end application that consumes an HTTP API documented in OpenAPI 3.1. You want reproducible JSON fixtures for a couple of operations to drive MSW handlers, Prism, or local mock servers without hand-writing payloads.

**Goal**

- Load an OpenAPI document from disk.
- Select a concrete operation/response (e.g. `GET /users` 200 JSON).
- Generate a small, deterministic stream of response bodies you can save as NDJSON or wire into a mocking layer.

**Success criteria (user view)**

- One or two commands (CLI or Node script) take you from OpenAPI file to usable fixtures.
- Running with the same spec + operation + seed yields identical responses.
- All emitted responses validate against the selected response schema via AJV.

**CLI example**

```bash
# Generate example responses for GET /users
foundrydata openapi \
  --spec examples/users-api.json \
  --operation-id getUsers \
  --n 5 \
  --seed 42 \
  --out ndjson
```

**Node API example**

```bash
npx tsx scripts/examples/api-mocks.ts
```

This script loads `examples/users-api.json`, selects the `getUsers` 200 JSON response, calls `Generate` with a fixed seed, validates a sample of responses with `Validate`, and prints both a short summary and a handful of example payloads.

**Coverage-aware extension**

When you want to understand how well a given OpenAPI operation is exercised without changing the payloads you feed into your mock layer, you can rerun the same command in `coverage=measure` mode. In this mode the stream of instances is the same as `coverage=off` for a fixed seed; the coverage layer only computes targets and metrics on top.

```bash
# Measure structural/branch coverage for GET /users without changing payloads
foundrydata openapi \
  --spec examples/users-api.json \
  --operation-id getUsers \
  --n 50 \
  --seed 42 \
  --out ndjson \
  --coverage=measure \
  --coverage-dimensions=structure,branches,enum,operations \
  --coverage-profile=balanced \
  --coverage-report=coverage-users.json \
  --coverage-exclude-unreachable true
```

The CLI prints a one-line coverage summary to stderr (per-dimension, per-operation and overall coverage, plus planner caps and unsatisfied hints when the operations dimension is enabled) and writes a `coverage-report/v1` JSON file to `coverage-users.json` for deeper inspection in CI or local analysis. For more CLI options and profiles, see the “Coverage-aware generation” section in `examples/README.md`.

**Friction / gaps**

- What feels easy / obvious: once you know about `foundrydata openapi` and `--operation-id`, getting NDJSON fixtures for a single operation is straightforward, and the parity between CLI and Node API (same `Generate`/AJV pipeline) is reassuring.
- What feels confusing: the relationship between `--mode` and `--compat` is not obvious from the command help, and it is unclear which one typical OpenAPI users should care about; the number of advanced flags (resolver, diagnostics, trials) can be intimidating when you “just want some responses”.
- What feels missing: there is no single flag to emit ready-to-use MSW/Prism handlers (you still have to map NDJSON into your mocking framework), and there is no ergonomic way to generate both success and error responses for the same operation in one go.

**Current status**

- ⚠️ Usable but friction points: good enough for an experienced user comfortable with CLI flags and OpenAPI details, but the number of options and lack of higher-level “mock server” helpers make it less friendly for casual use.

**Potential next steps**

- Add a higher-level helper (CLI or Node) in `packages/cli` (with thin wrappers in `packages/core` as needed) that outputs MSW/Prism handlers for a given operation.
- Provide presets or shortcuts for “simple mocks” that hide most advanced flags.
- Make it easier to request multiple response kinds at once (e.g. 2×200, 2×4xx) while still preserving determinism.

## Scenario 2 — Contract tests / integration tests

**User context**

You own a service or event producer that exposes a JSON Schema for requests or event payloads. You want a small, deterministic corpus of valid instances to drive integration or contract tests (for example, end-to-end tests against a local stack or consumer-driven contract tests in CI).

**Goal**

- Load a JSON Schema that describes a request or event.
- Generate a handful of valid instances (e.g. 10 payments).
- Feed those instances into contract tests while being able to rerun them deterministically.

**Success criteria (user view)**

- For a given schema + seed, the same NDJSON sequence is produced across runs and environments.
- The generator does not silently emit invalid payloads; AJV validation passes for at least the sample being used in tests.
- It is easy to glue the command output into an existing test runner (e.g. Jest, Vitest, Cypress).

**CLI example**

```bash
# Contract-style fixtures for a payment schema (with CI-friendly summary)
foundrydata generate \
  --schema examples/payment.json \
  --n 10 \
  --seed 123 \
  --out ndjson \
  --summary
```

**Node API example**

```bash
npx tsx scripts/examples/contract-tests.ts \
  --schema examples/payment.json \
  --n 10 \
  --seed 123
```

This script loads `examples/payment.json`, runs `Generate` with a fixed seed to produce a small list of payments, validates them with `Validate`, and prints a summary that can be asserted from an integration test (e.g. “10 items, all AJV-valid, deterministic for seed 123”). It also accepts optional flags (`--schema`, `--n`/`--count`, `--seed`, `--mode`, `--coverage`, `--coverage-dimensions`, `--coverage-min`) so it can act as a reusable contract-testing harness in CI or local runs.

**Coverage-aware extension**

For CI-style contract tests you can ask FoundryData to both generate fixtures and enforce a minimum overall coverage threshold in a single guided run:

```bash
# Guided contract fixtures with a global coverage threshold
foundrydata generate \
  --schema examples/payment.json \
  --n 200 \
  --seed 123 \
  --out ndjson \
  --coverage=guided \
  --coverage-profile=balanced \
  --coverage-dimensions=structure,branches,enum \
  --coverage-min=0.8 \
  --coverage-report=coverage-payments.json \
  --coverage-exclude-unreachable true
```

If the resulting `coverage-report/v1` shows `coverage.overall < minCoverage` for the enabled dimensions, the CLI exits with a dedicated non-zero code while still emitting fixtures, making it easy to fail the job but keep artifacts for debugging. The stderr summary mirrors the structure described in the coverage-aware spec (per-dimension, per-operation, overall coverage plus caps and unsatisfied hints). See `examples/README.md` for a minimal CI snippet wiring this pattern into a job.

> **Recommended CI baseline (measure)**  
> For many teams, a first step before guided runs is to enforce coverage in `coverage=measure` mode with a balanced profile and a global threshold:
>
> ```bash
> foundrydata generate \
>   --schema examples/payment.json \
>   --n 300 \
>   --seed 123 \
>   --out ndjson \
>   --coverage=measure \
>   --coverage-profile=balanced \
>   --coverage-dimensions=structure,branches,enum \
>   --coverage-min=0.8 \
>   --coverage-report=coverage-payments-measure.json \
>   --summary
> ```
>
> In this mode the instance stream is still identical to `coverage=off` for a fixed seed; coverage-report/v1 and the `[foundrydata] coverage: …` summary are used purely as a CI gate and observability layer. Adding `--summary` (or its alias `--manifest`) on the CLI prints a compact JSON summary to stderr (counts, metrics, coverage aggregates when enabled) without changing the NDJSON fixtures on stdout, which is convenient for CI dashboards or post-processing. This configuration matches the “Recommended contract-testing profile” described in the main README (strict mode, coverage=measure, balanced profile, `structure,branches,enum` dimensions, global coverage-min).

**Friction / gaps**

- What feels easy / obvious: calling `foundrydata generate --schema … --n … --seed … --out ndjson` matches expectations, and piping NDJSON into other tools (or reading it from a Node test) is straightforward. The `--summary` flag makes it easy to grab a compact JSON record for CI without touching the fixtures.
- What feels confusing: deciding when to use `--compat lax` vs. strict mode is not clearly documented from a contract-testing perspective, and the presence of many advanced flags (resolver, diagnostics, branch trials) can make it hard to know the minimal set needed for “boring contract tests”.
- What feels missing: there is still no first-class “test harness” mode that couples fixture generation with a ready-to-use validation helper for the same schema; users have to wire `foundrydata generate`/NDJSON and `Validate` together manually in their test runner.

**Current status**

- ✅ Good enough as-is for users comfortable with JSON Schema and CLI tools; the public `Generate` and `Validate` APIs already support deterministic, AJV-true contract fixtures, and `scripts/examples/contract-tests.ts` offers a concrete, reusable harness on top of the Node API.

**Potential next steps**

- Extend `packages/reporter` and the docs to show how to consume both the `--summary` / `--manifest` JSON and the harness output in CI (for example to drive dashboards or GitHub checks) rather than relying only on coverage-report/v1.
- Document a recommended “contract testing profile” (e.g. which flags to use or avoid, including `--summary`) in the main README, with pointers to the harness as a reference implementation.

## Scenario 3 — LLM structured output testing

**User context**

You build features on top of LLMs that return structured JSON (for example, search results, classifications, or summarization metadata). You have a JSON Schema that describes the expected shape of the model output and want to both unit test your parsing/validation code and compare different schema variants before wiring them into prompts.

**Goal**

- Define or iterate on a JSON Schema that captures the desired output shape.
- Generate a small, deterministic set of example outputs that “look like” realistic LLM responses.
- Use those examples to test your validation, parsing, and downstream business logic.

**Success criteria (user view)**

- It is easy to point FoundryData at a schema and get back a handful of plausible-looking instances.
- Generated instances are AJV-valid and stable for a fixed seed, so they can be safely used in unit tests.
- Switching between schema variants (e.g. v1 vs. v2) is low friction, making it practical to compare trade-offs.

**CLI example**

```bash
# Fixtures for an LLM summarization result schema
foundrydata generate \
  --schema examples/llm-output.json \
  --n 5 \
  --seed 99 \
  --out ndjson
```

**Node API example**

```bash
npx tsx scripts/examples/llm-output.ts
```

This script loads `examples/llm-output.json`, calls `Generate` with a fixed seed to produce a few structured outputs, validates them via `Validate`, and prints both a small sample and a summary that could be asserted from unit tests or used to eyeball how “realistic” the generated shapes feel.

**Coverage-aware extension**

When iterating on LLM output schemas, coverage-aware runs can help you see which branches and enums are actually exercised by your fixtures. A common pattern is to use a cheaper “quick” profile locally and a deeper “thorough” profile in nightly jobs:

```bash
# Quick, cheap guided coverage run during local schema iteration
foundrydata generate \
  --schema examples/llm-output.json \
  --n 75 \
  --seed 99 \
  --coverage=guided \
  --coverage-profile=quick \
  --coverage-dimensions=structure,branches \
  --coverage-report=coverage-llm-quick.json

# Thorough profile (adds enum/boundaries) for deeper coverage in CI
foundrydata generate \
  --schema examples/llm-output.json \
  --coverage=guided \
  --coverage-profile=thorough \
  --coverage-dimensions=structure,branches,enum,boundaries \
  --coverage-report=coverage-llm-thorough.json \
  --coverage-exclude-unreachable true
```

Both commands emit AJV-valid instances; the main differences are the enabled dimensions, implied budgets and the amount of structure the planner tries to cover. When the `boundaries` dimension is enabled, target counts can grow significantly on large or heavily constrained schemas and deterministic caps described in `docs/Known-Limits.md` apply, so boundaries metrics should be interpreted as best-effort on those inputs. Inspecting the JSON reports (or the CLI summary) makes it easier to decide whether a given LLM schema is “well covered enough” for your tests. For a more exhaustive tour of coverage flags and profiles, see the “Coverage-aware generation” section in `examples/README.md`.

**Friction / gaps**

- What feels easy / obvious: once the schema exists, generating fixtures with `Generate` or the CLI feels natural, and the AJV-backed `Validate` API makes it straightforward to plug generated instances into existing validation code.
- What feels confusing: there is no LLM-specific guidance around formats (for example, how to handle `string` fields that will actually contain natural-language paragraphs, or how to express optional vs. nullable fields for tools that expect OpenAI-style JSON Schema).
- What feels missing: a higher-level LLM helper that couples schema, prompt, and validation is absent; users still have to manually wire FoundryData-generated fixtures into their LLM testing stack, and there is no out-of-the-box way to compare two schema variants side by side beyond writing custom scripts.

**Current status**

- ⚠️ Usable but friction points: technically works well for teams already validating LLM outputs with JSON Schema, but lacks LLM-focused ergonomics and guidance.

**Potential next steps**

- Add documentation or examples (for example under `docs/` and `examples/`) that show how to pair FoundryData with common LLM toolchains (e.g. JSON mode, function calling, tool schemas).
- Provide a helper script or library function in `packages/core` or `packages/cli` that generates fixtures for two schema variants and reports structural differences to aid design discussions.
- Explore a lightweight “LLM testing profile” implemented as an additional coverage/profile mapping in the CLI that tunes generation options for more human-like strings where appropriate while staying within the existing engine.

## Product fit summary

- **API mocks / MSW-style fixtures:** ⚠️ Usable but noisy — the building blocks are in place (OpenAPI driver, `openapi` CLI, seeded generation), yet missing high-level helpers and the number of flags create friction for non-experts.
- **Contract tests / integration tests:** ✅ Strong fit — the current CLI and Node API already satisfy the core needs for deterministic, AJV-valid fixtures with minimal ceremony; improvements are mostly about documentation and small quality-of-life options.
- **LLM structured output testing:** ⚠️ Usable but friction points — the engine works well for structured outputs, but there is little LLM-specific guidance or tooling, so users must assemble their own testing workflows on top.
