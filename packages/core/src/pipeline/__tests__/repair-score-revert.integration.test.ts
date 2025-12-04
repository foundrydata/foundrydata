import { describe, it, expect, vi } from 'vitest';

import { executePipeline } from '../orchestrator.js';
import type { PipelineOptions } from '../types.js';
import { repairPhilosophyMicroSchemas } from '../../repair/__fixtures__/repair-philosophy-microschemas.js';
import * as scoreModule from '../../repair/score/score.js';

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
    const scores: number[] = [];

    const spy = vi.spyOn(scoreModule, 'computeScore').mockImplementation(() => {
      const idx = scores.length;
      let value: number;
      if (idx === 0) value = 3;
      else if (idx === 1) value = 1;
      else value = 3;
      scores.push(value);
      return value;
    });

    const result = await executePipeline(schema, baseOptions);

    expect(scores.length).toBeGreaterThanOrEqual(2);
    const initialScore = scores[0]!;
    const laterScores = scores.slice(1);
    const minLaterScore = Math.min(...laterScores);
    expect(minLaterScore).toBeLessThan(initialScore);
    expect(scores[scores.length - 1]).toBe(initialScore);

    const revertDiag = (result.artifacts.repairDiagnostics ?? []).find(
      (d) => d.code === 'REPAIR_REVERTED_NO_PROGRESS'
    );
    expect(revertDiag).toBeDefined();
    expect(revertDiag?.phase).toBe('repair');
    expect(revertDiag?.details).toMatchObject({
      keyword: expect.any(String),
      scoreBefore: 3,
      scoreAfter: 3,
    });

    spy.mockRestore();
  });
});
