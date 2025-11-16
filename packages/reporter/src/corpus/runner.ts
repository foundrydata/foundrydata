import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  runCorpusHarnessFromDir,
  type CorpusRunReport,
} from '@foundrydata/core';

export interface CorpusRunOptions {
  corpusDir: string;
  mode: 'strict' | 'lax';
  seed: number;
  instancesPerSchema: number;
  outFile: string;
}

export async function runCorpus(
  options: CorpusRunOptions
): Promise<CorpusRunReport> {
  const report = await runCorpusHarnessFromDir({
    corpusDir: options.corpusDir,
    mode: options.mode,
    seed: options.seed,
    instancesPerSchema: options.instancesPerSchema,
    validateFormats: false,
  });

  const outPath = path.resolve(options.outFile);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}
