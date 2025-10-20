import { describe, expect, it } from 'vitest';

import { executePipeline } from '../orchestrator';

describe('Pipeline final validation failure', () => {
  it('marks pipeline status failed when AJV final validation is invalid', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'string',
      minLength: 5,
    } as const;

    const result = await executePipeline(
      schema,
      {
        validate: { validateFormats: false },
      },
      {
        // Force invalid output for the validator
        generate() {
          return { items: ['a'], diagnostics: [], metrics: {}, seed: 0 };
        },
      }
    );

    expect(result.stages.validate.status).toBe('completed');
    expect(result.artifacts.validation).toBeDefined();
    expect(result.artifacts.validation?.valid).toBe(false);

    // New behavior: pipeline status reflects non-compliance
    expect(result.status).toBe('failed');

    // Error recorded at pipeline level for visibility
    const last = result.errors[result.errors.length - 1];
    expect(last?.stage).toBe('validate');
    expect(last?.message).toBe('FINAL_VALIDATION_FAILED');
  });
});
