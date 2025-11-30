import { describe, it, expect } from 'vitest';

import { analyzeCoverage } from '../analyzer.js';

describe('coverage analyzer OpenAPI integration', () => {
  it('does not create operation nodes for non-OpenAPI schemas', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'integer' },
      },
    };

    const result = analyzeCoverage({
      canonSchema: schema,
      ptrMap: new Map<string, string>([['', '#']]),
      coverageIndex: new Map(),
      planDiag: undefined,
    });

    const operationNodes = result.graph.nodes.filter(
      (n) => n.kind === 'operation'
    );
    expect(operationNodes.length).toBe(0);
  });

  it('creates OperationNode entries and edges for OpenAPI-style documents', () => {
    const schema = {
      openapi: '3.1.0',
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      filter: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          post: {
            responses: {
              '201': {
                description: 'created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    } as const;

    const result = analyzeCoverage({
      canonSchema: schema,
      ptrMap: new Map<string, string>([['', '#']]),
      coverageIndex: new Map(),
      planDiag: undefined,
    });

    const operationNodes = result.graph.nodes.filter(
      (n) => n.kind === 'operation'
    );
    const operationKeys = new Set(
      operationNodes.map((n) => n.operationKey ?? '')
    );

    expect(operationNodes.length).toBe(2);
    expect(operationKeys.has('getUsers')).toBe(true);
    expect(operationKeys.has('POST /users')).toBe(true);

    const canonPaths = new Set(operationNodes.map((n) => n.canonPath));
    expect(canonPaths.has('#/paths/~1users/get')).toBe(true);
    expect(canonPaths.has('#/paths/~1users/post')).toBe(true);

    const operationEdges = result.graph.edges.filter(
      (e) => e.kind === 'operation'
    );

    expect(operationEdges.length).toBeGreaterThan(0);
    const roles = new Set(
      operationEdges.map((e) => (e.meta as { role?: string } | undefined)?.role)
    );
    expect(roles.has('request')).toBe(true);
    expect(roles.has('response')).toBe(true);

    const getUsersNode = operationNodes.find(
      (n) => n.operationKey === 'getUsers'
    );
    expect(getUsersNode).toBeDefined();
    const getUsersEdges = operationEdges.filter(
      (e) => e.from === getUsersNode?.id
    );
    expect(getUsersEdges.length).toBeGreaterThan(0);
  });

  it('is deterministic for operation nodes given a fixed OpenAPI document', () => {
    const schema = {
      openapi: '3.1.0',
      paths: {
        '/status': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    } as const;

    const baseInput = {
      canonSchema: schema,
      ptrMap: new Map<string, string>([['', '#']]),
      coverageIndex: new Map(),
      planDiag: undefined,
    };

    const result1 = analyzeCoverage(baseInput);
    const result2 = analyzeCoverage(baseInput);

    const opNodes1 = result1.graph.nodes.filter((n) => n.kind === 'operation');
    const opNodes2 = result2.graph.nodes.filter((n) => n.kind === 'operation');
    expect(opNodes1).toEqual(opNodes2);

    const opEdges1 = result1.graph.edges.filter((e) => e.kind === 'operation');
    const opEdges2 = result2.graph.edges.filter((e) => e.kind === 'operation');
    expect(opEdges1).toEqual(opEdges2);
  });
});
