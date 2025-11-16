#!/usr/bin/env tsx

import { bundle } from '@apidevtools/json-schema-ref-parser';
import { writeFileSync } from 'node:fs';

async function main(): Promise<void> {
  const [, , input, output] = process.argv;
  if (!input || !output) {
    console.error('Usage: tsx scripts/bundle-schema.ts <input> <output>');
    process.exitCode = 1;
    return;
  }

  const schema = await bundle(input);
  writeFileSync(output, JSON.stringify(schema, null, 2));
}

main().catch((error) => {
  console.error('[bundle-schema] failed:', error);
  process.exitCode = 1;
});
