import { describe, expect, it } from 'vitest';

import { executePipeline } from '../../../packages/core/src/pipeline/orchestrator.js';
import { DIAGNOSTIC_CODES } from '../../../packages/core/src/diag/codes.js';
import { externalRefSchema } from '../../../packages/core/src/pipeline/__fixtures__/integration-schemas.js';

describe('Acceptance — external $ref policy', () => {
  it('treats unresolved external $ref as a hard error in strict mode', async () => {
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

    const diag = strictResult.artifacts.validationDiagnostics?.[0];
    expect(diag?.code).toBe(DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED);
    expect(diag?.details).toMatchObject({
      mode: 'strict',
    });
  });
});
it('may skip final validation in lax mode when failures are due only to external $ref', async () => {
  const laxResult = await executePipeline(externalRefSchema, {
    mode: 'lax',
    generate: { count: 1 },
    validate: { validateFormats: false },
  });

  expect(laxResult.status).toBe('completed');
  expect(laxResult.stages.compose.status).toBe('completed');
  expect(laxResult.stages.validate.status).toBe('completed');

  const diag = laxResult.artifacts.validationDiagnostics?.[0];
  expect(diag?.code).toBe(DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED);
  expect(diag?.details).toMatchObject({
    mode: 'lax',
    skippedValidation: true,
  });

  expect(laxResult.artifacts.validation?.skippedValidation).toBe(true);
  expect(laxResult.metrics.validationsPerRow).toBe(0);
  expect(diag?.metrics).toMatchObject({ validationsPerRow: 0 });
});
