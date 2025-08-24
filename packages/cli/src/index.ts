#!/usr/bin/env node

import { Command } from 'commander';

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
  .action((options) => {
    console.log('Generating data with options:', options);
    // TODO: Implement generation logic
  });

program.parse();
