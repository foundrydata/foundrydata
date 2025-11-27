import { describe, it, expect } from 'vitest';

import { analyzeCoverage } from '../analyzer.js';

describe('analyzeCoverage', () => {
  it('builds schema and property nodes with structural edges', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        title: { type: 'string' },
      },
    };

    const result = analyzeCoverage({
      canonSchema: schema,
      ptrMap: new Map<string, string>([['', '#']]),
      coverageIndex: new Map(),
      planDiag: undefined,
    });

    expect(result.targets).toEqual([]);

    const nodeKindsByPath = new Map(
      result.graph.nodes.map((n) => [n.canonPath, n.kind])
    );
    expect(nodeKindsByPath.get('#')).toBe('schema');
    expect(nodeKindsByPath.get('#/properties/id')).toBe('property');
    expect(nodeKindsByPath.get('#/properties/title')).toBe('property');

    const edgePairs = result.graph.edges.map((e) => [e.from, e.to]);
    expect(edgePairs).toContainEqual(['#', '#/properties/id']);
    expect(edgePairs).toContainEqual(['#', '#/properties/title']);
  });

  it('classifies oneOf/anyOf and conditional branches as branch nodes', () => {
    const schema = {
      oneOf: [{ type: 'string' }, { type: 'number' }],
      anyOf: [{ type: 'boolean' }],
      if: { type: 'object' },
      then: { const: 1 },
      else: { const: 2 },
    };

    const result = analyzeCoverage({
      canonSchema: schema,
      ptrMap: new Map<string, string>([['', '#']]),
      coverageIndex: new Map(),
      planDiag: undefined,
    });

    const branchNodes = result.graph.nodes.filter((n) => n.kind === 'branch');
    const branchPaths = branchNodes.map((n) => n.canonPath);

    expect(branchPaths).toContain('#/oneOf/0');
    expect(branchPaths).toContain('#/oneOf/1');
    expect(branchPaths).toContain('#/anyOf/0');
    expect(branchPaths).toContain('#/if');
    expect(branchPaths).toContain('#/then');
    expect(branchPaths).toContain('#/else');
  });
});
