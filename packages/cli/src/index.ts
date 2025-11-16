#!/usr/bin/env node
/* eslint-disable max-lines */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */

// CLI entry point (current state)
// - Command name: `foundrydata` with subcommands `generate` and `openapi`.
// - `generate` accepts --schema, --count/--rows/--n, --seed, --mode/--compat, --out, and
//   many advanced options (rewrite-conditionals, resolver, metrics, etc.), then calls the
//   high-level Generate Node API from @foundrydata/core and prints JSON/NDJSON.
// - `openapi` loads an OpenAPI document from disk, selects a response schema (with
//   --operation-id/--path/--method and --prefer-examples) and also calls Generate internally.
//
// TODO (CLI DX — PARTIALLY DONE):
// - The CLI now delegates to the high-level Generate Node API, preserving strict/lax mode,
//   seed determinism, prefer-examples, and AJV-oracle validation.
// - Remaining DX work:
//   - Simplify the top-level UX (fewer expert flags by default, possibly a shorter alias) while
//     keeping the existing `foundrydata generate` behavior available or clearly deprecated.
//   - Document the recommended “happy path” invocations (schema/OpenAPI file → k fixtures →
//     NDJSON/JSON) and how they map onto Normalize/Compose/Generate/Repair/Validate.

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ErrorPresenter,
  isFoundryError,
  FoundryError,
  ErrorCode,
  resolveOptions,
  Generate,
  PipelineStageError,
  type PipelineResult,
  selectResponseSchemaAndExample,
  type OpenApiDriverOptions,
} from '@foundrydata/core';
import { renderCLIView } from './render.js';
import {
  parsePlanOptions,
  resolveRowCount,
  resolveCompatMode,
  resolveOutputFormat,
  type OutputFormat,
} from './flags.js';
import { printComposeDebug } from './debug.js';

const program = new Command();

program
  .name('foundrydata')
  .description('Generate test data from JSON Schema')
  .version('0.1.0');

