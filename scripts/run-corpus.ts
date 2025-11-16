import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  runCorpusHarnessFromDir,
  type CorpusMode,
} from '../packages/core/src/pipeline/corpus-harness.js';

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

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === '--corpus' && argv[index + 1]) {
      corpusDir = argv[index + 1]!;
      index += 1;
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
    } else if (arg === '--seed' && argv[index + 1]) {
      const value = Number.parseInt(argv[index + 1]!, 10);
      if (!Number.isNaN(value)) {
        seed = value;
      }
      index += 1;
    } else if (arg === '--count' && argv[index + 1]) {
      const value = Number.parseInt(argv[index + 1]!, 10);
      if (!Number.isNaN(value) && value > 0) {
        count = value;
      }
      index += 1;
    } else if (arg === '--out' && argv[index + 1]) {
      outFile = argv[index + 1]!;
      index += 1;
    }
  }

  return { corpusDir, mode, seed, count, outFile };
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const corpusDir = path.resolve(cli.corpusDir);

  writeLine(
    `FoundryData corpus harness — corpusDir: ${corpusDir} · mode=${cli.mode} · seed=${cli.seed} · count=${cli.count}`
  );

  const report = await runCorpusHarnessFromDir({
    corpusDir,
    mode: cli.mode,
    seed: cli.seed,
    instancesPerSchema: cli.count,
    validateFormats: false,
  });

  for (const entry of report.results) {
    const caps = entry.caps ?? {};
    writeLine(
      `- [${entry.id}] tried=${entry.instancesTried} valid=${entry.instancesValid} unsat=${entry.unsat ? 'yes' : 'no'} failFast=${entry.failFast ? 'yes' : 'no'} regexCapped=${caps.regexCapped ?? 0} nameAutomatonCapped=${caps.nameAutomatonCapped ?? 0} smtTimeouts=${caps.smtTimeouts ?? 0}`
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
