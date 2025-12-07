import { describe, it, expect } from 'vitest';

import { executePipeline } from '../orchestrator.js';
import type { PipelineOptions } from '../types.js';
import { repairPhilosophyMicroSchemas } from '../../repair/__fixtures__/repair-philosophy-microschemas.js';

describe('Repair Score & revert — pipeline integration', () => {
  const baseOptions: PipelineOptions = {
    mode: 'strict',
    generate: {
      count: 1,
      seed: 13,
    },
    repair: { attempts: 2 },
    validate: { validateFormats: false },
    coverage: { mode: 'off' },
  };

  it('emits REPAIR_REVERTED_NO_PROGRESS when Score(x) stops improving', async () => {
    const schema = repairPhilosophyMicroSchemas.unsat.integerConstVsMultipleOf;

    const result = await executePipeline(schema, baseOptions);

    const revertDiag = (result.artifacts.repairDiagnostics ?? []).find(
      (d) => d.code === 'REPAIR_REVERTED_NO_PROGRESS'
    );
    expect(revertDiag).toBeDefined();
    expect(revertDiag?.phase).toBe('repair');
    expect(revertDiag?.details).toMatchObject({
      keyword: expect.any(String),
      scoreBefore: 1,
      scoreAfter: 1,
    });
  });
});