program
  .command('generate')
  .description('Generate test data from schema')
  .option('-s, --schema <file>', 'JSON Schema file path')
  .option('-c, --count <number>', 'Number of items to generate')
  .option('-r, --rows <number>', 'Alias for --count')
  .option('-n, --n <number>', 'Alias for --count')
  .option('--seed <number>', 'Deterministic seed', '424242')
  .option('--locale <string>', 'Locale (e.g., en, fr)', 'en')
  .option(
    '--repair-attempts <number>',
    'Per-item retry attempts on validation failure',
    '1'
  )
  .option('--print-metrics', 'Print pipeline metrics as JSON to stderr', false)
  .option('--compat <mode>', 'Compatibility mode: strict|lax', 'strict')
  .option('--mode <mode>', 'Execution mode: strict|lax')
  .option(
    '--rewrite-conditionals <mode>',
    'Conditional rewriting: never|safe|aggressive',
    'never'
  )
  .option('--debug-freeze', 'Enable debug freeze for development')
  .option('--skip-trials', 'Skip branch trials, use score-only selection')
  .option('--trials-per-branch <number>', 'Number of trials per branch', (v) =>
    parseInt(v, 10)
  )
  .option(
    '--max-branches-to-try <number>',
    'Maximum branches in Top-K selection',
    (v) => parseInt(v, 10)
  )
  .option(
    '--skip-trials-if-branches-gt <number>',
    'Skip trials when branch count exceeds this',
    (v) => parseInt(v, 10)
  )
  .option(
    '--external-ref-strict <mode>',
    'External $ref handling: error|warn|ignore',
    'error'
  )
  .option(
    '--dynamic-ref-strict <mode>',
    'Dynamic $ref handling: warn|note',
    'note'
  )
  .option(
    '--encoding-bigint-json <mode>',
    'BigInt JSON encoding: string|number|error',
    'string'
  )
  .option('--no-metrics', 'Disable metrics collection')
  .option(
    '--resolve <strategies>',
    'Resolver strategies: local[,remote][,schemastore]',
    'local'
  )
  .option('--cache-dir <path>', 'Resolver cache directory (supports ~)')
  .option(
    '--fail-on-unresolved <bool>',
    'Set false to enable Lax planning stubs (maps to resolver.stubUnresolved=emptySchema)',
    (v) => String(v)
  )
  .option('--out <format>', 'Output format: json|ndjson', 'json')
  .option(
    '--prefer-examples',
    'Prefer OpenAPI examples over generated data when available'
  )
  .option('--debug-passes', 'Print effective configuration to stderr')
  .action(async function (this: Command, options) {
    try {
      const schemaPath = options.schema as string | undefined;
      if (!schemaPath) throw new Error('Missing --schema <file>');
      const abs = path.resolve(process.cwd(), schemaPath);
      if (!fs.existsSync(abs)) throw new Error(`Schema file not found: ${abs}`);
      const raw = fs.readFileSync(abs, 'utf8');
      const input = JSON.parse(raw);

      // Determine compatibility mode early (used by pre-scan and generation)
      const compat = resolveCompatMode({
        mode: options.mode,
        compat: options.compat,
      });

      // When running in lax mode, scan and log unsupported features (best-effort)
      if (compat === 'lax') {
        const scanUnsupported = (input: unknown): string[] => {
          const unsupported: string[] = [];
          const KEYS = new Set([
            'allOf',
            'anyOf',
            'oneOf',
            'not',
            'if',
            'then',
            'else',
            'patternProperties',
            'propertyNames',
            'dependentSchemas',
          ]);
          const visit = (node: unknown): void => {
            if (!node || typeof node !== 'object') return;
            for (const k of Object.keys(node as Record<string, unknown>)) {
              if (KEYS.has(k)) unsupported.push(k);
              visit((node as Record<string, unknown>)[k]);
            }
          };
          visit(input);
          return Array.from(new Set(unsupported)).sort();
        };
        const unsupported = scanUnsupported(input);
        if (unsupported.length > 0) {
          process.stderr.write(
            `[foundrydata] compat=lax unsupported: ${JSON.stringify(unsupported)}\n`
          );
        }
      }

      const schemaForGen = input;
      const count = resolveRowCount({
        rows: options.rows,
        count: options.count,
        n: options.n,
      });
      const seed = Number(options.seed ?? 424242);
      const repairAttempts = Number(options.repairAttempts ?? 1);
      const outFormat: OutputFormat = resolveOutputFormat(options.out);
      const preferExamples = options.preferExamples === true;

      // Parse CLI options into PlanOptions
      const command = this;
      const cliPlanOptions = { ...options } as Parameters<
        typeof parsePlanOptions
      >[0];
      if (command.getOptionValueSource('rewriteConditionals') === 'default') {
        delete cliPlanOptions.rewriteConditionals;
      }
      const planOptions = parsePlanOptions(cliPlanOptions);
      const resolvedOptions = resolveOptions(planOptions);

      // Print effective configuration if requested
      if (options.debugPasses) {
        process.stderr.write(
          `[foundrydata] effective config: ${JSON.stringify(resolvedOptions, null, 2)}\n`
        );
      }

      const stream = Generate(count, seed, schemaForGen as object, {
        mode: compat,
        metricsEnabled: options.metrics !== false,
        planOptions,
        preferExamples,
        repairAttempts,
        validateFormats: true,
      });
      const pipelineResult = await stream.result;

      if (options.debugPasses) {
        printComposeDebug(pipelineResult);
      }

      handlePipelineOutput(
        pipelineResult,
        options.printMetrics === true,
        outFormat
      );
    } catch (err: unknown) {
      await handleCliError(err);
    }
  });

