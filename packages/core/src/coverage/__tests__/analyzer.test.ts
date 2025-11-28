import { describe, it, expect } from 'vitest';

import { analyzeCoverage, type CoverageAnalyzerInput } from '../analyzer.js';

describe('analyzeCoverage', () => {
  it('is deterministic for fixed schema and diagnostics', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 0 },
      },
      enum: ['a', 'b', 'c'],
    };

    const input: CoverageAnalyzerInput = {
      canonSchema: schema,
      ptrMap: new Map<string, string>([['', '#']]),
      coverageIndex: new Map(),
      planDiag: {
        fatal: [],
        unsatHints: [],
      },
    };

    const result1 = analyzeCoverage(input);
    const result2 = analyzeCoverage(input);

    expect(result1.graph).toEqual(result2.graph);
    expect(result1.targets).toEqual(result2.targets);
  });

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

    const structureTargets = result.targets.filter(
      (t) => t.dimension === 'structure'
    );
    const schemaNodeTargets = structureTargets.filter(
      (t) => t.kind === 'SCHEMA_NODE'
    );
    const propertyTargets = structureTargets.filter(
      (t) => t.kind === 'PROPERTY_PRESENT'
    );

    expect(schemaNodeTargets.some((t) => t.canonPath === '#')).toBe(true);
    expect(
      schemaNodeTargets.some((t) => t.canonPath === '#/properties/id')
    ).toBe(true);
    expect(
      schemaNodeTargets.some((t) => t.canonPath === '#/properties/title')
    ).toBe(true);
    expect(propertyTargets.some((t) => t.canonPath === '#/properties/id')).toBe(
      true
    );
    expect(
      propertyTargets.some((t) => t.canonPath === '#/properties/title')
    ).toBe(true);

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
      dimensionsEnabled: ['branches', 'enum'],
    });

    const branchNodes = result.graph.nodes.filter((n) => n.kind === 'branch');
    const branchPaths = branchNodes.map((n) => n.canonPath);

    expect(branchPaths).toContain('#/oneOf/0');
    expect(branchPaths).toContain('#/oneOf/1');
    expect(branchPaths).toContain('#/anyOf/0');
    expect(branchPaths).toContain('#/if');
    expect(branchPaths).toContain('#/then');
    expect(branchPaths).toContain('#/else');

    const branchTargets = result.targets.filter(
      (t) => t.dimension === 'branches'
    );
    const kinds = new Set(branchTargets.map((t) => t.kind));
    expect(kinds.has('ONEOF_BRANCH')).toBe(true);
    expect(kinds.has('ANYOF_BRANCH')).toBe(true);
    expect(kinds.has('CONDITIONAL_PATH')).toBe(true);

    const structureTargets = result.targets.filter(
      (t) => t.dimension === 'structure'
    );
    expect(structureTargets.length).toBe(0);
  });

  it('marks targets under UNSAT canonPath as unreachable', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 1, maximum: 0 }, // empty numeric domain
      },
    };

    const result = analyzeCoverage({
      canonSchema: schema,
      ptrMap: new Map<string, string>([['', '#']]),
      coverageIndex: new Map(),
      planDiag: {
        fatal: [
          {
            code: 'UNSAT_NUMERIC_BOUNDS',
            canonPath: '#/properties/id',
            details: {},
          },
        ],
      },
    });

    const unreachableTargets = result.targets.filter(
      (t) => t.status === 'unreachable'
    );
    expect(unreachableTargets.length).toBeGreaterThan(0);
    for (const target of unreachableTargets) {
      expect(target.canonPath.startsWith('#/properties/id')).toBe(true);
    }
  });

  it('respects dimensionsEnabled when materializing targets', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'integer' },
      },
      enum: ['x', 'y', 'z'],
    };

    const baseInput = {
      canonSchema: schema,
      ptrMap: new Map<string, string>([['', '#']]),
      coverageIndex: new Map(),
      planDiag: undefined,
    };

    const allDims = analyzeCoverage({
      ...baseInput,
      dimensionsEnabled: ['structure', 'branches', 'enum'],
    });
    const enumOnly = analyzeCoverage({
      ...baseInput,
      dimensionsEnabled: ['enum'],
    });

    const allEnumTargets = allDims.targets.filter(
      (t) => t.dimension === 'enum'
    );
    const enumOnlyTargets = enumOnly.targets.filter(
      (t) => t.dimension === 'enum'
    );

    expect(allEnumTargets.length).toBe(3);
    expect(enumOnlyTargets.length).toBe(3);

    expect(allEnumTargets).toEqual(enumOnlyTargets);

    const structureTargets = enumOnly.targets.filter(
      (t) => t.dimension === 'structure'
    );
    const branchTargets = enumOnly.targets.filter(
      (t) => t.dimension === 'branches'
    );
    expect(structureTargets.length).toBe(0);
    expect(branchTargets.length).toBe(0);
  });

  it('is deterministic for enum targets on larger enums', () => {
    const enumValues = Array.from({ length: 32 }, (_, i) => `v${i}`);
    const schema = {
      type: 'string',
      enum: enumValues,
    };

    const input: CoverageAnalyzerInput = {
      canonSchema: schema,
      ptrMap: new Map<string, string>([['', '#']]),
      coverageIndex: new Map(),
      planDiag: undefined,
      dimensionsEnabled: ['enum'],
    };

    const result1 = analyzeCoverage({
      canonSchema: input.canonSchema,
      ptrMap: input.ptrMap,
      coverageIndex: input.coverageIndex,
      planDiag: input.planDiag,
      dimensionsEnabled: [...(input.dimensionsEnabled ?? [])],
    });
    const result2 = analyzeCoverage({
      canonSchema: input.canonSchema,
      ptrMap: input.ptrMap,
      coverageIndex: input.coverageIndex,
      planDiag: input.planDiag,
      dimensionsEnabled: [...(input.dimensionsEnabled ?? [])],
    });

    const enumTargets1 = result1.targets.filter(
      (t) => t.dimension === 'enum' && t.kind === 'ENUM_VALUE_HIT'
    );
    const enumTargets2 = result2.targets.filter(
      (t) => t.dimension === 'enum' && t.kind === 'ENUM_VALUE_HIT'
    );

    expect(enumTargets1.length).toBe(enumValues.length);
    expect(enumTargets2.length).toBe(enumValues.length);
    expect(enumTargets1).toEqual(enumTargets2);
  });
});
