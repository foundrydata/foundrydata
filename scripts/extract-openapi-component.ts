#!/usr/bin/env tsx

import { dereference } from '@apidevtools/json-schema-ref-parser';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

async function main(): Promise<void> {
  const [, , specPath, componentName, outputPath] = process.argv;
  if (!specPath || !componentName || !outputPath) {
    console.error(
      'Usage: tsx scripts/extract-openapi-component.ts <spec.json> <componentName> <output>'
    );
    process.exitCode = 1;
    return;
  }

  const absSpec = path.resolve(specPath);
  const spec = JSON.parse(readFileSync(absSpec, 'utf8'));
  const components = spec.components?.schemas;
  if (!components || !components[componentName]) {
    console.error(
      `[extract-openapi-component] component "${componentName}" not found in ${absSpec}`
    );
    process.exitCode = 1;
    return;
  }

  const root = {
    components: {
      schemas: components,
    },
    schema: {
      $ref: `#/components/schemas/${componentName}`,
    },
  };

  const deref = (await dereference(root, {
    dereference: { circular: 'ignore' },
  })) as typeof root;

  writeFileSync(outputPath, JSON.stringify(deref.schema, null, 2));
}

main().catch((error) => {
  console.error('[extract-openapi-component] failed:', error);
  process.exitCode = 1;
});
