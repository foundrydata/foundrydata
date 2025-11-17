#!/usr/bin/env node
/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { Command } from 'commander';

import { Report } from './model/report.js';
import { runEngineOnSchema } from './engine/runner.js';
import { renderMarkdownReport } from './render/markdown.js';
import { renderHtmlReport } from './render/html.js';
import { runBench } from './bench/runner.js';
import { runCorpus } from './corpus/runner.js';

const SUPPORTED_FORMATS = ['json', 'markdown', 'html'] as const;
type OutputFormat = (typeof SUPPORTED_FORMATS)[number];

export interface RunCommandOptions {
  schemaPath: string;
  outDir?: string;
  formats: OutputFormat[];
  seed?: number;
  maxInstances?: number;
  stdout?: boolean;
}

function parseFormats(flagValue: string | undefined): OutputFormat[] {
  if (!flagValue) {
    return ['json'];
  }
  const formats = flagValue
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!formats.length) {
    throw new Error('At least one format must be provided.');
  }
  const invalid = formats.filter(
    (format) => !SUPPORTED_FORMATS.includes(format as OutputFormat)
  );
  if (invalid.length) {
    throw new Error(
      `Unsupported format(s): ${invalid.join(', ')}. Expected one of json, markdown, html.`
    );
  }
  return Array.from(new Set(formats)) as OutputFormat[];
}

function formatContent(report: Report, format: OutputFormat): string {
  if (format === 'json') {
    return `${JSON.stringify(report, null, 2)}\n`;
  }
  if (format === 'markdown') {
    return `${renderMarkdownReport(report)}\n`;
  }
  return renderHtmlReport(report);
}

function buildFileName(baseName: string, format: OutputFormat): string {
  const suffix =
    format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'html';
  return `${baseName}.report.${suffix}`;
}

export async function runReporterCommand(
  options: RunCommandOptions
): Promise<string[]> {
  const schemaAbsolute = path.resolve(options.schemaPath);
  const schemaRaw = await readFile(schemaAbsolute, 'utf8');
  let schema: unknown;
  try {
    schema = JSON.parse(schemaRaw);
  } catch (error) {
    throw new Error(`Invalid JSON schema file: ${(error as Error).message}`);
  }

  const schemaRelative =
    path.relative(process.cwd(), schemaAbsolute) ||
    path.basename(schemaAbsolute);

  const report = await runEngineOnSchema({
    schema,
    schemaId: options.schemaPath,
    schemaPath: schemaRelative.split(path.sep).join('/'),
    planOptions: undefined,
    maxInstances: options.maxInstances,
    seed: options.seed,
  });

  const baseDir = options.outDir
    ? path.resolve(options.outDir)
    : path.dirname(schemaAbsolute);
  const baseName = path.parse(schemaAbsolute).name;
  const outputs: string[] = [];

  if (options.stdout) {
    if (options.formats.length !== 1) {
      throw new Error('--stdout requires exactly one format.');
    }
    const singleFormat = options.formats[0]!;
    outputs.push(formatContent(report, singleFormat));
    return outputs;
  }

  await mkdir(baseDir, { recursive: true });
  const writePromises = options.formats.map(async (format) => {
    const content = formatContent(report, format);
    const targetPath = path.join(baseDir, buildFileName(baseName, format));
    await writeFile(targetPath, content, 'utf8');
    return targetPath;
  });
  return Promise.all(writePromises);
}

function isCommanderHelpDisplayed(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'commander.helpDisplayed'
  );
}

function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description(
      'Execute Normalize → Compose → Generate → Repair → Validate and render reports.'
    )
    .requiredOption('--schema <path>', 'Path to the JSON Schema file')
    .option(
      '--out-dir <dir>',
      'Directory where reports will be written (defaults to schema directory)'
    )
    .option(
      '--format <list>',
      'Comma separated list of formats (json,markdown,html). Default: json'
    )
    .option('--seed <number>', 'Seed forwarded to the engine', (value) =>
      Number.parseInt(value, 10)
    )
    .option(
      '--max-instances <number>',
      'Cap the number of instance results included in the report',
      (value) => Number.parseInt(value, 10)
    )
    .option(
      '--stdout',
      'Write the selected format to stdout instead of files',
      false
    )
    .action(async (cmdOptions) => {
      const formats = parseFormats(cmdOptions.format);
      const results = await runReporterCommand({
        schemaPath: cmdOptions.schema,
        outDir: cmdOptions.outDir,
        formats,
        seed: Number.isFinite(cmdOptions.seed) ? cmdOptions.seed : undefined,
        maxInstances: Number.isFinite(cmdOptions.maxInstances)
          ? cmdOptions.maxInstances
          : undefined,
        stdout: cmdOptions.stdout,
      });

      if (cmdOptions.stdout) {
        const content = results[0] ?? '';
        process.stdout.write(content);
        return;
      }

      results.forEach((filePath: string) => {
        process.stdout.write(`Wrote ${filePath}\n`);
      });
    });
}

