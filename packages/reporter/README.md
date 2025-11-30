# json-schema-reporter

Reporting layer for the FoundryData JSON Schema engine. It runs the Normalize → Compose → Generate → Repair → Validate pipeline, captures the structured results, and renders them as JSON, Markdown, or HTML reports.

## Quick start

```bash
# from repo root
npx tsx packages/reporter/src/cli.ts run \
  --schema profiles/simple.json \
  --format json,markdown,html \
  --out-dir ./reports \
  --seed 123456789
```

By default the CLI emits three artefacts per schema:

| Format   | Description                                                     |
|----------|-----------------------------------------------------------------|
| JSON     | Mirrors the `Report` contract exported from `src/model/report.ts` |
| Markdown | Human-readable summary of metadata, diagnostics, coverage, instances |
| HTML     | Fully styled dashboard version of the Markdown report             |

### CLI options

| Option              | Description                                                    |
|---------------------|----------------------------------------------------------------|
| `--schema <path>`   | Path to the JSON Schema to analyze (required)                  |
| `--out-dir <dir>`   | Directory where rendered files are written                     |
| `--format <list>`   | Comma-separated list (`json`, `markdown`, `html`)              |
| `--seed <number>`   | Seed forwarded to the generator pipeline                       |
| `--max-instances`   | Maximum number of instances to keep in the report              |
| `--stdout`          | Write the single selected format to stdout instead of a file   |

### Bench mode

The reporter can also run a batch of schemas using a bench config. Each entry describes a schema path and optional overrides (seed, max instances, plan options). Example config:

```json
[
  { "id": "simple", "schema": "profiles/simple.json", "maxInstances": 2 },
  { "id": "medium", "schema": "profiles/medium.json", "seed": 42 }
]
```

Run the CLI bench command:

```bash
npx tsx packages/reporter/src/cli.ts bench \
  --config packages/reporter/test/fixtures/bench.config.json \
  --out-dir bench-reports \
  --format json
```

Outputs per schema `<id>.report.json` (and optional Markdown/HTML) plus a `bench-summary.json` aggregate aligned with the `BenchRunSummary` contract in [`src/bench/types.ts`](./src/bench/types.ts). Use the workbench bench dashboard to visualize this summary.

If a schema fails to run (missing file, unresolved references, etc.), the bench runner records it with `level: "blocked"` and an `error` message in the summary while continuing with the remaining entries.

When the failure comes from unresolved external `$ref`, the summary will typically show `error: "EXTERNAL_REF_UNRESOLVED"` for that entry. To inspect the underlying diagnostic in detail (e.g., which ref failed and in which mode), run the schema in isolation via the core CLI with `--debug-passes` or the reporter `run` command and inspect the resulting `*.report.json`.

### Bench with HTTP resolver (with-resolver config)

For runs that exercise the HTTP(S) resolver pre-phase (Extension R1), use the `bench.config.with-resolver.json` config:

```bash
npx tsx packages/reporter/src/cli.ts bench \
  --config packages/reporter/test/fixtures/bench.config.with-resolver.json \
  --out-dir bench-reports-with-resolver \
  --format json
```

This config keeps the original real-world schemas (no dense bundles) and forwards resolver options via `planOptions` (typically `resolver.strategies:['local','remote']` and a `cacheDir`). Some schemas may still appear as `level: "blocked"` with `error: "EXTERNAL_REF_UNRESOLVED"` when external `$ref` remain unresolved even after the pre-phase; in that case, use the CLI with `--compat lax --external-ref-strict warn --debug-passes` to explore skip-eligibility and diagnostics.

### Corpus mode (real-world schema harness)

The reporter also exposes a **corpus harness** on top of the core `runCorpusHarnessFromDir` API. It runs the full Normalize → Compose → Generate → Repair → Validate pipeline over a directory of schemas (e.g. `profiles/real-world`) and aggregates per-schema outcomes (success / UNSAT / fail-fast, caps, phase metrics).

From a project that has `json-schema-reporter` installed:

```bash
npx json-schema-reporter corpus \
  --corpus profiles/real-world \
  --mode lax \
  --count 5 \
  --seed 123 \
  --out reports/corpus-summary.lax.json
```

