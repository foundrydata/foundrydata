import { describe, it, expect, vi } from 'vitest';

import { executePipeline } from '../../core/src/pipeline/orchestrator.js';
import { dependentAllOfCoverageSchema } from '../../core/src/pipeline/__fixtures__/integration-schemas.js';
import { printComposeDebug } from './debug.js';

describe('printComposeDebug', () => {
  it('prints compose diagnostics and coverage summary', async () => {
    const spy = vi
      .spyOn(process.stderr, 'write')

      .mockImplementation(() => true as any);

    try {
      const result = await executePipeline(dependentAllOfCoverageSchema, {
        mode: 'strict',
        generate: { count: 1, seed: 37 },
        validate: { validateFormats: false },
      });

      printComposeDebug(result);

      const output = spy.mock.calls.map((call) => String(call[0])).join('');

      expect(output).toContain('[foundrydata] compose.diag:');
      expect(output).toContain('compose.coverage');
      expect(output).toContain('"anchor"');
      expect(output).toContain('"fallback"');
    } finally {
      spy.mockRestore();
    }
  });
});
