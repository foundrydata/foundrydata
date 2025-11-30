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
      dimensionsEnabled: ['structure', 'operations'],
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

    const operationTargets = result.targets.filter(
      (t) => t.dimension === 'operations'
    );
    const opKinds = new Set(operationTargets.map((t) => t.kind));
    expect(opKinds.has('OP_REQUEST_COVERED')).toBe(true);
    expect(opKinds.has('OP_RESPONSE_COVERED')).toBe(true);

    const requestTargets = operationTargets.filter(
      (t) => t.kind === 'OP_REQUEST_COVERED'
    );
    const responseTargets = operationTargets.filter(
      (t) => t.kind === 'OP_RESPONSE_COVERED'
    );

    expect(requestTargets.length).toBe(1);
    expect(responseTargets.length).toBe(2);

    expect(
      requestTargets.some(
        (t) =>
          t.operationKey === 'getUsers' && t.canonPath === '#/paths/~1users/get'
      )
    ).toBe(true);
    expect(
      responseTargets.some(
        (t) =>
          t.operationKey === 'getUsers' && t.canonPath === '#/paths/~1users/get'
      )
    ).toBe(true);
    expect(
      responseTargets.some(
        (t) =>
          t.operationKey === 'POST /users' &&
          t.canonPath === '#/paths/~1users/post'
      )
    ).toBe(true);
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

    const result1 = analyzeCoverage({
      ...baseInput,
      dimensionsEnabled: ['operations'],
    });
    const result2 = analyzeCoverage({
      ...baseInput,
      dimensionsEnabled: ['operations'],
    });

    const opNodes1 = result1.graph.nodes.filter((n) => n.kind === 'operation');
    const opNodes2 = result2.graph.nodes.filter((n) => n.kind === 'operation');
    expect(opNodes1).toEqual(opNodes2);

    const opEdges1 = result1.graph.edges.filter((e) => e.kind === 'operation');
    const opEdges2 = result2.graph.edges.filter((e) => e.kind === 'operation');
    expect(opEdges1).toEqual(opEdges2);

    const opTargets1 = result1.targets.filter(
      (t) => t.dimension === 'operations'
    );
    const opTargets2 = result2.targets.filter(
      (t) => t.dimension === 'operations'
    );
    expect(opTargets1).toEqual(opTargets2);
  });

  it('only materializes operations-dimension targets when the operations dimension is enabled', () => {
    const schema = {
      openapi: '3.1.0',
      paths: {
        '/ping': {
          get: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { type: 'string' },
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

    const withOps = analyzeCoverage({
      ...baseInput,
      dimensionsEnabled: ['operations'],
    });
    const withoutOps = analyzeCoverage({
      ...baseInput,
      dimensionsEnabled: ['structure'],
    });

    const opsTargetsWith = withOps.targets.filter(
      (t) => t.dimension === 'operations'
    );
    const opsTargetsWithout = withoutOps.targets.filter(
      (t) => t.dimension === 'operations'
    );

    expect(opsTargetsWith.length).toBeGreaterThan(0);
    expect(opsTargetsWithout.length).toBe(0);
  });

  it('emits SCHEMA_REUSED_COVERED targets as diagnostic-only when a schema is reused across operations', () => {
    const schema = {
      openapi: '3.1.0',
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
        },
      },
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
        },
        '/admins': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
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
      dimensionsEnabled: ['operations'],
    });

    const reusedTargets = result.targets.filter(
      (t) => t.dimension === 'operations' && t.kind === 'SCHEMA_REUSED_COVERED'
    );

    expect(reusedTargets.length).toBe(1);
    const reused = reusedTargets[0]!;
    expect(reused.status).toBe('deprecated');
    expect(reused.canonPath).toBe('#/components/schemas/User');
    const operationKeys = (reused.meta?.operationKeys as string[]) ?? [];
    expect(operationKeys.sort()).toEqual(['GET /admins', 'GET /users']);
  });

  it('keeps non-operations target IDs stable when toggling operations dimension', () => {
    const schema = {
      openapi: '3.1.0',
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'ok',
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

    const baseInput = {
      canonSchema: schema,
      ptrMap: new Map<string, string>([['', '#']]),
      coverageIndex: new Map(),
      planDiag: undefined,
    };

    const structureOnly = analyzeCoverage({
      ...baseInput,
      dimensionsEnabled: ['structure'],
    });
    const withOps = analyzeCoverage({
      ...baseInput,
      dimensionsEnabled: ['structure', 'operations'],
    });

    const nonOpsIdsStructureOnly = structureOnly.targets
      .filter((t) => t.dimension !== 'operations')
      .map((t) => t.id)
      .sort();
    const nonOpsIdsWithOps = withOps.targets
      .filter((t) => t.dimension !== 'operations')
      .map((t) => t.id)
      .sort();

    expect(nonOpsIdsWithOps).toEqual(nonOpsIdsStructureOnly);
  });
});