Options:

| Option              | Description                                                                 |
|---------------------|-----------------------------------------------------------------------------|
| `--corpus <dir>`    | Directory containing JSON Schemas (recursively scanned for `*.json`)       |
| `--mode <mode>`     | Pipeline mode: `strict` or `lax` (default: `strict`)                       |
| `--seed <number>`   | Seed applied to all schemas (default: `37`)                                |
| `--count <number>`  | Number of instances to attempt per schema (default: `3`)                   |
| `--out <path>`      | Output file for the aggregated corpus summary JSON (default: `corpus-summary.json`) |

The output file is a `CorpusRunReport` (see `src/corpus/types.ts`) containing:

- `results[]`: per-schema outcomes (instances tried/valid, UNSAT/fail-fast flags, caps, metrics).
- `summary`: global aggregates (number of schemas with success, UNSAT/fail-fast counts, cap counters).

You can load this `corpus-summary*.json` into the **Workbench** UI (`apps/workbench`) via the “corpus-summary.json” upload panel to inspect corpus-level behavior alongside individual reports and bench summaries.

## Report contract

The `Report` interface defined in [`src/model/report.ts`](./src/model/report.ts) is the reporter’s public contract. Key fields:

- `schemaId`, `schemaPath`, `schemaHash`: identify the source schema.
- `planOptions`: effective plan settings (always an object, empty by default).
- `meta`: tool and engine metadata.
- `instances`: concrete data rows emitted by the pipeline with outcomes.
- `metrics`: snapshot of `diag.metrics` (§15 of the spec).
- `summary`: aggregated counters (outcomes, diagnostic counts, timings).

Raw Normalize/Compose/Generate artefacts are marked `@internal` in the type and may change as the core evolves. Consumers should stick to the documented fields above plus `coverageIndexSnapshot`, `repair.actions`, and `validate.errors` when needed.

### Coverage-report/v1 overview