function createProgram(): Command {
  const program = new Command();
  program
    .name('json-schema-reporter')
    .description('Reporting layer CLI for JSON Schema pipelines');

  registerRunCommand(program);
  registerBenchCommand(program);
  registerCorpusCommand(program);
  return program;
}

function registerBenchCommand(program: Command): void {
  program
    .command('bench')
    .description(
      'Run multiple schemas defined in a bench config file and aggregate results.'
    )
    .requiredOption('--config <path>', 'Path to bench config JSON file')
    .option(
      '--out-dir <dir>',
      'Directory where bench artifacts will be written',
      'bench-reports'
    )
    .option(
      '--format <list>',
      'Comma separated list of formats (json,markdown,html). Default: json'
    )
    .option('--seed <number>', 'Default seed applied to all schemas', (value) =>
      Number.parseInt(value, 10)
    )
    .action(async (cmdOptions) => {
      const formats = parseFormats(cmdOptions.format);
      const summary = await runBench({
        configPath: cmdOptions.config,
        outDir: cmdOptions.outDir,
        format: formats,
        seed: Number.isFinite(cmdOptions.seed) ? cmdOptions.seed : undefined,
      });
      process.stdout.write(
        `Bench run completed: ${summary.schemas.length} schemas, ${summary.totals.instances} instances.\n`
      );
    });
}

function registerCorpusCommand(program: Command): void {
  program
    .command('corpus')
    .description(
      'Run the corpus harness over a directory of schemas and aggregate results.'
    )
    .requiredOption('--corpus <dir>', 'Path to the corpus directory')
    .option('--mode <mode>', 'Pipeline mode to use (strict or lax)', 'strict')
    .option('--seed <number>', 'Seed applied to all schemas', (value) =>
      Number.parseInt(value, 10)
    )
    .option('--count <number>', 'Instances per schema', (value) =>
      Number.parseInt(value, 10)
    )
    .option(
      '--out <path>',
      'Output file for the corpus summary JSON',
      'corpus-summary.json'
    )
    .action(async (cmdOptions) => {
      const mode =
        cmdOptions.mode === 'lax' ? 'lax' : ('strict' as 'strict' | 'lax');
      const seed =
        Number.isFinite(cmdOptions.seed) && typeof cmdOptions.seed === 'number'
          ? cmdOptions.seed
          : 37;
      const count =
        Number.isFinite(cmdOptions.count) &&
        typeof cmdOptions.count === 'number' &&
        cmdOptions.count > 0
          ? cmdOptions.count
          : 3;

      const report = await runCorpus({
        corpusDir: cmdOptions.corpus,
        mode,
        seed,
        instancesPerSchema: count,
        outFile: cmdOptions.out,
      });

      const summary = report.summary;
      process.stdout.write(
        [
          'Corpus run completed:',
          `schemas=${summary.totalSchemas}`,
          `success=${summary.schemasWithSuccess}`,
          `unsat=${summary.unsatCount}`,
          `failFast=${summary.failFastCount}`,
          `regexCapped=${summary.caps.regexCapped}`,
          `nameAutomatonCapped=${summary.caps.nameAutomatonCapped}`,
          `smtTimeouts=${summary.caps.smtTimeouts}`,
          `mode=${report.mode}`,
          `seed=${report.seed}`,
          `instancesPerSchema=${report.instancesPerSchema}`,
        ].join(' ')
      );
      process.stdout.write(`\nCorpus summary written to ${cmdOptions.out}\n`);
    });
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = createProgram();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (isCommanderHelpDisplayed(error)) {
      return;
    }
    throw error;
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entryUrl && import.meta.url === entryUrl) {
  runCli(process.argv).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

/*
Exemple:

json-schema-reporter run \
  --schema ./examples/schema.json \
  --out-dir ./reports \
  --format json,markdown,html \
  --seed 42
*/
