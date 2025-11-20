/* eslint-disable complexity */
import { describe, expect, it, vi } from 'vitest';

import { DIAGNOSTIC_CODES } from '../../diag/codes.js';
import {
  externalRefSchema,
  dependentAllOfCoverageSchema,
  patternCapsSchema,
} from '../__fixtures__/integration-schemas.js';
import {
  runCorpusHarness,
  type CorpusSchemaConfig,
} from '../corpus-harness.js';
import type { PipelineResult } from '../types.js';
import * as orchestrator from '../orchestrator.js';
import { dedupeDiagnosticsForCorpus } from '../corpus-diagnostics.js';

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

  it('deduplicates repeated generator diagnostics at corpus level', async () => {
    const report = await runCorpusHarness({
      schemas: [
        { id: 'dependent-coverage', schema: dependentAllOfCoverageSchema },
      ],
      mode: 'strict',
      seed: 37,
      instancesPerSchema: 3,
      validateFormats: false,
    });

    const entry = report.results[0];
    expect(entry).toBeDefined();
    if (!entry) {
      throw new Error('Expected dependent-coverage corpus result');
    }

    const targetEnumDiagnostics = entry.diagnostics.filter(
      (diag) =>
        diag.code === DIAGNOSTIC_CODES.TARGET_ENUM_ROUNDROBIN_PATTERNPROPS
    );
    expect(targetEnumDiagnostics.length).toBeLessThanOrEqual(1);
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

  it('emits diagnostics for internal missing $ref and marks schema as failFast', async () => {
    const schemaWithInternalMissingRef = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://example.com/internal-missing.json',
      type: 'object',
      properties: {
        a: { $ref: '#/$defs/missing' },
      },
      required: ['a'],
    } as const;

    const report = await runCorpusHarness({
      schemas: [
        { id: 'internal-missing-ref', schema: schemaWithInternalMissingRef },
      ],
      mode: 'strict',
      seed: 37,
      instancesPerSchema: 3,
      validateFormats: false,
    });

    const entry = report.results[0];
    expect(entry).toBeDefined();
    if (!entry) {
      throw new Error('Expected internal-missing-ref corpus result');
    }

    expect(entry.instancesTried).toBeGreaterThan(0);
    expect(entry.instancesValid).toBe(0);
    expect(entry.unsat).toBe(false);
    expect(entry.failFast).toBe(true);
    const codes = entry.diagnostics.map((diag) => diag.code);
    expect(codes).toContain(DIAGNOSTIC_CODES.SCHEMA_INTERNAL_REF_MISSING);
    expect(entry.metrics?.validationsPerRow ?? 0).toBe(0);
  });

  it('emits validation compile error diagnostics and marks schema as failFast', async () => {
    const schemaWithBadPattern = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'string',
      // Intentionally invalid regular expression to trigger AJV compile-time error
      pattern: '([a-z]+', // missing closing parenthesis
    } as const;

    const report = await runCorpusHarness({
      schemas: [
        { id: 'validation-compile-error', schema: schemaWithBadPattern },
      ],
      mode: 'strict',
      seed: 37,
      instancesPerSchema: 3,
      validateFormats: false,
    });

    const entry = report.results[0];
    expect(entry).toBeDefined();
    if (!entry) {
      throw new Error('Expected validation-compile-error corpus result');
    }

    expect(entry.instancesTried).toBeGreaterThan(0);
    expect(entry.instancesValid).toBe(0);
    expect(entry.unsat).toBe(false);
    expect(entry.failFast).toBe(true);
    const codes = entry.diagnostics.map((diag) => diag.code);
    expect(codes).toContain(DIAGNOSTIC_CODES.VALIDATION_COMPILE_ERROR);
    expect(entry.metrics?.validationsPerRow ?? 0).toBe(0);
  });

  it('treats AJV_FLAGS_MISMATCH as fail-fast and classifies it as an AJV config issue', async () => {
    const pipelineResult = {
      status: 'failed',
      schema: { $schema: 'https://json-schema.org/draft/2020-12/schema' },
      stages: {
        normalize: { status: 'completed' },
        compose: { status: 'completed' },
        generate: { status: 'skipped' },
        repair: { status: 'skipped' },
        validate: { status: 'failed' },
      },
      metrics: {
        normalizeMs: 0,
        composeMs: 0,
        generateMs: 0,
        repairMs: 0,
        validateMs: 0,
        validationsPerRow: 0,
        repairPassesPerRow: 0,
        memoryPeakMB: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        nameBfsNodesExpanded: 0,
        nameBfsQueuePeak: 0,
        nameBeamWidthPeak: 0,
        nameEnumResults: 0,
        nameEnumElapsedMs: 0,
        patternPropsHit: 0,
        presencePressureResolved: 0,
      },
      timeline: [],
      errors: [],
      artifacts: {
        generated: { items: [] },
        validationDiagnostics: [
          {
            code: DIAGNOSTIC_CODES.AJV_FLAGS_MISMATCH,
            canonPath: '#',
            phase: 'validate',
            details: {
              instance: 'both',
              ajvMajor: 8,
              diffs: [
                {
                  flag: 'unicodeRegExp',
                  expected: true,
                  actual: false,
                },
              ],
            },
          },
        ],
        validation: { valid: false, diagnostics: [] },
      },
    } as unknown as PipelineResult;

    const executeSpy = vi
      .spyOn(orchestrator, 'executePipeline')
      .mockResolvedValueOnce(pipelineResult);

    const report = await runCorpusHarness({
      schemas: [{ id: 'ajv-mismatch', schema: { type: 'string' } }],
      mode: 'strict',
      seed: 1,
      instancesPerSchema: 1,
      validateFormats: false,
    });

    executeSpy.mockRestore();

    const entry = report.results[0];
    expect(entry).toBeDefined();
    if (!entry) {
      throw new Error('Expected ajv-mismatch corpus result');
    }

    expect(entry.failFast).toBe(true);
    expect(entry.failFastStage).toBe('validate');
    expect(entry.failFastCode).toBe(DIAGNOSTIC_CODES.AJV_FLAGS_MISMATCH);
    expect(entry.failureCategory).toBe('ajv-config');
    expect(entry.failureKind).toBe('ajv-flags-mismatch');
    expect(typeof entry.failureHint).toBe('string');
    expect(entry.failureHint?.toLowerCase() ?? '').toContain('ajv');
    expect(entry.instancesValid).toBe(0);
    expect(
      entry.diagnostics.some(
        (d) => d.code === DIAGNOSTIC_CODES.AJV_FLAGS_MISMATCH
      )
    ).toBe(true);
  });

  it('deduplicates diagnostics by code, phase, path, and detail key', () => {
    const diagA = {
      code: DIAGNOSTIC_CODES.TARGET_ENUM_ROUNDROBIN_PATTERNPROPS,
      canonPath: '#/properties/obj',
      phase: 'generate',
      details: { patternsHit: 1, distinctNames: 1 },
    } as const;
    const diagB = {
      code: DIAGNOSTIC_CODES.TARGET_ENUM_ROUNDROBIN_PATTERNPROPS,
      canonPath: '#/properties/obj',
      phase: 'generate',
      details: { patternsHit: 3, distinctNames: 2 },
    } as const;

    const deduped = dedupeDiagnosticsForCorpus([diagA, diagB]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toEqual(diagA);
  });
});
