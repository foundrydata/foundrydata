#!/usr/bin/env node

import { Command } from 'commander';
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
  .action(async (options) => {
    try {
      console.log('Generating data with options:', options);
      // TODO: Implement generation logic
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
