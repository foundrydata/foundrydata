import type Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import { createSourceAjv } from '../ajv-source.js';
import {
  classifyExternalRefFailure,
  createExternalRefDiagnostic,
  type ExternalRefIneligibilityReason,
} from '../modes.js';

function compileSchemaOrThrow(schema: unknown): unknown {
  const factory = (): Ajv =>
    createSourceAjv({ dialect: '2020-12', validateFormats: false });
  const ajv = factory();
  try {
    ajv.compile(schema as object);
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('classifyExternalRefFailure', () => {
  it('marks external $ref failures as skip-eligible and provides exemplar', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      properties: {
        supplier: {
          $ref: 'https://example.com/external-supplier.schema.json#/Supplier',
        },
      },
    } as const;

    const factory = (): Ajv =>
      createSourceAjv({ dialect: '2020-12', validateFormats: false });
    const error = (() => {
      const ajv = factory();
      try {
        ajv.compile(schema as object);
      } catch (err) {
        return err;
      }
      return undefined;
    })();

    expect(error).toBeDefined();

    const classification = classifyExternalRefFailure({
      schema,
      error,
      createSourceAjv: factory,
    });

    expect(classification.skipEligible).toBe(true);
    expect(classification.extRefs).toContain(
      'https://example.com/external-supplier.schema.json#/Supplier'
    );
    expect(classification.failingRefs).toContain(
      'https://example.com/external-supplier.schema.json#/Supplier'
    );
    expect(classification.exemplar).toBe(
      'https://example.com/external-supplier.schema.json#/Supplier'
    );

    const diag = createExternalRefDiagnostic('lax', classification);
    expect(diag.details).toMatchObject({
      mode: 'lax',
      skippedValidation: true,
      ref: 'https://example.com/external-supplier.schema.json#/Supplier',
    });
    expect(diag.metrics).toEqual({ validationsPerRow: 0 });
  });

  it('rejects unresolved internal $ref values', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $ref: '#/definitions/missing',
    } as const;

    const factory = (): Ajv =>
      createSourceAjv({ dialect: '2020-12', validateFormats: false });
    const error = compileSchemaOrThrow(schema);

    const classification = classifyExternalRefFailure({
      schema,
      error,
      createSourceAjv: factory,
    });

    expect(classification.skipEligible).toBe(false);
    expect(classification.reason).toBe<ExternalRefIneligibilityReason>(
      'no-external-refs'
    );
  });

  it('rejects compile errors without $ref keyword exposure', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      allOf: [{ $ref: 'https://example.com/ext#/Foo' }, { type: 123 }],
    } as const;
    const classification = classifyExternalRefFailure({
      schema,
      error: { keyword: 'type', params: { type: 'number' } },
      createSourceAjv: (): Ajv =>
        createSourceAjv({ dialect: '2020-12', validateFormats: false }),
    });

    expect(classification.skipEligible).toBe(false);
    expect(classification.reason).toBe<ExternalRefIneligibilityReason>(
      'non-ref-error'
    );
  });

  it('reports probe failure when the masked schema still fails to compile', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $ref: 'https://example.com/ext#/Missing',
    } as const;

    const error = compileSchemaOrThrow(schema);

    const classification = classifyExternalRefFailure({
      schema,
      error,
      createSourceAjv: (): Ajv =>
        ({
          compile() {
            throw new Error('probe compile failed');
          },
        }) as unknown as Ajv,
    });

    expect(classification.skipEligible).toBe(false);
    expect(classification.reason).toBe<ExternalRefIneligibilityReason>(
      'probe-failed'
    );
  });

  it('omits metrics when creating strict diagnostics', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $ref: 'https://example.com/ext#/Missing',
    } as const;

    const factory = (): Ajv =>
      createSourceAjv({ dialect: '2020-12', validateFormats: false });
    const error = compileSchemaOrThrow(schema);

    const classification = classifyExternalRefFailure({
      schema,
      error,
      createSourceAjv: factory,
    });

    expect(classification.skipEligible).toBe(true);
    const diag = createExternalRefDiagnostic('strict', classification);
    expect(diag.metrics).toBeUndefined();
    expect(diag.details).toMatchObject({ mode: 'strict' });
  });

  it('resolves external refs against the active $id scope', () => {
    const schema = {
      $id: 'https://example.com/schemas/root.json',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      allOf: [
        { $ref: '#/definitions/internal' },
        { $ref: 'external.schema.json#/defs/missing' },
      ],
      definitions: {
        internal: { type: 'object' },
      },
    } as const;

    const factory = (): Ajv =>
      createSourceAjv({ dialect: '2020-12', validateFormats: false });
    const error = compileSchemaOrThrow(schema);

    const classification = classifyExternalRefFailure({
      schema,
      error,
      createSourceAjv: factory,
    });

    expect(classification.skipEligible).toBe(true);
    expect(classification.extRefs).toContain(
      'https://example.com/schemas/external.schema.json#/defs/missing'
    );
    expect(classification.extRefs).not.toContain('#/definitions/internal');

    const diag = createExternalRefDiagnostic('lax', classification);
    expect(diag.details).toMatchObject({
      ref: 'https://example.com/schemas/external.schema.json#/defs/missing',
    });
  });

  it('canonicalizes Ajv-reported refs before eligibility checks', () => {
    const schema = {
      $id: 'https://example.com/schemas/root.json',
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $ref: 'external.schema.json#/defs/missing',
    } as const;

    const factory = (): Ajv =>
      createSourceAjv({ dialect: '2020-12', validateFormats: false });
    const classification = classifyExternalRefFailure({
      schema,
      error: {
        errors: [
          {
            keyword: '$ref',
            missingRef: 'external.schema.json#/defs/missing',
          },
        ],
      },
      createSourceAjv: factory,
    });

    expect(classification.extRefs).toContain(
      'https://example.com/schemas/external.schema.json#/defs/missing'
    );
    expect(classification.skipEligible).toBe(true);
    expect(classification.reason).toBeUndefined();
  });

  it('emits the lexicographically smallest exemplar deterministically', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      anyOf: [
        { $ref: 'https://example.com/zeta.schema.json#/Thing' },
        { $ref: 'https://example.com/alpha.schema.json#/Thing' },
      ],
    } as const;

    const factory = (): Ajv =>
      createSourceAjv({ dialect: '2020-12', validateFormats: false });
    const error = compileSchemaOrThrow(schema);

    const classification = classifyExternalRefFailure({
      schema,
      error,
      createSourceAjv: factory,
    });

    expect(classification.skipEligible).toBe(true);
    expect(classification.extRefs).toEqual(
      expect.arrayContaining([
        'https://example.com/alpha.schema.json#/Thing',
        'https://example.com/zeta.schema.json#/Thing',
      ])
    );

    const diag = createExternalRefDiagnostic('lax', classification);
    expect(diag.details).toMatchObject({
      ref: 'https://example.com/alpha.schema.json#/Thing',
    });
  });

  it('does not record skippedValidation for strict diagnostics even when requested', () => {
    const classification = {
      extRefs: ['https://example.com/external.schema.json#/Supplier'],
      failingRefs: ['https://example.com/external.schema.json#/Supplier'],
      skipEligible: true,
      exemplar: 'https://example.com/external.schema.json#/Supplier',
    };

    const diag = createExternalRefDiagnostic('strict', classification, {
      skipValidation: true,
      policy: 'warn',
    });

    expect(diag.details).toMatchObject({
      mode: 'strict',
      policy: 'warn',
    });
    expect(diag.details).not.toHaveProperty('skippedValidation');
    expect(diag.metrics).toBeUndefined();
  });
});
