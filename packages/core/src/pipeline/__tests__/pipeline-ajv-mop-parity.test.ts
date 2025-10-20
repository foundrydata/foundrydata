import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist a capture object for expectations passed to the AJV parity gate
const capture: { last?: any } = {};

// Mock the parity gate to capture the expectation payload used by orchestrator
vi.mock('../../util/ajv-gate.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../util/ajv-gate.js')>();
  return {
    ...actual,
    checkAjvStartupParity: (
      sourceAjv: unknown,
      planningAjv: unknown,
      expectPayload: unknown
    ) => {
      capture.last = expectPayload;
      // Do not throw; passthrough behavior for the rest of the pipeline
    },
  };
});

// Import after mocking to ensure orchestrator uses the mocked gate
import { executePipeline } from '../orchestrator.js';

describe('orchestrator — AJV multipleOfPrecision parity', () => {
  beforeEach(() => {
    capture.last = undefined;
  });

  it('propagates PlanOptions.rational.decimalPrecision to parity gate (fallback: decimal)', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'number',
      multipleOf: 0.01,
    } as const;

    const result = await executePipeline(
      schema,
      {
        generate: {
          count: 1,
          planOptions: {
            rational: { fallback: 'decimal', decimalPrecision: 3 },
          },
        },
        validate: { validateFormats: false },
      },
      {
        // Deterministic items for the pipeline; not relevant to this assertion
        generate: () => ({
          items: [0.03],
          diagnostics: [],
          metrics: {},
          seed: 0,
        }),
      }
    );

    // Sanity: pipeline ran to completion
    expect(result.status).toBe('completed');
    expect(result.stages.validate.status).toBe('completed');

    // Assert the parity gate received the expected multipleOfPrecision
    expect(capture.last).toBeDefined();
    expect(capture.last.multipleOfPrecision).toBe(3);

    // And artifacts expose flags that reflect the same value
    expect(result.artifacts.validationFlags?.source?.multipleOfPrecision).toBe(
      3
    );
    expect(
      result.artifacts.validationFlags?.planning?.multipleOfPrecision
    ).toBe(3);
  });
});
