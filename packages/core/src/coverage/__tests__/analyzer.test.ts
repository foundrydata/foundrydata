import { describe, it, expect } from 'vitest';

import { analyzeCoverage } from '../analyzer.js';

describe('analyzeCoverage', () => {
  it('returns empty graph and targets as a stable placeholder', () => {
    const result = analyzeCoverage({
      canonSchema: { type: 'object' },
      ptrMap: new Map<string, string>([['#', '#']]),
      coverageIndex: new Map(),
      planDiag: undefined,
    });

    expect(result).toEqual({
      graph: { nodes: [], edges: [] },
      targets: [],
    });
  });
});