program
  // openapi CLI wiring (current snapshot):
  // - Uses Generate(...) from @foundrydata/core with mode/seed/count/out, metrics toggle,
  //   repairAttempts, and preferExamples, reusing the same helpers as `generate`.
  // - Uses selectResponseSchemaAndExample with --operation-id or --path/--method plus
  //   --status/--content-type to select the response schema (and example when present).
  // - Missing before this task: dedicated CLI tests exercising schema selection, NDJSON
  //   output, and AJV validation via the public Validate API.
  .command('openapi')
  .description('Generate fixtures from an OpenAPI document')
  .option('-s, --spec <file>', 'OpenAPI document file path')
  .option('--operation-id <id>', 'OpenAPI operationId to target')
  .option('--path <path>', 'Fallback path when operationId is not provided')
  .option(
    '--method <method>',
    'HTTP method (e.g., GET, post). Used with --path when operationId is absent.'
  )
  .option('-c, --count <number>', 'Number of items to generate')
  .option('-r, --rows <number>', 'Alias for --count')
  .option('-n, --n <number>', 'Alias for --count')
  .option('--seed <number>', 'Deterministic seed', '424242')
  .option(
    '--repair-attempts <number>',
    'Per-item retry attempts on validation failure',
    '1'
  )
  .option('--print-metrics', 'Print pipeline metrics as JSON to stderr', false)
  .option('--compat <mode>', 'Compatibility mode: strict|lax', 'strict')
  .option('--mode <mode>', 'Execution mode: strict|lax')
  .option(
    '--rewrite-conditionals <mode>',
    'Conditional rewriting: never|safe|aggressive',
    'never'
  )
  .option('--debug-freeze', 'Enable debug freeze for development')
  .option('--skip-trials', 'Skip branch trials, use score-only selection')
  .option('--trials-per-branch <number>', 'Number of trials per branch', (v) =>
    parseInt(v, 10)
  )
  .option(
    '--max-branches-to-try <number>',
    'Maximum branches in Top-K selection',
    (v) => parseInt(v, 10)
  )
  .option(
    '--skip-trials-if-branches-gt <number>',
    'Skip trials when branch count exceeds this',
    (v) => parseInt(v, 10)
  )
  .option(
    '--external-ref-strict <mode>',
    'External $ref handling: error|warn|ignore',
    'error'
  )
  .option(
    '--dynamic-ref-strict <mode>',
    'Dynamic $ref handling: warn|note',
    'note'
  )
  .option(
    '--encoding-bigint-json <mode>',
    'BigInt JSON encoding: string|number|error',
    'string'
  )
  .option('--no-metrics', 'Disable metrics collection')
  .option(
    '--resolve <strategies>',
    'Resolver strategies: local[,remote][,schemastore]',
    'local'
  )
  .option('--cache-dir <path>', 'Resolver cache directory (supports ~)')
  .option(
    '--fail-on-unresolved <bool>',
    'Set false to enable Lax planning stubs (maps to resolver.stubUnresolved=emptySchema)',
    (v) => String(v)
  )
  .option('--out <format>', 'Output format: json|ndjson', 'json')
  .option(
    '--prefer-examples',
    'Prefer OpenAPI examples over generated data when available'
  )
  .option(
    '--status <code>',
    'HTTP status code to select from responses (e.g., 200)'
  )
  .option(
    '--content-type <type>',
    'Content type to select from response content (e.g., application/json)'
  )
  .option('--debug-passes', 'Print effective configuration to stderr')
  .action(async function (this: Command, options) {
    try {
      const specPath = options.spec as string | undefined;
      if (!specPath) throw new Error('Missing --spec <file>');
      const abs = path.resolve(process.cwd(), specPath);
      if (!fs.existsSync(abs)) throw new Error(`Spec file not found: ${abs}`);
      const raw = fs.readFileSync(abs, 'utf8');
      const document = JSON.parse(raw);

      const compat = resolveCompatMode({
        mode: options.mode,
        compat: options.compat,
      });
      const outFormat: OutputFormat = resolveOutputFormat(options.out);
      const preferExamples = options.preferExamples === true;
      const count = resolveRowCount({
        rows: options.rows,
        count: options.count,
        n: options.n,
      });
      const seed = Number(options.seed ?? 424242);
      const repairAttempts = Number(options.repairAttempts ?? 1);

      const driverOptions: OpenApiDriverOptions = {
        operationId: options.operationId,
        path: options.path,
        method: options.method,
        status: options.status,
        contentType: options.contentType,
        preferExamples,
      };

      const selection = selectResponseSchemaAndExample(document, driverOptions);
      const baseSchema = selection.schema as unknown;

      // Attach OpenAPI components to the selected schema so that local
      // references like "#/components/schemas/User" remain resolvable when
      // the schema is compiled by AJV in the pipeline.
      let schemaForGen: unknown = baseSchema;
      if (
        baseSchema &&
        typeof baseSchema === 'object' &&
        !Array.isArray(baseSchema)
      ) {
        const schemaObj = baseSchema as Record<string, unknown>;
        const components = (document as Record<string, unknown>).components;
        if (
          components &&
          typeof components === 'object' &&
          !Array.isArray(components) &&
          !Object.prototype.hasOwnProperty.call(schemaObj, 'components')
        ) {
          schemaForGen = {
            ...schemaObj,
            components: components as Record<string, unknown>,
          };
        }
      }

      // When preferExamples is enabled and the driver surfaced an example that
      // is not already schema-level, attach it as schema.example so that the
      // generator's preferExamples logic can reuse it while preserving AJV
      // validation semantics (example is an annotation keyword).
      if (
        preferExamples &&
        selection.example !== undefined &&
        schemaForGen &&
        typeof schemaForGen === 'object' &&
        !Array.isArray(schemaForGen)
      ) {
        const schemaObj = schemaForGen as Record<string, unknown>;
        if (!Object.prototype.hasOwnProperty.call(schemaObj, 'example')) {
          schemaForGen = {
            ...schemaObj,
            example: selection.example,
          };
        }
      }

      const command = this;
      const cliPlanOptions = { ...options } as Parameters<
        typeof parsePlanOptions
      >[0];
      if (command.getOptionValueSource('rewriteConditionals') === 'default') {
        delete cliPlanOptions.rewriteConditionals;
      }
      const planOptions = parsePlanOptions(cliPlanOptions);
      const resolvedOptions = resolveOptions(planOptions);

      if (options.debugPasses) {
        process.stderr.write(
          `[foundrydata] effective config: ${JSON.stringify(resolvedOptions, null, 2)}\n`
        );
      }

      const stream = Generate(count, seed, schemaForGen as object, {
        mode: compat,
        metricsEnabled: options.metrics !== false,
        planOptions,
        preferExamples,
        repairAttempts,
        validateFormats: true,
      });
      const pipelineResult = await stream.result;

      if (options.debugPasses) {
        printComposeDebug(pipelineResult);
      }

      handlePipelineOutput(
        pipelineResult,
        options.printMetrics === true,
        outFormat
      );
    } catch (err: unknown) {
      await handleCliError(err);
    }
  });

