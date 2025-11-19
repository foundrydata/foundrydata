import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_CODES } from '../../diag/codes.js';
import {
  runCorpusHarness,
  type CorpusSchemaConfig,
} from '../corpus-harness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadRealWorldSchema(
  relativeFile: string
): Promise<CorpusSchemaConfig> {
  const fullPath = resolve(
    __dirname,
    '../../../../../profiles/real-world',
    relativeFile
  );
  const raw = await readFile(fullPath, 'utf8');
  const schema = JSON.parse(raw) as unknown;
  const id = relativeFile.replace(/\.json$/i, '');
  return {
    id,
    schema,
    schemaPath: relativeFile,
  };
}

describe('Extension R2 — Dialect & meta-schema auto-hydration (integration)', () => {
  it('R2-META-2019-OK: docker compose spec validates without missing 2019-09 meta-schema', async () => {
    const dockerCompose = await loadRealWorldSchema('docker_compose_spec.json');

    const report = await runCorpusHarness({
      schemas: [dockerCompose],
      mode: 'strict',
      seed: 37,
      instancesPerSchema: 1,
      validateFormats: false,
    });

    const entry = report.results[0];
    expect(entry).toBeDefined();
    if (!entry) {
      throw new Error('Expected docker_compose_spec corpus entry');
    }

    const codes = entry.diagnostics.map((diag) => diag.code);
    expect(codes).not.toContain(DIAGNOSTIC_CODES.VALIDATION_COMPILE_ERROR);
    expect(codes).not.toContain(DIAGNOSTIC_CODES.SCHEMA_INTERNAL_REF_MISSING);
  });

  it('R2-ASYNCAPI-STRICT-UNCHANGED: AsyncAPI 3.0 still fails strictly on unresolved external $ref without meta-schema errors', async () => {
    const asyncapi = await loadRealWorldSchema('asyncapi-3.0.schema.json');

    const report = await runCorpusHarness({
      schemas: [asyncapi],
      mode: 'strict',
      seed: 37,
      instancesPerSchema: 1,
      validateFormats: false,
    });

    const entry = report.results[0];
    expect(entry).toBeDefined();
    if (!entry) {
      throw new Error('Expected asyncapi-3.0.schema corpus entry');
    }

    const codes = entry.diagnostics.map((diag) => diag.code);
    expect(codes).toContain(DIAGNOSTIC_CODES.RESOLVER_STRATEGIES_APPLIED);
    expect(codes).not.toContain(DIAGNOSTIC_CODES.VALIDATION_COMPILE_ERROR);
  });

  it('R2-EPCIS-INTERNAL-REF: EPCIS 2.0 bundled schema fail-fast is due to a genuine internal $ref, not meta/dialect issues', async () => {
    const epcis = await loadRealWorldSchema(
      'dense/epcis-2.0.bundled.schema.json'
    );

    const report = await runCorpusHarness({
      schemas: [epcis],
      mode: 'strict',
      seed: 37,
      instancesPerSchema: 1,
      validateFormats: false,
    });

    const entry = report.results[0];
    expect(entry).toBeDefined();
    if (!entry) {
      throw new Error('Expected dense/epcis-2.0.bundled.schema corpus entry');
    }

    const codes = entry.diagnostics.map((diag) => diag.code);

    expect(entry.failFast).toBe(true);
    expect(entry.failFastStage).toBe('validate');
    expect(entry.failFastCode).toBe(
      DIAGNOSTIC_CODES.SCHEMA_INTERNAL_REF_MISSING
    );

    expect(codes).toContain(DIAGNOSTIC_CODES.SCHEMA_INTERNAL_REF_MISSING);
    expect(codes).not.toContain(DIAGNOSTIC_CODES.VALIDATION_COMPILE_ERROR);
    expect(codes).not.toContain(DIAGNOSTIC_CODES.AJV_FLAGS_MISMATCH);

    const internalRefDiag = entry.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.SCHEMA_INTERNAL_REF_MISSING
    );
    expect(internalRefDiag).toBeDefined();
    const ref = (internalRefDiag?.details as { ref?: unknown } | undefined)
      ?.ref;
    expect(typeof ref).toBe('string');
    expect(
      String(ref)
        .split('#')[1]
        ?.startsWith(
          '/allOf/3/then/allOf/0/allOf/1/properties/childQuantityList/items/properties/quantity'
        )
    ).toBe(true);

    // Derived classification should make it explicit that this is a
    // schema-level internal $ref bug, not an AJV or meta-schema issue.
    expect(entry.failureCategory).toBe('schema-bug');
    expect(entry.failureKind).toBe('schema-internal-ref');
    expect(typeof entry.failureHint).toBe('string');
    expect(entry.failureHint).toContain('Internal $ref path not found');
  });
});
