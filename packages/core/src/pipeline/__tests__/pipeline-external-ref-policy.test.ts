import { describe, expect, it } from 'vitest';

import { executePipeline } from '../orchestrator';

const schemaWithExternalRef = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    vendor: {
      $ref: 'https://example.com/external.schema.json#/Supplier',
    },
  },
} as const;

describe('pipeline externalRefStrict policy', () => {
  it("respects failFast 'warn' by skipping validation and emitting diagnostics", async () => {
    const result = await executePipeline(schemaWithExternalRef, {
      mode: 'strict',
      generate: {
        count: 0,
        planOptions: {
          failFast: { externalRefStrict: 'warn' },
        },
      },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('completed');
    const validation = result.artifacts.validation;
    expect(validation?.skippedValidation).toBe(true);
    expect(validation?.diagnostics).toHaveLength(1);
    const diag = validation?.diagnostics?.[0];
    expect(diag?.details).toMatchObject({
      mode: 'strict',
      skippedValidation: true,
      policy: 'warn',
    });
    expect(diag?.metrics).toEqual({ validationsPerRow: 0 });
    expect(result.artifacts.validationDiagnostics).toHaveLength(1);
  });

  it("respects failFast 'ignore' by skipping validation without diagnostics", async () => {
    const result = await executePipeline(schemaWithExternalRef, {
      mode: 'strict',
      generate: {
        count: 0,
        planOptions: {
          failFast: { externalRefStrict: 'ignore' },
        },
      },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('completed');
    const validation = result.artifacts.validation;
    expect(validation?.skippedValidation).toBe(true);
    expect(validation?.diagnostics).toBeUndefined();
    expect(result.artifacts.validationDiagnostics).toBeUndefined();
  });

  it("keeps the default 'error' policy as a hard failure", async () => {
    const result = await executePipeline(schemaWithExternalRef, {
      mode: 'strict',
      generate: { count: 0 },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('failed');
    expect(result.stages.compose.status).toBe('failed');
    const diag = result.artifacts.validationDiagnostics?.[0];
    expect(diag?.details).toMatchObject({ mode: 'strict' });
    expect(diag?.details).not.toHaveProperty('skippedValidation');
  });
});
