#!/usr/bin/env node
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines-per-function */

import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import * as Core from '@foundrydata/core';
import {
  ErrorPresenter,
  isFoundryError,
  FoundryError,
  ErrorCode,
} from '@foundrydata/core';
import { renderCLIView } from './render';

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
  .action(async (options) => {
    try {
      const schemaPath = options.schema as string | undefined;
      if (!schemaPath) throw new Error('Missing --schema <file>');
      const abs = path.resolve(process.cwd(), schemaPath);
      if (!fs.existsSync(abs)) throw new Error(`Schema file not found: ${abs}`);
      const raw = fs.readFileSync(abs, 'utf8');
      const input = JSON.parse(raw);

      const FoundryGenerator = (Core as any).FoundryGenerator as any;
      const ReferenceResolver = (Core as any).ReferenceResolver as any;

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
      const locale = String(options.locale ?? 'en');
      const repairAttempts = Number(options.repairAttempts ?? 1);

      const gen = new FoundryGenerator();
      const result = gen.run(schemaForGen as object, {
        count,
        seed,
        locale,
        repairAttempts,
        compat,
      });
      if (result.isErr()) throw result.error;

      // Print items as JSON array on stdout
      process.stdout.write(JSON.stringify(result.value.items, null, 2) + '\n');

      // Print a concise metrics summary on stderr (does not pollute stdout JSON)
      const m = result.value.metrics;
      const repaired = m.itemsRepaired ?? 0;
      const attemptsUsed = m.repairAttemptsUsed ?? 0;
      if (repaired > 0 || attemptsUsed > 0) {
        process.stderr.write(
          `[foundrydata] repairs: ${repaired} items (attempts used: ${attemptsUsed})\n`
        );
      }

      if (options.printMetrics) {
        // Emit structured metrics for tools/CI (stderr to keep stdout clean JSON for items)
        const metricsPayload = {
          durations: m.durations,
          itemsGenerated: m.itemsGenerated,
          formatsUsed: m.formatsUsed,
          validatorCacheHitRate: m.validatorCacheHitRate,
          compiledSchemas: m.compiledSchemas,
          memory: m.memory,
          itemsRepaired: m.itemsRepaired ?? 0,
          repairAttemptsUsed: m.repairAttemptsUsed ?? 0,
        };
        process.stderr.write(
          `[foundrydata] metrics: ${JSON.stringify(metricsPayload)}\n`
        );
      }
    } catch (err: unknown) {
      await handleCliError(err);
    }
  });

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
