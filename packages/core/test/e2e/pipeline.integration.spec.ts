/* eslint-disable complexity */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import { executePipeline } from '../../src/pipeline/orchestrator.js';
import { DIAGNOSTIC_CODES } from '../../src/diag/codes.js';
import { ENUM_CAP } from '../../src/constants.js';
import {
  apFalseUnsafePatternSchema,
  apFalseSafeFallbackSchema,
  externalRefSchema,
  exclusivityOneOfSchema,
  conditionalSafeRewriteSchema,
  conditionalBlockedRewriteSchema,
  propertyNamesRawEnumSchema,
  propertyNamesRewriteEnumSchema,
  propertyNamesPatternSchema,
  patternCapsSchema,
  scoreOnlyOneOfSchema,
  dependentAllOfCoverageSchema,
  apFalseRegexCapSchema,
  repairOrigPathSchema,
  mustCoverGuardSchema,
  scoreOnlyLargeOneOfSchema,
} from '../../src/pipeline/__fixtures__/integration-schemas.js';
import { AjvFlagsMismatchError } from '../../src/util/ajv-gate.js';
import * as AjvPlanning from '../../src/util/ajv-planning.js';
import { createPlanOptionsSubKey } from '../../src/util/cache.js';

describe('Foundry pipeline integration scenarios', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AP:false unsafe coverage', () => {
    it('emits fatal AP_FALSE_UNSAFE_PATTERN in strict mode and restricts output', async () => {
      const result = await executePipeline(apFalseUnsafePatternSchema, {
        mode: 'strict',
        generate: { count: 1 },
        validate: { validateFormats: false },
      });

      expect(result.status).toBe('failed');
      expect(result.stages.compose.status).toBe('failed');
      expect(result.stages.generate.status).toBe('skipped');
      expect(result.stages.repair.status).toBe('skipped');
      expect(result.stages.validate.status).toBe('skipped');

      const composeOutput = result.stages.compose.output!;
      expect(composeOutput.diag?.fatal).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN,
            canonPath: '',
          }),
        ])
      );
      const warnCodes =
        composeOutput.diag?.warn?.map((entry) => entry.code) ?? [];
      expect(warnCodes).toContain(
        DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX
      );

      expect(result.artifacts.generated).toBeUndefined();
      expect(result.errors[0]?.message).toBe('COMPOSE_FATAL_DIAGNOSTICS');
    });

    it('downgrades to warning in lax mode and still limits keys to must-cover', async () => {
      const result = await executePipeline(apFalseUnsafePatternSchema, {
        mode: 'lax',
        generate: { count: 2 },
        validate: { validateFormats: false },
      });

      const composeOutput = result.stages.compose.output!;
      const fatalCodes =
        composeOutput.diag?.fatal?.map((entry) => entry.code) ?? [];
      expect(fatalCodes).not.toContain(
        DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN
      );
      const warnCodes =
        composeOutput.diag?.warn?.map((entry) => entry.code) ?? [];
      expect(warnCodes).toEqual(
        expect.arrayContaining([
          DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN,
          DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX,
        ])
      );

      const generated = result.artifacts.generated;
      expect(Array.isArray(generated?.items)).toBe(true);
      const keys = (generated?.items ?? []).flatMap((value) =>
        Object.keys((value ?? {}) as Record<string, unknown>)
      );
      expect(new Set(keys)).toEqual(new Set());
    });

    it('retains safe coverage proof without triggering fail-fast', async () => {
      const result = await executePipeline(apFalseSafeFallbackSchema, {
        mode: 'strict',
        generate: { count: 1 },
        validate: { validateFormats: false },
      });

      expect(result.status).toBe('completed');
      expect(result.stages.validate.status).toBe('completed');
      const composeOutput = result.stages.compose.output!;
      const fatalCodes =
        composeOutput.diag?.fatal?.map((entry) => entry.code) ?? [];
      expect(fatalCodes).not.toContain(
        DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN
      );
      const generated = result.artifacts.generated;
      expect(Array.isArray(generated?.items)).toBe(true);
      const item = (generated?.items?.[0] ?? {}) as Record<string, unknown>;
      expect(item).toHaveProperty('safe');
      expect(item).not.toHaveProperty('unsafe');
    });

    it('treats regex complexity-capped patterns as unsafe under AP:false per mode', async () => {
      const strictResult = await executePipeline(apFalseRegexCapSchema, {
        mode: 'strict',
        generate: {
          count: 1,
          planOptions: {
            patternWitness: {
              alphabet: 'fo',
              maxLength: 3,
              maxCandidates: 1,
            },
          },
        },
        validate: { validateFormats: false },
      });

      const strictCompose = strictResult.stages.compose.output!;
      const strictFatalCodes =
        strictCompose.diag?.fatal?.map((entry) => entry.code) ?? [];
      expect(strictFatalCodes).toContain(
        DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN
      );
      const strictWarnCodes =
        strictCompose.diag?.warn?.map((entry) => entry.code) ?? [];
      expect(strictWarnCodes).toEqual(
        expect.arrayContaining([
          DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED,
          DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX,
        ])
      );

      const laxResult = await executePipeline(apFalseRegexCapSchema, {
        mode: 'lax',
        generate: {
          count: 1,
          planOptions: {
            patternWitness: {
              alphabet: 'fo',
              maxLength: 3,
              maxCandidates: 1,
            },
          },
        },
        validate: { validateFormats: false },
      });

      const laxCompose = laxResult.stages.compose.output!;
      const laxFatalCodes =
        laxCompose.diag?.fatal?.map((entry) => entry.code) ?? [];
      expect(laxFatalCodes).not.toContain(
        DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN
      );
      const laxWarnCodes =
        laxCompose.diag?.warn?.map((entry) => entry.code) ?? [];
      expect(laxWarnCodes).toEqual(
        expect.arrayContaining([
          DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED,
          DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN,
          DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX,
        ])
      );
    });
  });

  it('handles external $ref diagnostics per mode', async () => {
    const strictResult = await executePipeline(externalRefSchema, {
      mode: 'strict',
      generate: { count: 1 },
      validate: { validateFormats: false },
    });

    expect(strictResult.status).toBe('failed');
    expect(strictResult.stages.compose.status).toBe('failed');
    expect(strictResult.stages.generate.status).toBe('skipped');
    expect(strictResult.stages.repair.status).toBe('skipped');
    expect(strictResult.stages.validate.status).toBe('skipped');
    const strictDiag = strictResult.artifacts.validationDiagnostics?.[0];
    expect(strictDiag?.code).toBe(DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED);
    expect(strictDiag?.details).toMatchObject({
      mode: 'strict',
      ref: 'https://example.com/external-supplier.schema.json',
    });
    expect(strictDiag?.details).not.toHaveProperty('skippedValidation', true);
    expect(strictDiag?.metrics).toBeUndefined();

    const laxResult = await executePipeline(externalRefSchema, {
      mode: 'lax',
      generate: { count: 1 },
      validate: { validateFormats: false },
    });

    expect(laxResult.status).toBe('completed');
    expect(laxResult.stages.compose.status).toBe('completed');
    expect(laxResult.stages.validate.status).toBe('completed');
    const laxDiag = laxResult.artifacts.validationDiagnostics?.[0];
    expect(laxDiag?.code).toBe(DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED);
    expect(laxDiag?.details).toMatchObject({
      mode: 'lax',
      skippedValidation: true,
      ref: 'https://example.com/external-supplier.schema.json',
    });
    expect(laxResult.artifacts.validation?.skippedValidation).toBe(true);
    expect(laxResult.metrics.validationsPerRow).toBe(0);
    expect(laxDiag?.metrics).toMatchObject({ validationsPerRow: 0 });
  });

  it("respects patternPolicy.unsafeUnderApFalse 'warn' in strict mode without changing coverage", async () => {
    const result = await executePipeline(apFalseUnsafePatternSchema, {
      mode: 'strict',
      generate: {
        count: 1,
        planOptions: {
          patternPolicy: { unsafeUnderApFalse: 'warn' },
        },
      },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('failed');
    expect(result.stages.compose.status).toBe('completed');

    const composeOutput = result.stages.compose.output!;
    const fatalCodes =
      composeOutput.diag?.fatal?.map((entry) => entry.code) ?? [];
    expect(fatalCodes).not.toContain(DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN);

    const warnCodes =
      composeOutput.diag?.warn?.map((entry) => entry.code) ?? [];
    expect(warnCodes).toEqual(
      expect.arrayContaining([
        DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN,
        DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX,
      ])
    );

    const generated = result.artifacts.generated;
    expect(Array.isArray(generated?.items)).toBe(true);
    const keys = (generated?.items ?? []).flatMap((value) =>
      Object.keys((value ?? {}) as Record<string, unknown>)
    );
    expect(new Set(keys)).toEqual(new Set());
  });

  it("respects patternPolicy.unsafeUnderApFalse 'warn' in lax mode and keeps conservative coverage", async () => {
    const result = await executePipeline(apFalseUnsafePatternSchema, {
      mode: 'lax',
      generate: {
        count: 1,
        planOptions: {
          patternPolicy: { unsafeUnderApFalse: 'warn' },
        },
      },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('failed');
    expect(result.stages.compose.status).toBe('completed');
    expect(result.stages.validate.status).toBe('completed');

    const composeOutput = result.stages.compose.output!;
    const fatalCodes =
      composeOutput.diag?.fatal?.map((entry) => entry.code) ?? [];
    expect(fatalCodes).not.toContain(DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN);

    const warnCodes =
      composeOutput.diag?.warn?.map((entry) => entry.code) ?? [];
    expect(warnCodes).toEqual(
      expect.arrayContaining([
        DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN,
        DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX,
      ])
    );

    const generated = result.artifacts.generated;
    expect(Array.isArray(generated?.items)).toBe(true);
    const keys = (generated?.items ?? []).flatMap((value) =>
      Object.keys((value ?? {}) as Record<string, unknown>)
    );
    expect(new Set(keys)).toEqual(new Set());
  });

  it('fails fast in strict mode for AsyncAPI externals before generation', async () => {
    const asyncapiSchema = JSON.parse(
      readFileSync(
        new URL(
          '../../../../profiles/real-world/asyncapi-3.0.schema.json',
          import.meta.url
        ),
        'utf-8'
      )
    );

    const strictResult = await executePipeline(asyncapiSchema, {
      mode: 'strict',
      generate: { count: 1 },
      validate: { validateFormats: false },
    });

    expect(strictResult.status).toBe('failed');
    expect(strictResult.stages.compose.status).toBe('failed');
    expect(strictResult.stages.generate.status).toBe('skipped');
    const strictDiag = strictResult.artifacts.validationDiagnostics?.[0];
    expect(strictDiag?.code).toBe(DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED);
    expect(strictDiag?.details).toMatchObject({ mode: 'strict' });
    expect(strictDiag?.details).not.toHaveProperty('skippedValidation', true);
  });

  it('repairs AsyncAPI info strings under lax mode', async () => {
    const asyncapiSchema = JSON.parse(
      readFileSync(
        new URL(
          '../../../../profiles/real-world/asyncapi-3.0.schema.json',
          import.meta.url
        ),
        'utf-8'
      )
    );

    const laxResult = await executePipeline(asyncapiSchema, {
      mode: 'lax',
      generate: { count: 1, seed: 424242 },
      validate: { validateFormats: true },
    });

    expect(laxResult.status).toBe('completed');
    const repaired = laxResult.artifacts.repaired?.[0] as
      | { info?: Record<string, unknown> }
      | undefined;
    expect(repaired?.info?.title).toBe('');
    expect(repaired?.info?.version).toBe('');
    expect(laxResult.artifacts.validation?.valid).toBe(true);
  });

  it('records exclusivity diagnostics end-to-end', async () => {
    const result = await executePipeline(exclusivityOneOfSchema, {
      generate: { count: 1, seed: 42 },
      validate: { validateFormats: false },
    });

    const gen = result.artifacts.generated;
    expect(gen).toBeDefined();
    const diag = gen?.diagnostics.find(
      (entry) => entry.code === DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING
    );
    expect(diag).toBeDefined();
    expect(diag?.details).toEqual({ char: '\u0000' });
    expect(diag?.scoreDetails?.exclusivityRand).toBeUndefined();
    const payload = gen?.items?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      kind: 'alpha',
      guard: true,
      payload: `-\u0000`,
    });
  });

  it('ensures oneOf selection yields exclusive validation among branches', async () => {
    // spec://§20#integration — oneOf overlap: selected branch is exclusive
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            tag: { enum: ['A', 'B'] },
            aOnly: { type: 'string', minLength: 1 },
          },
          required: ['tag', 'aOnly'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            tag: { enum: ['B', 'C'] },
            bOnly: { type: 'string', minLength: 1 },
          },
          required: ['tag', 'bOnly'],
        },
      ],
    } as const;

    const result = await executePipeline(schema, {
      generate: { count: 6, seed: 121 },
      validate: { validateFormats: false },
    });

    const items = result.artifacts.generated?.items ?? [];
    expect(items.length).toBeGreaterThan(0);

    // Each item must validate exactly one branch
    for (const it of items) {
      const v0 = it && typeof it === 'object' && 'aOnly' in (it as object);
      const v1 = it && typeof it === 'object' && 'bOnly' in (it as object);
      // Disjoint by construction: presence of aOnly vs bOnly
      expect(v0 || v1).toBe(true);
      expect(v0 && v1).toBe(false);
    }
  });

  describe('Conditional rewrites', () => {
    it('performs safe rewrite without semantic drift', async () => {
      const safeResult = await executePipeline(conditionalSafeRewriteSchema, {
        normalize: { rewriteConditionals: 'safe' },
        generate: { count: 5, seed: 11 },
        validate: { validateFormats: false },
      });

      const neverResult = await executePipeline(conditionalSafeRewriteSchema, {
        normalize: { rewriteConditionals: 'never' },
        generate: { count: 5, seed: 11 },
        validate: { validateFormats: false },
      });

      const notes = safeResult.stages.normalize.output?.notes ?? [];
      const noteByPath = new Map(notes.map((note) => [note.canonPath, note]));
      expect(noteByPath.get('/allOf/0/then/allOf/0/if')?.code).toBe(
        DIAGNOSTIC_CODES.IF_REWRITE_DOUBLE_NOT
      );
      expect(noteByPath.get('/allOf/0/if')?.code).toBe(
        DIAGNOSTIC_CODES.IF_REWRITE_DISABLED_ANNOTATION_RISK
      );

      expect(safeResult.artifacts.generated?.items).toEqual(
        neverResult.artifacts.generated?.items
      );
    });

    it('blocks rewrite when unevaluatedProperties applies and preserves semantics', async () => {
      const safeResult = await executePipeline(
        conditionalBlockedRewriteSchema,
        {
          normalize: { rewriteConditionals: 'safe' },
          generate: { count: 4, seed: 17 },
          validate: { validateFormats: false },
        }
      );

      const baseline = await executePipeline(conditionalBlockedRewriteSchema, {
        normalize: { rewriteConditionals: 'never' },
        generate: { count: 4, seed: 17 },
        validate: { validateFormats: false },
      });

      const notes = safeResult.stages.normalize.output?.notes ?? [];
      const skippedNotes = notes.filter(
        (note) => note.code === DIAGNOSTIC_CODES.IF_REWRITE_SKIPPED_UNEVALUATED
      );
      expect(skippedNotes).toHaveLength(2);
      expect(new Set(skippedNotes.map((note) => note.canonPath))).toEqual(
        new Set(['/allOf/0/if', '/allOf/0/then/allOf/0/if'])
      );

      expect(safeResult.artifacts.generated?.items).toEqual(
        baseline.artifacts.generated?.items
      );
    });
  });

  describe('PropertyNames coverage', () => {
    it('preserves gating-only propertyNames.pattern without fail-fast', async () => {
      const result = await executePipeline(propertyNamesPatternSchema, {
        mode: 'strict',
        generate: { count: 1, seed: 19 },
        validate: { validateFormats: false },
      });

      const composeOutput = result.stages.compose.output!;
      const fatalCodes =
        composeOutput.diag?.fatal?.map((entry) => entry.code) ?? [];
      expect(fatalCodes).not.toContain(
        DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN
      );

      const hints = composeOutput.diag?.unsatHints ?? [];
      const coverageHint = hints.find(
        (entry) =>
          entry.code === DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE &&
          entry.canonPath === ''
      );
      expect(coverageHint).toBeDefined();
      expect(coverageHint?.reason).toBe('coverageUnknown');

      const coverage = composeOutput.coverageIndex.get('');
      expect(coverage).toBeDefined();
    });

    it('keeps enumerate undefined when rewrite is blocked by AP:false gating', async () => {
      const result = await executePipeline(propertyNamesRawEnumSchema, {
        generate: { count: 2, seed: 23 },
        validate: { validateFormats: false },
      });

      const normalizeNotes = result.stages.normalize.output?.notes ?? [];
      expect(
        normalizeNotes.some(
          (note) => note.code === DIAGNOSTIC_CODES.PNAMES_REWRITE_APPLIED
        )
      ).toBe(false);

      const coverage = result.stages.compose.output?.coverageIndex.get('');
      expect(coverage).toBeDefined();
      expect(coverage?.enumerate).toBeUndefined();
      expect(coverage?.provenance ?? []).not.toContain(
        'propertyNamesSynthetic'
      );
    });

    it('enumerates finite keys once rewrite applies', async () => {
      const result = await executePipeline(propertyNamesRewriteEnumSchema, {
        generate: { count: 2, seed: 29 },
        validate: { validateFormats: false },
      });

      const normalizeNotes = result.stages.normalize.output?.notes ?? [];
      const rewriteNote = normalizeNotes.find(
        (note) => note.code === DIAGNOSTIC_CODES.PNAMES_REWRITE_APPLIED
      );
      expect(rewriteNote?.canonPath).toBe('');

      const coverage = result.stages.compose.output?.coverageIndex.get('');
      expect(coverage?.enumerate?.()).toEqual(['alpha', 'beta']);
      expect(coverage?.provenance).toEqual(
        expect.arrayContaining(['propertyNamesSynthetic'])
      );
    });
  });

  describe('Cross-keyword object integration', () => {
    it('retains coverage and dependencies across allOf object keywords', async () => {
      const result = await executePipeline(dependentAllOfCoverageSchema, {
        mode: 'strict',
        generate: { count: 2, seed: 37 },
        validate: { validateFormats: false },
      });

      const composeOutput = result.stages.compose.output!;
      const coverage = composeOutput.coverageIndex.get('');
      expect(coverage?.provenance).toEqual(
        expect.arrayContaining(['properties', 'patternProperties'])
      );
      expect(coverage?.has('rogue')).toBe(false);

      const generatedItems =
        (result.artifacts.generated?.items as Record<string, unknown>[]) ?? [];
      expect(generatedItems.length).toBeGreaterThan(0);
      const allowedKeys = new Set(['anchor', 'fallback', 'aux_0', 'aux_1']);
      for (const item of generatedItems) {
        const keys = Object.keys(item);
        expect(keys.every((key) => allowedKeys.has(key))).toBe(true);
        if ('anchor' in item) {
          expect(item).toHaveProperty('fallback');
          expect(item).toHaveProperty('aux_0');
        }
      }
    });
  });

  it('separates coverage regex caps from generator pattern caps', async () => {
    const result = await executePipeline(patternCapsSchema, {
      generate: {
        count: 1,
        planOptions: {
          patternWitness: {
            alphabet: 'fo',
            maxLength: 3,
            maxCandidates: 1,
          },
        },
      },
      validate: { validateFormats: false },
    });

    const composeOutput = result.stages.compose.output!;
    const coverageWarn = composeOutput.diag?.warn?.find(
      (entry) =>
        entry.code === DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED &&
        entry.canonPath === ''
    );
    expect(coverageWarn?.details).toMatchObject({
      context: 'coverage',
      patternSource: '^(?:foo)+$',
    });

    const genDiag = result.artifacts.generated?.diagnostics?.find(
      (entry) => entry.code === DIAGNOSTIC_CODES.COMPLEXITY_CAP_PATTERNS
    );
    expect(genDiag).toBeDefined();
    expect(genDiag?.details).toMatchObject({ reason: 'regexComplexity' });
    expect(genDiag?.budget).toMatchObject({
      reason: 'complexityCap',
      skipped: true,
    });
    expect(typeof genDiag?.scoreDetails?.tiebreakRand).toBe('number');
  });

  describe('Complexity cap diagnostics', () => {
    it('emits detailed payloads for compose caps', async () => {
      const warnDetails = (
        result: Awaited<ReturnType<typeof executePipeline>>,
        code: (typeof DIAGNOSTIC_CODES)[keyof typeof DIAGNOSTIC_CODES]
      ): { limit: number; observed: number } | undefined => {
        const diag = result.stages.compose.output?.diag?.warn ?? [];
        const entry = diag.find((item) => item.code === code);
        return entry?.details as
          | { limit: number; observed: number }
          | undefined;
      };

      const oneOfSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        oneOf: [{ const: 'a' }, { const: 'b' }, { const: 'c' }],
      };
      const oneOfResult = await executePipeline(oneOfSchema, {
        compose: { complexity: { maxOneOfBranches: 1 } },
        generate: { count: 0 },
        validate: { validateFormats: false },
      });
      expect(
        warnDetails(oneOfResult, DIAGNOSTIC_CODES.COMPLEXITY_CAP_ONEOF)
      ).toEqual({ limit: 1, observed: 3 });

      const anyOfSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      };
      const anyOfResult = await executePipeline(anyOfSchema, {
        compose: { complexity: { maxAnyOfBranches: 1 } },
        generate: { count: 0 },
        validate: { validateFormats: false },
      });
      expect(
        warnDetails(anyOfResult, DIAGNOSTIC_CODES.COMPLEXITY_CAP_ANYOF)
      ).toEqual({ limit: 1, observed: 3 });

      const containsSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'array',
        allOf: [
          { contains: { const: 1 } },
          { contains: { const: 2 } },
          { contains: { const: 3 } },
        ],
      };
      const containsResult = await executePipeline(containsSchema, {
        compose: { complexity: { maxContainsNeeds: 2 } },
        generate: { count: 0 },
        validate: { validateFormats: false },
      });
      expect(
        warnDetails(containsResult, DIAGNOSTIC_CODES.COMPLEXITY_CAP_CONTAINS)
      ).toEqual({ limit: 2, observed: 3 });

      const enumKeys = Array.from(
        { length: ENUM_CAP + 5 },
        (_, idx) => `k${idx.toString().padStart(5, '0')}`
      );
      const enumSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(
          enumKeys.map((key) => [key, { type: 'number' }])
        ),
      };
      const enumResult = await executePipeline(enumSchema, {
        generate: { count: 0 },
        validate: { validateFormats: false },
      });
      expect(
        warnDetails(enumResult, DIAGNOSTIC_CODES.COMPLEXITY_CAP_ENUM)
      ).toEqual({ limit: ENUM_CAP, observed: ENUM_CAP + 5 });

      const schemaSizeSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          alpha: { type: 'string', minLength: 1 },
          beta: { type: 'string', minLength: 1 },
          gamma: { type: 'string', minLength: 1 },
          delta: { type: 'string', minLength: 1 },
          epsilon: { type: 'string', minLength: 1 },
          zeta: { type: 'string', minLength: 1 },
        },
        required: ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'],
      };
      const schemaSizeResult = await executePipeline(schemaSizeSchema, {
        compose: { complexity: { maxSchemaBytes: 200 } },
        generate: { count: 0 },
        validate: { validateFormats: false },
      });
      const sizeDetails = warnDetails(
        schemaSizeResult,
        DIAGNOSTIC_CODES.COMPLEXITY_CAP_SCHEMA_SIZE
      );
      expect(sizeDetails).toBeDefined();
      expect(sizeDetails?.limit).toBe(200);
      expect(sizeDetails?.observed).toBeGreaterThan(200);
    });
  });

  it('records score-only selection diagnostics with skipTrials', async () => {
    const result = await executePipeline(scoreOnlyOneOfSchema, {
      generate: {
        count: 1,
        seed: 31,
        planOptions: {
          trials: {
            skipTrials: true,
            perBranch: 2,
            maxBranchesToTry: 8,
          },
        },
      },
      validate: { validateFormats: false },
    });

    const composeOutput = result.stages.compose.output!;
    const branch = composeOutput.diag?.branchDecisions?.find(
      (entry) => entry.canonPath === '/oneOf'
    );
    expect(branch).toBeDefined();
    expect(branch?.scoreDetails.orderedIndices).toEqual([0, 1]);
    expect(branch?.scoreDetails.topScoreIndices).toEqual([0, 1]);
    expect(typeof branch?.scoreDetails.tiebreakRand).toBe('number');
    expect(branch?.budget).toEqual({
      tried: 0,
      limit: 4,
      skipped: true,
      reason: 'skipTrialsFlag',
    });

    const warn = composeOutput.diag?.warn?.find(
      (entry) =>
        entry.code === DIAGNOSTIC_CODES.TRIALS_SKIPPED_SCORE_ONLY &&
        entry.canonPath === '/oneOf'
    );
    expect(warn?.details).toEqual({ reason: 'skipTrialsFlag' });

    const nodeDiag = composeOutput.diag?.nodes?.['/oneOf'];
    expect(nodeDiag?.scoreDetails?.orderedIndices).toEqual([0, 1]);
    expect(nodeDiag?.scoreDetails?.topScoreIndices).toEqual([0, 1]);
    expect(typeof nodeDiag?.scoreDetails?.tiebreakRand).toBe('number');
  });

  it('records score-only selection diagnostics when oneOf exceeds configured threshold', async () => {
    const result = await executePipeline(scoreOnlyLargeOneOfSchema, {
      generate: {
        count: 1,
        seed: 61,
        planOptions: {
          trials: {
            skipTrialsIfBranchesGt: 2,
            skipTrials: false,
          },
        },
      },
      validate: { validateFormats: false },
    });

    const composeOutput = result.stages.compose.output!;
    const branch = composeOutput.diag?.branchDecisions?.find(
      (entry) => entry.canonPath === '/oneOf'
    );
    expect(branch).toBeDefined();
    expect(branch?.budget.skipped).toBe(true);
    expect(branch?.budget.reason).toBe('largeOneOf');
    expect(branch?.budget.tried).toBe(0);
    expect(branch?.budget.limit).toBeGreaterThan(0);
    expect(branch?.scoreDetails.orderedIndices.length).toBe(
      scoreOnlyLargeOneOfSchema.oneOf.length
    );
    expect(typeof branch?.scoreDetails.tiebreakRand).toBe('number');

    const warnCodes =
      composeOutput.diag?.warn?.map((entry) => entry.code) ?? [];
    expect(warnCodes).toContain(DIAGNOSTIC_CODES.TRIALS_SKIPPED_LARGE_ONEOF);

    const nodeDiag = composeOutput.diag?.nodes?.['/oneOf'];
    expect(nodeDiag?.budget?.reason).toBe('largeOneOf');
    expect(typeof nodeDiag?.scoreDetails?.tiebreakRand).toBe('number');
  });

  describe('Repair observability', () => {
    it('propagates origPath for each repair action', async () => {
      const overrides = {
        generate: async (_effective: unknown, _options: unknown) => ({
          items: [{ anchor: 'alpha' }],
          diagnostics: [],
          metrics: {},
          seed: 13,
        }),
      };

      const result = await executePipeline(
        repairOrigPathSchema,
        {
          mode: 'strict',
          validate: { validateFormats: false },
        },
        overrides
      );

      const actions = result.artifacts.repairActions ?? [];
      expect(actions.length).toBeGreaterThan(0);
      const ptrMap = result.stages.compose.output?.canonical.ptrMap;
      expect(ptrMap).toBeDefined();
      for (const action of actions) {
        expect(typeof action.origPath).toBe('string');
        const expectedOrig = ptrMap?.get(action.canonPath);
        expect(action.origPath).toBe(expectedOrig);
      }
    });
  });

  describe('Rename pre-flight', () => {
    it('rejects rename with reason "branch" when evaluation guard blocks all candidates under unevaluatedProperties:false', async () => {
      // Root object: propertyNames restricts to ['a','b']; AP:false at root; oneOf selects branch on 'a'
      const schema = {
        type: 'object',
        propertyNames: { enum: ['a', 'b'] },
        oneOf: [
          {
            type: 'object',
            properties: { a: { const: 'x' } },
            required: ['a'],
            unevaluatedProperties: false,
          },
          {
            type: 'object',
            properties: { b: { const: 'y' } },
            required: ['b'],
            unevaluatedProperties: false,
          },
        ],
      } as const;

      const overrides = {
        // Force a candidate that violates propertyNames to trigger rename pre-flight
        generate: async () => ({
          items: [{ a: 'x', k: 'z' }],
          diagnostics: [],
          metrics: {},
          seed: 41,
        }),
      };

      const result = await executePipeline(
        schema,
        {
          mode: 'strict',
          validate: { validateFormats: false },
        },
        overrides
      );

      const repairDiags = result.artifacts.repairDiagnostics ?? [];
      const fail = repairDiags.find(
        (d) => d.code === DIAGNOSTIC_CODES.REPAIR_RENAME_PREFLIGHT_FAIL
      );
      expect(fail).toBeDefined();
      expect(fail?.details).toMatchObject({
        reason: 'branch',
        from: 'k',
        to: 'b',
      });

      // No rename action should have been applied
      const actions = result.artifacts.repairActions ?? [];
      expect(
        actions.find((a) => a.action === 'renameProperty')
      ).toBeUndefined();
    });

    it('rejects rename with reason "dependent" when offending key participates in dependentRequired', async () => {
      const schema = {
        type: 'object',
        propertyNames: { enum: ['n', 'd1'] },
        dependentRequired: { k: ['d1'] },
      } as const;

      const overrides = {
        generate: async () => ({
          items: [{ k: 'v' }],
          diagnostics: [],
          metrics: {},
          seed: 43,
        }),
      };

      const result = await executePipeline(
        schema,
        {
          mode: 'strict',
          validate: { validateFormats: false },
        },
        overrides
      );

      const repairDiags = result.artifacts.repairDiagnostics ?? [];
      const fail = repairDiags.find(
        (d) => d.code === DIAGNOSTIC_CODES.REPAIR_RENAME_PREFLIGHT_FAIL
      );
      expect(fail).toBeDefined();
      // Implementation emits to=offendingKey for dependent reason
      expect(fail?.details).toMatchObject({
        reason: 'dependent',
        from: 'k',
        to: 'k',
      });

      const actions = result.artifacts.repairActions ?? [];
      expect(
        actions.find((a) => a.action === 'renameProperty')
      ).toBeUndefined();
    });
  });

  describe('Repair must-cover guard determinism', () => {
    it('remains stable with guard enabled and diverges when disabled', async () => {
      const overrides = {
        generate: async () => ({
          items: [{ alpha: 'ok', rogue: 'z' }],
          diagnostics: [],
          metrics: {},
          seed: 101,
        }),
      };

      const guardedOptions = {
        mode: 'strict' as const,
        generate: {
          count: 1,
          seed: 101,
          planOptions: {
            repair: { mustCoverGuard: true },
          },
        },
        validate: { validateFormats: false },
      };

      const guardedFirst = await executePipeline(
        mustCoverGuardSchema,
        guardedOptions,
        overrides
      );
      const guardedSecond = await executePipeline(
        mustCoverGuardSchema,
        guardedOptions,
        overrides
      );

      expect(guardedFirst.artifacts.repaired).toEqual(
        guardedSecond.artifacts.repaired
      );
      expect(guardedFirst.artifacts.repairActions).toEqual(
        guardedSecond.artifacts.repairActions
      );

      const guardedItem = (guardedFirst.artifacts.repaired?.[0] ??
        {}) as Record<string, unknown>;
      expect(Object.keys(guardedItem)).toEqual(['alpha']);

      const guardedRename = guardedFirst.artifacts.repairActions?.find(
        (action) => action.action === 'renameProperty'
      );
      expect(guardedRename).toBeUndefined();

      const unguardedOptions = {
        ...guardedOptions,
        generate: {
          ...guardedOptions.generate,
          planOptions: {
            ...guardedOptions.generate.planOptions,
            repair: { mustCoverGuard: false },
          },
        },
      };

      const unguarded = await executePipeline(
        mustCoverGuardSchema,
        unguardedOptions,
        overrides
      );

      const unguardedItem = (unguarded.artifacts.repaired?.[0] ?? {}) as Record<
        string,
        unknown
      >;
      expect(new Set(Object.keys(unguardedItem))).toEqual(
        new Set(['alpha', 'beta'])
      );

      const unguardedRename = unguarded.artifacts.repairActions?.find(
        (action) => action.action === 'renameProperty'
      );
      expect(unguardedRename?.details).toMatchObject({
        from: 'rogue',
        to: 'beta',
      });

      const guardedSubKey = createPlanOptionsSubKey(
        guardedOptions.generate?.planOptions
      );
      const unguardedSubKey = createPlanOptionsSubKey(
        unguardedOptions.generate?.planOptions
      );
      expect(guardedSubKey).not.toBe(unguardedSubKey);
      expect(guardedSubKey).toContain('"repair.mustCoverGuard":true');
      expect(unguardedSubKey).toContain('"repair.mustCoverGuard":false');
    });
  });

  it('fails validation stage when AJV unicodeRegExp flags diverge', async () => {
    const actualCreatePlanningAjv = AjvPlanning.createPlanningAjv;
    vi.spyOn(AjvPlanning, 'createPlanningAjv').mockImplementation(
      (...args: Parameters<typeof actualCreatePlanningAjv>) => {
        const ajv = actualCreatePlanningAjv(...args);
        return AjvPlanning.clonePlanningAjvWith(ajv, {
          unicodeRegExp: false,
        });
      }
    );

    const result = await executePipeline(propertyNamesRewriteEnumSchema, {
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('failed');
    expect(result.stages.validate.status).toBe('failed');
    expect(result.errors[0]?.cause).toBeInstanceOf(AjvFlagsMismatchError);
    expect(result.stages.validate.error?.cause).toBeInstanceOf(
      AjvFlagsMismatchError
    );
  });

  it('does not rely on non-validating anyOf branch under unevaluatedProperties:false (T-UEP-TRACE-02)', async () => {
    // spec://§20#integration — T‑UEP‑TRACE‑02 integration
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      unevaluatedProperties: false,
      properties: { discr: { enum: ['left', 'right'] } },
      required: ['discr'],
      anyOf: [
        {
          type: 'object',
          properties: { discr: { const: 'left' }, leftKey: { type: 'number' } },
          required: ['discr'],
          patternProperties: { '^l_\\w+$': { type: 'string' } },
        },
        {
          type: 'object',
          properties: {
            discr: { const: 'right' },
            rightKey: { type: 'number' },
          },
          required: ['discr'],
          patternProperties: { '^r_\\w+$': { type: 'string' } },
        },
      ],
    } as const;

    const result = await executePipeline(schema, {
      generate: { count: 6, seed: 222 },
      validate: { validateFormats: false },
    });

    const items: unknown[] =
      result.artifacts.repaired ?? result.artifacts.generated?.items ?? [];
    expect(items.length).toBeGreaterThan(0);

    for (const raw of items) {
      const obj = (raw ?? {}) as Record<string, unknown>;
      const discr = obj.discr as string | undefined;
      // Exactly one branch is intended to validate via discriminant
      expect(discr === 'left' || discr === 'right').toBe(true);

      // Under unevaluatedProperties:false, keys must not rely on the non-validating branch
      const keys = Object.keys(obj);
      if (discr === 'left') {
        // MUST NOT emit keys introduced by branch-2 only (r_*)
        expect(keys.some((k) => /^r_\w+$/.test(k))).toBe(false);
      } else if (discr === 'right') {
        // MUST NOT emit keys introduced by branch-1 only (l_*)
        expect(keys.some((k) => /^l_\w+$/.test(k))).toBe(false);
      }
    }
  });
});
