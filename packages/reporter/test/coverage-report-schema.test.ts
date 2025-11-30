import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SCHEMA_PATH = resolve(
  __dirname,
  '../src/schemas/coverage-report-v1.schema.json'
);

const COVERAGE_FIXTURE_PATH = resolve(
  __dirname,
  './fixtures/coverage-report.v1.sample.json'
);

describe('coverage-report/v1 JSON Schema', () => {
  it('validates a representative coverage-report/v1 fixture', () => {
    const rawSchema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
    const rawReport = JSON.parse(readFileSync(COVERAGE_FIXTURE_PATH, 'utf8'));

    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);

    const validate = ajv.compile(rawSchema);
    const ok = validate(rawReport);

    if (!ok) {
      console.error(validate.errors);
    }
    expect(ok).toBe(true);
  });
});