function handlePipelineOutput(
  result: PipelineResult,
  printMetrics: boolean,
  outFormat: OutputFormat
): void {
  if (result.status !== 'completed') {
    // If validation-time diagnostics were produced (e.g., AJV_FLAGS_MISMATCH),
    // surface them before throwing to aid troubleshooting, per SPEC diagnostics exposure.
    const vdiags = result.artifacts.validationDiagnostics;
    if (Array.isArray(vdiags) && vdiags.length > 0) {
      process.stderr.write(
        `[foundrydata] diagnostics(validate): ${JSON.stringify(vdiags)}\n`
      );
    }
    const stageError = result.errors[0];
    if (stageError) throw stageError;
    throw new PipelineStageError('generate', 'Generation pipeline failed');
  }

  const generatedStage = result.stages.generate.output;
  const repairedItems = result.artifacts.repaired;
  const items = Array.isArray(repairedItems)
    ? repairedItems
    : (generatedStage?.items ?? []);

  if (outFormat === 'ndjson') {
    const lines = items.map((item) => JSON.stringify(item ?? null));
    if (lines.length > 0) {
      process.stdout.write(lines.join('\n') + '\n');
    }
  } else {
    process.stdout.write(JSON.stringify(items, null, 2) + '\n');
  }

  if (printMetrics) {
    process.stderr.write(
      `[foundrydata] metrics: ${JSON.stringify(result.metrics)}\n`
    );
  }
}

async function handleCliError(err: unknown): Promise<never> {
  const env = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
  const presenter = new ErrorPresenter(env, { colors: true });

  let error: FoundryError;
  if (isFoundryError(err)) {
    error = err;
  } else {
    const message = err instanceof Error ? err.message : String(err);
    error = new (class extends FoundryError {})({
      message: message || 'Unexpected error',
      errorCode: ErrorCode.INTERNAL_ERROR,
    });
  }

  const view = presenter.formatForCLI(error);
  console.error(renderCLIView(view));

  process.exit(error.getExitCode());
}

export async function main(argv: string[] = process.argv): Promise<void> {
  await program.parseAsync(argv).catch(handleCliError);
}

export { program };

const entryFile =
  typeof process.argv[1] === 'string' ? fs.realpathSync(process.argv[1]) : '';
const moduleFile = fileURLToPath(import.meta.url);
const isDirectExecution = entryFile === moduleFile;

if (isDirectExecution) {
  await main();
}
