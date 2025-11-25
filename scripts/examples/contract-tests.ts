/* eslint-disable max-lines-per-function */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Generate, Validate } from '@foundrydata/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadJson(relativePath: string): Promise<unknown> {
  const abs = path.resolve(__dirname, relativePath);
  const raw = await fs.readFile(abs, 'utf8');
  return JSON.parse(raw) as unknown;
}

export interface ContractTestsExampleResult {
  items: unknown[];
  meta: {
    count: number;
    seed: number;
  };
}

export async function runContractTestsExample(): Promise<ContractTestsExampleResult> {
  const schema = await loadJson('../../examples/payment.json');

  const count = 10;
  const seed = 123;

  const stream = Generate(count, seed, schema as object, {
    mode: 'strict',
    validateFormats: true,
  });

  const pipelineResult = await stream.result;
  if (pipelineResult.status !== 'completed') {
    const stageError = pipelineResult.errors[0];
    if (stageError) throw stageError;
    throw new Error('Contract tests pipeline did not complete');
  }

  const generatedStage = pipelineResult.stages.generate.output;
  const repairedItems = pipelineResult.artifacts.repaired;
  const items = Array.isArray(repairedItems)
    ? (repairedItems as unknown[])
    : (generatedStage?.items ?? []);

  let validCount = 0;
  for (const item of items) {
    const res = Validate(item, schema);
    if (!res.valid) {
      throw new Error(
        `Generated payment did not validate: ${JSON.stringify(res.ajvErrors)}`
      );
    }
    validCount += 1;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[contract-tests] generated ${items.length} payments (valid=${validCount}, seed=${seed})`
  );
  if (items[0]) {
    // eslint-disable-next-line no-console
    console.log(
      '[contract-tests] sample item:',
      JSON.stringify(items[0], null, 2)
    );
  }

  return {
    items,
    meta: {
      count,
      seed,
    },
  };
}

const entryHref =
  typeof process.argv[1] === 'string'
    ? pathToFileURL(process.argv[1]).href
    : '';

if (import.meta.url === entryHref) {
  runContractTestsExample().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
