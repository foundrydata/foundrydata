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

## Report contract

The `Report` interface defined in [`src/model/report.ts`](./src/model/report.ts) is the reporter’s public contract. Key fields:

- `schemaId`, `schemaPath`, `schemaHash`: identify the source schema.
- `planOptions`: effective plan settings (always an object, empty by default).
- `meta`: tool and engine metadata.
- `instances`: concrete data rows emitted by the pipeline with outcomes.
- `metrics`: snapshot of `diag.metrics` (§15 of the spec).
- `summary`: aggregated counters (outcomes, diagnostic counts, timings).

Raw Normalize/Compose/Generate artefacts are marked `@internal` in the type and may change as the core evolves. Consumers should stick to the documented fields above plus `coverageIndexSnapshot`, `repair.actions`, and `validate.errors` when needed.

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

