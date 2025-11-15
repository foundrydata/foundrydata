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
  it("treats failFast 'warn' as a hard failure in strict mode", async () => {
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

    expect(result.status).toBe('failed');
    expect(result.stages.validate.status).toBe('failed');
    const diag = result.artifacts.validationDiagnostics?.[0];
    expect(diag?.details).toMatchObject({
      mode: 'strict',
      policy: 'warn',
    });
    expect(diag?.details).not.toHaveProperty('skippedValidation');
    expect(diag?.metrics).toBeUndefined();
    expect(result.artifacts.validationDiagnostics).toHaveLength(1);
  });

  it("treats failFast 'ignore' as a hard failure in strict mode", async () => {
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

    expect(result.status).toBe('failed');
    expect(result.stages.validate.status).toBe('failed');
    const diag = result.artifacts.validationDiagnostics?.[0];
    expect(diag?.details).toMatchObject({
      mode: 'strict',
      policy: 'ignore',
    });
    expect(diag?.details).not.toHaveProperty('skippedValidation');
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
