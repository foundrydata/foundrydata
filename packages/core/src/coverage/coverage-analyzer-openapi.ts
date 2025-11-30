import type { CoverageGraph } from './index.js';

interface AttachOpenApiOperationNodesInput {
  /**
   * Canonical view of the schema. When this represents an OpenAPI
   * document (root object with `openapi` and `paths`), operation
   * nodes are derived from its `paths` map.
   */
  rootSchema: unknown;
  /**
   * Coverage graph to enrich with operation nodes and edges.
   * The function mutates `graph.nodes` and `graph.edges` in place.
   */
  graph: CoverageGraph;
}

type HttpMethod =
  | 'get'
  | 'put'
  | 'post'
  | 'delete'
  | 'options'
  | 'head'
  | 'patch'
  | 'trace';

const HTTP_METHODS: readonly HttpMethod[] = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function appendPointer(base: string, token: string): string {
  if (token === '') return base;
  const escaped = token.replace(/~/g, '~0').replace(/\//g, '~1');
  if (base === '') return `/${escaped}`;
  return `${base}/${escaped}`;
}

function toUpperHttpMethod(method: HttpMethod): string {
  return method.toUpperCase();
}

function getOpenApiPaths(
  rootSchema: unknown
): Record<string, unknown> | undefined {
  if (!isRecord(rootSchema)) return undefined;
  const openapiVersion = rootSchema.openapi;
  const pathsValue = rootSchema.paths;
  if (typeof openapiVersion !== 'string') return undefined;
  if (!isRecord(pathsValue)) return undefined;
  return pathsValue as Record<string, unknown>;
}

interface OperationContext {
  pathKey: string;
  method: HttpMethod;
  operation: Record<string, unknown>;
}

function* iterateOperations(
  paths: Record<string, unknown>
): Iterable<OperationContext> {
  const pathKeys = Object.keys(paths).sort();
  for (const pathKey of pathKeys) {
    const pathItem = paths[pathKey];
    if (!isRecord(pathItem)) continue;
    for (const method of HTTP_METHODS) {
      const operationValue = pathItem[method];
      if (!isRecord(operationValue)) continue;
      yield {
        pathKey,
        method,
        operation: operationValue as Record<string, unknown>,
      };
    }
  }
}

function deriveOperationKey(ctx: OperationContext): {
  operationKey: string;
  operationPtr: string;
} {
  const { pathKey, method, operation } = ctx;
  const rawOperationId = operation.operationId;
  const operationId =
    typeof rawOperationId === 'string' && rawOperationId.trim().length > 0
      ? rawOperationId.trim()
      : undefined;
  const operationKey = operationId ?? `${toUpperHttpMethod(method)} ${pathKey}`;
  const operationPtr = appendPointer(
    appendPointer(appendPointer('', 'paths'), pathKey),
    method
  );
  return { operationKey, operationPtr };
}

function addRequestEdgesForOperation(
  graph: CoverageGraph,
  operationNodeId: string,
  operationPtr: string,
  operation: Record<string, unknown>
): void {
  const requestBody = operation.requestBody;
  if (!isRecord(requestBody)) return;
  const content = requestBody.content;
  if (!isRecord(content)) return;

  const contentTypes = Object.keys(content).sort();
  for (const contentType of contentTypes) {
    const mediaType = content[contentType];
    if (!isRecord(mediaType)) continue;
    if (!('schema' in mediaType)) continue;
    const schema = mediaType.schema;
    if (!schema || typeof schema !== 'object') continue;

    const schemaPtr = appendPointer(
      appendPointer(
        appendPointer(appendPointer(operationPtr, 'requestBody'), 'content'),
        contentType
      ),
      'schema'
    );

    graph.edges.push({
      from: operationNodeId,
      to: `#${schemaPtr}`,
      kind: 'operation',
      meta: {
        role: 'request',
        contentType,
      },
    });
  }
}

function addResponseEdgesForOperation(
  graph: CoverageGraph,
  operationNodeId: string,
  operationPtr: string,
  operation: Record<string, unknown>
): void {
  const responses = operation.responses;
  if (!isRecord(responses)) return;

  const statusKeys = Object.keys(responses).sort();
  for (const status of statusKeys) {
    const response = responses[status];
    if (!isRecord(response)) continue;
    const content = response.content;
    if (!isRecord(content)) continue;

    const contentTypes = Object.keys(content).sort();
    for (const contentType of contentTypes) {
      const mediaType = content[contentType];
      if (!isRecord(mediaType)) continue;
      if (!('schema' in mediaType)) continue;
      const schema = mediaType.schema;
      if (!schema || typeof schema !== 'object') continue;

      const schemaPtr = appendPointer(
        appendPointer(
          appendPointer(
            appendPointer(appendPointer(operationPtr, 'responses'), status),
            'content'
          ),
          contentType
        ),
        'schema'
      );

      graph.edges.push({
        from: operationNodeId,
        to: `#${schemaPtr}`,
        kind: 'operation',
        meta: {
          role: 'response',
          status,
          contentType,
        },
      });
    }
  }
}

export function attachOpenApiOperationNodes(
  input: AttachOpenApiOperationNodesInput
): void {
  const { rootSchema, graph } = input;
  const paths = getOpenApiPaths(rootSchema);
  if (!paths) return;

  for (const ctx of iterateOperations(paths)) {
    const { operationKey, operationPtr } = deriveOperationKey(ctx);
    const operationNodeId = `operation:${operationKey}`;

    graph.nodes.push({
      id: operationNodeId,
      kind: 'operation',
      canonPath: `#${operationPtr}`,
      operationKey,
    });

    addRequestEdgesForOperation(
      graph,
      operationNodeId,
      operationPtr,
      ctx.operation
    );
    addResponseEdgesForOperation(
      graph,
      operationNodeId,
      operationPtr,
      ctx.operation
    );
  }
}
