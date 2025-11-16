import { describe, expect, it } from 'vitest';

import { executePipeline } from '../orchestrator';
import type { PipelineStageOverrides } from '../types';

describe('Pipeline skip flow on failures', () => {
  it('marks remaining stages as skipped when normalize fails', async () => {
    const schema = { type: 'object' };
    const overrides: PipelineStageOverrides = {
      normalize: () => {
        throw new Error('fail-normalize');
      },
    } as PipelineStageOverrides;

    const result = await executePipeline(schema, {}, overrides);
    expect(result.status).toBe('failed');
    expect(result.timeline).toEqual(['normalize']);
    expect(result.stages.normalize.status).toBe('failed');
    expect(result.stages.compose.status).toBe('skipped');
    expect(result.stages.generate.status).toBe('skipped');
    expect(result.stages.repair.status).toBe('skipped');
    expect(result.stages.validate.status).toBe('skipped');
  });

  it('skips repair and validate when generate fails', async () => {
    const schema = { type: 'string' };
    const overrides: PipelineStageOverrides = {
      generate: () => {
        throw new Error('fail-generate');
      },
    } as PipelineStageOverrides;

    const result = await executePipeline(schema, {}, overrides);
    expect(result.status).toBe('failed');
    expect(result.timeline).toEqual(['normalize', 'compose', 'generate']);
    expect(result.stages.normalize.status).toBe('completed');
    expect(result.stages.compose.status).toBe('completed');
    expect(result.stages.generate.status).toBe('failed');
    expect(result.stages.repair.status).toBe('skipped');
    expect(result.stages.validate.status).toBe('skipped');
  });
});
