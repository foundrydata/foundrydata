#!/usr/bin/env node
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import {
  ErrorPresenter,
  isFoundryError,
  FoundryError,
  ErrorCode,
  resolveOptions,
  executePipeline,
  PipelineStageError,
  ReferenceResolver,
  type PipelineResult,
} from '@foundrydata/core';
import { renderCLIView } from './render.js';
import { parsePlanOptions } from './flags.js';

const program = new Command();

program
  .name('foundrydata')
  .description('Generate test data from JSON Schema')
  .version('0.1.0');

program
  .command('generate')
  .description('Generate test data from schema')
  .option('-s, --schema <file>', 'JSON Schema file path')
  .option('-c, --count <number>', 'Number of items to generate', '1')
  .option('-r, --rows <number>', 'Alias for --count')
  .option('--seed <number>', 'Deterministic seed', '424242')
  .option('--locale <string>', 'Locale (e.g., en, fr)', 'en')
  .option(
    '--repair-attempts <number>',
    'Per-item retry attempts on validation failure',
    '1'
  )
  .option(
    '--resolve-externals',
    'Resolve external $ref before generation',
    false
  )
  .option('--print-metrics', 'Print pipeline metrics as JSON to stderr', false)
  .option('--compat <mode>', 'Compatibility mode: strict|lax', 'strict')
  .option(
    '--rewrite-conditionals <mode>',
    'Conditional rewriting: never|safe|aggressive',
    'safe'
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
  .option('--debug-passes', 'Print effective configuration to stderr')
  .action(async (options) => {
    try {
      const schemaPath = options.schema as string | undefined;
      if (!schemaPath) throw new Error('Missing --schema <file>');
      const abs = path.resolve(process.cwd(), schemaPath);
      if (!fs.existsSync(abs)) throw new Error(`Schema file not found: ${abs}`);
      const raw = fs.readFileSync(abs, 'utf8');
      const input = JSON.parse(raw);

      // Determine compatibility mode early (used by pre-scan and generation)
      const compat: 'strict' | 'lax' =
        String(options.compat ?? 'strict') === 'lax' ? 'lax' : 'strict';

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

      let schemaForGen = input;
      if (options.resolveExternals) {
        const resolver = new ReferenceResolver();
        resolver.addSchema(input, input.$id || abs);
        const resolved = await resolver.resolve(input);
        if (resolved.isErr()) throw resolved.error;
        schemaForGen = resolved.value as object;
      }

      const count = Number(options.rows ?? options.count ?? 1);
      const seed = Number(options.seed ?? 424242);
      const repairAttempts = Number(options.repairAttempts ?? 1);

      // Parse CLI options into PlanOptions
      const planOptions = parsePlanOptions(options);
      const resolvedOptions = resolveOptions(planOptions);

      // Print effective configuration if requested
      if (options.debugPasses) {
        process.stderr.write(
          `[foundrydata] effective config: ${JSON.stringify(resolvedOptions, null, 2)}\n`
        );
      }

      const pipelineResult = await executePipeline(schemaForGen as object, {
        mode: compat,
        metrics: { enabled: options.metrics !== false },
        compose: { planOptions },
        generate: {
          count,
          seed,
          planOptions,
        },
        repair: {
          attempts: repairAttempts,
        },
        validate: {
          validateFormats: true,
        },
      });

      handlePipelineOutput(pipelineResult, options.printMetrics === true);
    } catch (err: unknown) {
      await handleCliError(err);
    }
  });

function handlePipelineOutput(
  result: PipelineResult,
  printMetrics: boolean
): void {
  if (result.status !== 'completed') {
    const stageError = result.errors[0];
    if (stageError) throw stageError;
    throw new PipelineStageError('generate', 'Generation pipeline failed');
  }

  const generatedStage = result.stages.generate.output;
  const repairedItems = result.artifacts.repaired;
  const items = Array.isArray(repairedItems)
    ? repairedItems
    : (generatedStage?.items ?? []);

  process.stdout.write(JSON.stringify(items, null, 2) + '\n');

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

await program.parseAsync().catch(handleCliError);