When coverage is enabled in the core engine (CLI or Node API), each run in `coverage=measure` or `coverage=guided` mode produces a JSON coverage report with a stable, versioned contract (`coverage-report/v1`). The shared `CoverageReport` type, defined in `@foundrydata/shared` and specified in the coverage-aware spec (cov://§7#json-coverage-report, cov://§7#thresholds-mincoverage), is the reference for this format.

At a high level, a coverage report contains:

- A **header** (`version`, `engine`, `run`) that records the report version, engine metadata (FoundryData version, coverage mode, AJV major) and run parameters (seed/masterSeed, `maxInstances`/`actualInstances`, `dimensionsEnabled`, `excludeUnreachable`, timestamps).
- A **metrics** block that aggregates coverage ratios and thresholds:
  - `metrics.overall` — global coverage ratio for the enabled dimensions.
  - `metrics.byDimension` — per-dimension coverage (e.g. `structure`, `branches`, `enum`).
  - `metrics.byOperation` — per-operation coverage when an OpenAPI context is present.
  - `metrics.targetsByStatus` — counts of targets per status (e.g. `active`, `unreachable`).
  - `metrics.thresholds` — optional thresholds; in V1 only `thresholds.overall` participates in `coverageStatus`, while per-dimension/per-operation thresholds are descriptive only.
  - `metrics.coverageStatus` — `ok` or `minCoverageNotMet` depending on whether the configured global threshold has been satisfied.
- Two **target arrays**:
  - `targets` — the universe of coverage targets materialized by the analyzer for the enabled dimensions.
  - `uncoveredTargets` — a filtered view containing only targets that were not hit.
- **Planner diagnostics**:
  - `unsatisfiedHints` — structured records for hints the planner/generator could not realise (for example because of conflicting constraints or caps).
  - `diagnostics.plannerCapsHit` — a summary of where deterministic caps limited planning.

An example fragment (fields abridged for brevity) looks like:

```json
{
  "version": "coverage-report/v1",
  "engine": {
    "foundryVersion": "1.2.3",
    "coverageMode": "guided",
    "ajvMajor": 8
  },
  "run": {
    "seed": 42,
    "maxInstances": 100,
    "actualInstances": 87,
    "dimensionsEnabled": ["structure", "branches", "enum"],
    "excludeUnreachable": true
  },
  "metrics": {
    "coverageStatus": "ok",
    "overall": 0.84,
    "byDimension": { "structure": 0.9, "branches": 0.8, "enum": 0.75 },
    "targetsByStatus": { "active": 120, "unreachable": 8 },
    "thresholds": { "overall": 0.8 }
  },
  "targets": [
    { "id": "T1", "dimension": "structure", "kind": "SCHEMA_NODE", "canonPath": "#", "hit": true }
  ],
  "uncoveredTargets": [],
  "unsatisfiedHints": [],
  "diagnostics": {
    "plannerCapsHit": [],
    "notes": []
  }
}
```

Consumers that need full details should rely on the `CoverageReport` type in `@foundrydata/shared` and the coverage-aware spec, and treat this section as a navigational overview rather than a complete schema reference.

### Coverage diff CLI usage

To compare two `coverage-report/v1` JSON files and highlight regressions, the core CLI exposes a dedicated diff command that the reporter can rely on in CI or local workflows:

```bash
# Compare two coverage-report/v1 files (baseline vs comparison)
npx foundrydata coverage diff path/to/baseline.json path/to/comparison.json
```

The two inputs must be valid coverage reports with `version: "coverage-report/v1"` and compatible metadata (same engine major, compatible operations scope, etc.), as enforced by the compatibility checks in the core. When they are compatible, the diff command:

- Reads both reports and runs a structural diff aligned with the coverage-aware spec (overall coverage, per-operation coverage, targets and statuses).
- Prints a human-readable summary to stdout, including:
  - Global coverage delta (`overall` from → to, with numeric delta).
  - Per-operation coverage deltas for operations present in both reports.
  - Lists of operations only present in the baseline or only in the comparison.
  - Newly uncovered targets (targets that were covered before and are now uncovered).
  - Status changes for targets (for example `active -> unreachable`).
- Uses a simple exit-code contract controlled by `--fail-on-regression` (default: `true`):
  - Exit code `0` when there is no regression in `coverage.overall`, no per-operation regressions and no newly uncovered targets.
  - Exit code `1` when any of the above regressions or new gaps are detected (while still printing the diff summary).
  - Exit code `0` even in the presence of regressions when `--fail-on-regression=false` is passed, which is useful for exploratory comparisons.

If the reports are not compatible for diff (for example mismatched operations scope or unsupported version), the command fails with a clear error describing the incompatibility rather than attempting a partial diff.

In practice, the typical workflow is:

1. Generate coverage-report/v1 files for two runs (for example, `coverage-baseline.json` on `main` and `coverage-pr.json` on a feature branch) using the core CLI `--coverage-report` option.
2. Call `foundrydata coverage diff coverage-baseline.json coverage-pr.json` in CI.
3. Let the diff summary and exit code drive gatekeeping policies while using the reporter’s own rendering for richer, per-report dashboards when needed.

For an overview of coverage modes, dimensions, thresholds and how to turn coverage on in the core CLI or Node.js API, see the “Coverage-aware generation” section in the repository root `README.md`.

## Testing & snapshots

The package ships with Vitest snapshot tests under `test/`:

```bash
cd packages/reporter
npm install
npm test               # runs vitest using vitest.config.ts
npx vitest run test/reporter.snapshot.test.ts --update  # refresh snapshots
```

`reporter.snapshot.test.ts` fixes the seed, loads `profiles/simple.json`, and snapshots:

1. The JSON `Report` object.
2. The Markdown render (`renderMarkdownReport`).
3. The HTML render (`renderHtmlReport`).

Snapshots live in `test/__snapshots__/`. Whenever the rendering or pipeline output changes intentionally, re-run with `--update` to refresh them.

## Development notes

- The CLI is ESM (`type": "module"`). Import project files using `.js` extensions (e.g., `../src/engine/runner.js`).
- `runEngineOnSchema` calls the real core pipeline (`@foundrydata/core/executePipeline`) and normalizes the coverage snapshot, repairs, and validation errors before returning a report.
- Tests and linting are run from the repo root via `npm run lint`, `npm run test`, and `npm run test:coverage`.
