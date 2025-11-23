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
    expect(result.stages.compose.status).toBe('failed');
    const diags = result.artifacts.validationDiagnostics ?? [];
    expect(diags.length).toBeGreaterThanOrEqual(1);
    const diag = diags.find(
      (entry) => entry.code === 'EXTERNAL_REF_UNRESOLVED'
    );
    expect(diag?.details).toMatchObject({
      mode: 'strict',
      policy: 'warn',
    });
    expect(diag?.details).not.toHaveProperty('skippedValidation');
    expect(diag?.metrics).toBeUndefined();
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
