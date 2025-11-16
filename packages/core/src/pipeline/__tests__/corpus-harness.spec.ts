/* eslint-disable complexity */
import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_CODES } from '../../diag/codes.js';
import {
  externalRefSchema,
  patternCapsSchema,
} from '../__fixtures__/integration-schemas.js';
import {
  runCorpusHarness,
  type CorpusSchemaConfig,
} from '../corpus-harness.js';

describe('corpus harness', () => {
  it('classifies success, UNSAT, and external-ref behaviors per schema', async () => {
    const simpleSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'integer', minimum: 0 },
        name: { type: 'string', minLength: 1 },
      },
      required: ['id', 'name'],
    } as const;

    const unsatSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        allowed: { type: 'string' },
      },
      required: ['forbidden'],
      propertyNames: {
        enum: ['allowed'],
      },
    } as const;

    const schemas: CorpusSchemaConfig[] = [
      { id: 'simple', schema: simpleSchema },
      { id: 'unsat-propertyNames', schema: unsatSchema },
      { id: 'external-ref', schema: externalRefSchema },
    ];

    const strictReport = await runCorpusHarness({
      schemas,
      mode: 'strict',
      seed: 37,
      instancesPerSchema: 3,
      validateFormats: false,
    });

    const simple = strictReport.results.find((entry) => entry.id === 'simple');
    expect(simple).toBeDefined();
    expect(simple?.instancesTried).toBeGreaterThan(0);
    expect(simple?.instancesValid).toBeGreaterThan(0);
    expect(simple?.unsat).toBe(false);
    expect(simple?.failFast).toBe(false);

    const unsat = strictReport.results.find(
      (entry) => entry.id === 'unsat-propertyNames'
    );
    expect(unsat).toBeDefined();
    expect(unsat?.instancesValid).toBe(0);
    expect(unsat?.unsat).toBe(true);
    expect(unsat?.failFast).toBe(false);
    expect(
      unsat?.diagnostics.some(
        (diag) => diag.code === DIAGNOSTIC_CODES.UNSAT_REQUIRED_VS_PROPERTYNAMES
      )
    ).toBe(true);

    const externalStrict = strictReport.results.find(
      (entry) => entry.id === 'external-ref'
    );
    expect(externalStrict).toBeDefined();
    expect(externalStrict?.instancesValid).toBe(0);
    expect(externalStrict?.failFast || externalStrict?.unsat).toBe(true);
    expect(
      externalStrict?.diagnostics.some(
        (diag) => diag.code === DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED
      )
    ).toBe(true);

    const laxReport = await runCorpusHarness({
      schemas: [{ id: 'external-ref', schema: externalRefSchema }],
      mode: 'lax',
      seed: 37,
      instancesPerSchema: 3,
      validateFormats: false,
    });

    const externalLax = laxReport.results[0];
    expect(externalLax).toBeDefined();
    if (!externalLax) {
      throw new Error('Expected external-lax corpus result');
    }
    expect(
      externalLax.diagnostics.some(
        (diag) => diag.code === DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED
      )
    ).toBe(true);
    expect(externalLax.metrics?.validationsPerRow).toBe(0);
  });

  it('surfaces caps and metrics when regex complexity caps are triggered', async () => {
    const report = await runCorpusHarness({
      schemas: [{ id: 'pattern-caps', schema: patternCapsSchema }],
      mode: 'strict',
      seed: 17,
      instancesPerSchema: 1,
      validateFormats: false,
      planOptions: {
        patternWitness: {
          alphabet: 'fo',
          maxLength: 3,
          maxCandidates: 1,
        },
      },
    });

    const result = report.results[0];
    expect(result).toBeDefined();
    if (!result) {
      throw new Error('Expected pattern-caps corpus result');
    }
    expect(result.caps?.regexCapped ?? 0).toBeGreaterThan(0);
    expect(
      result.diagnostics.some(
        (diag) => diag.code === DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED
      )
    ).toBe(true);
    expect(result.metrics?.validationsPerRow).toBeGreaterThanOrEqual(0);
    expect(result.metrics?.repairPassesPerRow).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic for fixed seed, mode, and corpus', async () => {
    const simpleSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        tag: { type: 'string', const: 'alpha' },
        count: { type: 'integer', minimum: 0 },
      },
      required: ['tag', 'count'],
    } as const;

    const schemas: CorpusSchemaConfig[] = [
      { id: 'simple-deterministic', schema: simpleSchema },
      { id: 'external-deterministic', schema: externalRefSchema },
    ];

    const options = {
      schemas,
      mode: 'strict' as const,
      seed: 121,
      instancesPerSchema: 2,
      validateFormats: false,
    };

    const first = await runCorpusHarness(options);
    const second = await runCorpusHarness(options);

    const summarize = (
      report: typeof first
    ): Array<{
      id: string;
      instancesValid: number;
      unsat: boolean;
      failFast: boolean;
      diagnosticCodes: string[];
    }> =>
      report.results.map((entry) => ({
        id: entry.id,
        instancesValid: entry.instancesValid,
        unsat: entry.unsat,
        failFast: entry.failFast,
        diagnosticCodes: entry.diagnostics.map((diag) => diag.code),
      }));

    expect(summarize(first)).toEqual(summarize(second));
  });
});
