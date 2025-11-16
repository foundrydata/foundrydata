import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_CODES } from '../../diag/codes.js';
import {
  apFalseUnsafePatternSchema,
  externalRefSchema,
} from '../__fixtures__/integration-schemas.js';
import { assertOracleInvariants, runOracleHarness } from '../oracle-harness.js';

/**
 * AJV-oracle harness tests
 *
 * Existing coverage:
 * - executePipeline is exercised end-to-end by pipeline-orchestrator tests
 *   and e2e pipeline.integration.spec, including:
 *   - AP:false fail-fast semantics under strict vs lax modes
 *   - external $ref handling and EXTERNAL_REF_UNRESOLVED diagnostics
 *   - final AJV validation failure semantics (FINAL_VALIDATION_FAILED)
 * - AJV configuration parity and flag extraction are covered by:
 *   - util/ajv-source tests via createSourceAjv
 *   - pipeline-ajv-mop-parity tests (multipleOfPrecision parity)
 * - Test helpers in packages/core/test/unit/test-helpers.ts already provide
 *   createSourceAjvForSchema and pipeline stage runners for unit-level checks.
 *
 * What this file adds:
 * - A dedicated AJV-oracle harness that:
 *   - re-validates generated instances against Source AJV on the original schema
 *   - asserts that success never coincides with AJV-invalid instances
 *   - asserts that early UNSAT/fail-fast outcomes always carry diagnostics
 * - Determinism checks for harness runs under fixed seeds.
 */

describe('AJV-oracle harness', () => {
  it('treats satisfiable schemas as AJV-valid in strict mode', async () => {
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

    const report = await runOracleHarness({
      schemas: [{ id: 'simple-object', schema: simpleSchema }],
      mode: 'strict',
      seed: 37,
      count: 5,
      validateFormats: false,
    });

    expect(report.ok).toBe(true);
    expect(report.runs.length).toBe(1);
    const run = report.runs[0]!;
    expect(run.generatedItems.length).toBeGreaterThan(0);
    expect(run.invalidItems).toHaveLength(0);
    expect(run.unsatDiagnostics).toHaveLength(0);
    expect(run.shortCircuited).toBe(false);

    expect(() => assertOracleInvariants(report)).not.toThrow();
  });

  it('observes UNSAT/fail-fast diagnostics for AP:false-unsafe coverage in strict mode', async () => {
    const report = await runOracleHarness({
      schemas: [{ id: 'apFalse-unsafe', schema: apFalseUnsafePatternSchema }],
      mode: 'strict',
      seed: 13,
      count: 2,
      validateFormats: false,
    });

    expect(report.runs.length).toBe(1);
    const run = report.runs[0]!;
    expect(run.generatedItems.length).toBe(0);
    expect(run.shortCircuited).toBe(true);
    expect(run.unsatDiagnostics.length).toBeGreaterThan(0);
    const codes = run.unsatDiagnostics.map((d) => d.code);
    expect(codes).toContain(DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN);

    expect(() => assertOracleInvariants(report)).not.toThrow();
  });

  it('surfaces strict vs lax behavior for unresolved external refs', async () => {
    const strictReport = await runOracleHarness({
      schemas: [{ id: 'external-strict', schema: externalRefSchema }],
      mode: 'strict',
      seed: 19,
      count: 1,
      validateFormats: false,
    });

    expect(strictReport.runs.length).toBe(1);
    const strictRun = strictReport.runs[0]!;
    expect(strictRun.generatedItems.length).toBe(0);
    expect(strictRun.shortCircuited).toBe(true);
    const strictCodes = strictRun.unsatDiagnostics.map((d) => d.code);
    expect(strictCodes).toContain(DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED);

    const laxReport = await runOracleHarness({
      schemas: [{ id: 'external-lax', schema: externalRefSchema }],
      mode: 'lax',
      seed: 19,
      count: 1,
      validateFormats: false,
    });

    expect(laxReport.runs.length).toBe(1);
    const laxRun = laxReport.runs[0]!;
    expect(laxRun.shortCircuited).toBe(false);
    expect(laxRun.generatedItems.length).toBeGreaterThanOrEqual(0);
    expect(laxRun.pipelineResult.artifacts.validation?.skippedValidation).toBe(
      true
    );

    expect(() => assertOracleInvariants(strictReport)).not.toThrow();
    expect(() => assertOracleInvariants(laxReport)).not.toThrow();
  });

  it('is deterministic for fixed seed and mode', async () => {
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

    const options = {
      schemas: [{ id: 'deterministic', schema: simpleSchema }],
      mode: 'strict' as const,
      seed: 121,
      count: 4,
      validateFormats: false,
    };

    const first = await runOracleHarness(options);
    const second = await runOracleHarness(options);

    const firstItems = first.runs[0]?.generatedItems;
    const secondItems = second.runs[0]?.generatedItems;

    expect(firstItems).toEqual(secondItems);
    expect(() => assertOracleInvariants(first)).not.toThrow();
    expect(() => assertOracleInvariants(second)).not.toThrow();
  });
});
