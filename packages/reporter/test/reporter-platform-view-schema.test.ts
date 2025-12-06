import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SCHEMA_PATH = resolve(
  __dirname,
  '../src/schemas/reporter-platform-view-v1.schema.json'
);

const FIXTURE_PATH = resolve(
  __dirname,
  './fixtures/reporter-platform-view.sample.json'
);

describe('reporter-platform-view/v1 JSON Schema', () => {
  it('validates a representative reporter-platform-view fixture', () => {
    const rawSchema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
    const rawView = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);

    const validate = ajv.compile(rawSchema);
    const ok = validate(rawView);

    if (!ok) {
      console.error(validate.errors);
    }
    expect(ok).toBe(true);
  });

  it('rejects negative counters in repairUsageByMotif', () => {
    const rawSchema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
    const rawView = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    rawView.metrics.repairUsageByMotif[0].actions = -1;

    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);

    const validate = ajv.compile(rawSchema);
    const ok = validate(rawView);

    expect(ok).toBe(false);
  });
});
