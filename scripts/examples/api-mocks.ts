/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  Generate,
  Validate,
  selectResponseSchemaAndExample,
  type OpenApiDriverOptions,
} from '@foundrydata/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadJson(relativePath: string): Promise<unknown> {
  const abs = path.resolve(__dirname, relativePath);
  const raw = await fs.readFile(abs, 'utf8');
  return JSON.parse(raw) as unknown;
}

export interface ApiMocksExampleResult {
  items: unknown[];
  meta: {
    count: number;
    seed: number;
  };
}

export async function runApiMocksExample(): Promise<ApiMocksExampleResult> {
  const document = (await loadJson(
    '../../docs/examples/users-api.json'
  )) as Record<string, unknown>;

  const driverOptions: OpenApiDriverOptions = {
    operationId: 'getUsers',
    preferExamples: true,
  };

  const selection = selectResponseSchemaAndExample(document, driverOptions);

  const baseSchema = selection.schema as Record<string, unknown>;
  const schemaWithComponents: Record<string, unknown> = {
    ...baseSchema,
  };

  const components = document.components;
  if (components && typeof components === 'object') {
    schemaWithComponents.components = components as Record<string, unknown>;
  }

  if (
    selection.example !== undefined &&
    !Object.prototype.hasOwnProperty.call(schemaWithComponents, 'example')
  ) {
    schemaWithComponents.example = selection.example;
  }

  const count = 5;
  const seed = 42;

  const stream = Generate(count, seed, schemaWithComponents as object, {
    mode: 'strict',
    preferExamples: true,
    validateFormats: true,
  });

  const pipelineResult = await stream.result;
  if (pipelineResult.status !== 'completed') {
    const stageError = pipelineResult.errors[0];
    if (stageError) throw stageError;
    throw new Error('API mocks pipeline did not complete');
  }

  const generatedStage = pipelineResult.stages.generate.output;
  const repairedItems = pipelineResult.artifacts.repaired;
  const items = Array.isArray(repairedItems)
    ? (repairedItems as unknown[])
    : (generatedStage?.items ?? []);

  const validItems: unknown[] = [];
  for (const item of items) {
    const res = Validate(item, schemaWithComponents);
    if (!res.valid) {
      throw new Error(
        `Generated response did not validate: ${JSON.stringify(res.ajvErrors)}`
      );
    }
    validItems.push(item);
  }

  // eslint-disable-next-line no-console
  console.log(
    `[api-mocks] generated ${validItems.length} items for ${selection.meta.method.toUpperCase()} ${selection.meta.path} (seed=${seed})`
  );
  if (validItems[0]) {
    // eslint-disable-next-line no-console
    console.log(
      '[api-mocks] sample item:',
      JSON.stringify(validItems[0], null, 2)
    );
  }

  return {
    items: validItems,
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
  runApiMocksExample().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
