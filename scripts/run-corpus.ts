/* eslint-disable max-lines-per-function */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  runCorpusHarnessFromDir,
  type CorpusMode,
} from '../packages/core/src/pipeline/corpus-harness.js';
import {
  mapResolverCliOptionsToPlanOptions,
  type ResolverCliOptions,
} from '../packages/core/src/resolver/cli-mapping.js';

const DEFAULT_CORPUS_DIR = 'profiles/real-world';
const DEFAULT_MODE: CorpusMode = 'strict';
const DEFAULT_SEED = 37;
const DEFAULT_INSTANCES_PER_SCHEMA = 3;
const DEFAULT_OUT_DIR = 'reports';
const DEFAULT_OUT_BASENAME = 'corpus-summary';

interface CliOptions {
  corpusDir: string;
  mode: CorpusMode;
  seed: number;
  count: number;
  outFile?: string;
  resolve?: string;
  cacheDir?: string;
  allowHosts: string[];
  resolverHydrateFinalAjv?: boolean;
  resolverStubUnresolved?: 'emptySchema';
}

function writeLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

/* eslint-disable complexity */
function parseArgs(argv: string[]): CliOptions {
  let corpusDir = DEFAULT_CORPUS_DIR;
  let mode: CorpusMode = DEFAULT_MODE;
  let seed = DEFAULT_SEED;
  let count = DEFAULT_INSTANCES_PER_SCHEMA;
  let outFile: string | undefined;
  let resolveStrategies: string | undefined;
  let cacheDir: string | undefined;
  const allowHosts: string[] = [];
  let resolverHydrateFinalAjv: boolean | undefined;
  let resolverStubUnresolved: 'emptySchema' | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === '--corpus' && argv[index + 1]) {
      corpusDir = argv[index + 1]!;
      index += 1;
    } else if (arg.startsWith('--corpus=')) {
      corpusDir = arg.slice('--corpus='.length);
    } else if (arg === '--mode' && argv[index + 1]) {
      const value = argv[index + 1]!;
      if (value === 'strict' || value === 'lax') {
        mode = value;
      } else {
        console.error(
          `[run-corpus] Unsupported mode "${value}", expected "strict" or "lax"; defaulting to ${mode}`
        );
      }
      index += 1;
    } else if (arg.startsWith('--mode=')) {
      const value = arg.slice('--mode='.length);
      if (value === 'strict' || value === 'lax') {
        mode = value;
      } else {
        console.error(
          `[run-corpus] Unsupported mode "${value}", expected "strict" or "lax"; defaulting to ${mode}`
        );
      }
    } else if (arg === '--seed' && argv[index + 1]) {
      const value = Number.parseInt(argv[index + 1]!, 10);
      if (!Number.isNaN(value)) {
        seed = value;
      }
      index += 1;
    } else if (arg.startsWith('--seed=')) {
      const value = Number.parseInt(arg.slice('--seed='.length), 10);
      if (!Number.isNaN(value)) {
        seed = value;
      }
    } else if (arg === '--count' && argv[index + 1]) {
      const value = Number.parseInt(argv[index + 1]!, 10);
      if (!Number.isNaN(value) && value > 0) {
        count = value;
      }
      index += 1;
    } else if (arg.startsWith('--count=')) {
      const value = Number.parseInt(arg.slice('--count='.length), 10);
      if (!Number.isNaN(value) && value > 0) {
        count = value;
      }
    } else if (arg === '--out' && argv[index + 1]) {
      outFile = argv[index + 1]!;
      index += 1;
    } else if (arg.startsWith('--out=')) {
      outFile = arg.slice('--out='.length);
    } else if (arg === '--resolve' && argv[index + 1]) {
      resolveStrategies = argv[index + 1]!;
      index += 1;
    } else if (arg.startsWith('--resolve=')) {
      resolveStrategies = arg.slice('--resolve='.length);
    } else if (arg === '--cache-dir' && argv[index + 1]) {
      cacheDir = argv[index + 1]!;
      index += 1;
    } else if (arg.startsWith('--cache-dir=')) {
      cacheDir = arg.slice('--cache-dir='.length);
    } else if (arg === '--allow-host' && argv[index + 1]) {
      allowHosts.push(argv[index + 1]!);
      index += 1;
    } else if (arg.startsWith('--allow-host=')) {
      allowHosts.push(arg.slice('--allow-host='.length));
    } else if (arg === '--resolver-hydrate-final-ajv' && argv[index + 1]) {
      const raw = argv[index + 1]!;
      resolverHydrateFinalAjv =
        raw === 'true' ? true : raw === 'false' ? false : undefined;
      index += 1;
    } else if (arg.startsWith('--resolver-hydrate-final-ajv=')) {
      const raw = arg.slice('--resolver-hydrate-final-ajv='.length);
      resolverHydrateFinalAjv =
        raw === 'true' ? true : raw === 'false' ? false : undefined;
    } else if (arg === '--resolver-stub-unresolved' && argv[index + 1]) {
      const raw = argv[index + 1]!;
      if (raw === 'emptySchema') {
        resolverStubUnresolved = 'emptySchema';
      }
      index += 1;
    } else if (arg.startsWith('--resolver-stub-unresolved=')) {
      const raw = arg.slice('--resolver-stub-unresolved='.length);
      if (raw === 'emptySchema') {
        resolverStubUnresolved = 'emptySchema';
      }
    }
  }

  return {
    corpusDir,
    mode,
    seed,
    count,
    outFile,
    resolve: resolveStrategies,
    cacheDir,
    allowHosts,
    resolverHydrateFinalAjv,
    resolverStubUnresolved,
  };
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const corpusDir = path.resolve(cli.corpusDir);

  writeLine(
    `FoundryData corpus harness — corpusDir: ${corpusDir} · mode=${cli.mode} · seed=${cli.seed} · count=${cli.count}`
  );

  const resolverCli: ResolverCliOptions = {
    resolve: cli.resolve,
    cacheDir: cli.cacheDir,
    allowHosts: cli.allowHosts,
    hydrateFinalAjv: cli.resolverHydrateFinalAjv,
    stubUnresolved: cli.mode === 'lax' ? cli.resolverStubUnresolved : undefined,
  };

  if (cli.resolverStubUnresolved && cli.mode !== 'lax') {
    console.error(
      '[run-corpus] --resolver-stub-unresolved is only supported in lax mode; ignoring for strict run'
    );
  }

  const planOptions = mapResolverCliOptionsToPlanOptions(resolverCli);

  const report = await runCorpusHarnessFromDir({
    corpusDir,
    mode: cli.mode,
    seed: cli.seed,
    instancesPerSchema: cli.count,
    validateFormats: false,
    planOptions,
  });

  for (const entry of report.results) {
    const caps = entry.caps ?? {};
    writeLine(
      `- [${entry.id}] tried=${entry.instancesTried} valid=${entry.instancesValid} unsat=${entry.unsat ? 'yes' : 'no'} failFast=${entry.failFast ? 'yes' : 'no'}${entry.failFast && entry.failFastStage ? ` (stage=${entry.failFastStage}` : ''}${
        entry.failFast && entry.failFastCode
          ? `${entry.failFastStage ? ' ' : ' ('}code=${entry.failFastCode})`
          : entry.failFast && entry.failFastStage
            ? ')'
            : ''
      } regexCapped=${caps.regexCapped ?? 0} nameAutomatonCapped=${caps.nameAutomatonCapped ?? 0} smtTimeouts=${caps.smtTimeouts ?? 0}`
    );
  }

  const defaultOutDir = path.resolve(DEFAULT_OUT_DIR);
  const defaultOutPath = path.join(
    defaultOutDir,
    `${DEFAULT_OUT_BASENAME}.${report.mode}.json`
  );
  const outPath = path.resolve(cli.outFile ?? defaultOutPath);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  writeLine(
    `Summary: schemas=${report.summary.totalSchemas} success=${report.summary.schemasWithSuccess} unsat=${report.summary.unsatCount} failFast=${report.summary.failFastCount} regexCapped=${report.summary.caps.regexCapped} nameAutomatonCapped=${report.summary.caps.nameAutomatonCapped} smtTimeouts=${report.summary.caps.smtTimeouts}`
  );
  writeLine(`Corpus report written to ${outPath}`);
}

const executedDirectly =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (executedDirectly) {
  main().catch((error) => {
    console.error('Corpus harness script failed:', error);
    process.exitCode = 1;
  });
}
