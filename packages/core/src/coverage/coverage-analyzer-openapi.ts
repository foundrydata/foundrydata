import type { CoverageDimension, CoverageTarget } from '@foundrydata/shared';
import type { CoverageGraph } from './index.js';
import {
  computeCoverageTargetId,
  type CoverageTargetIdContext,
} from './id-generator.js';

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
  /**
   * Coverage targets to extend with operations-dimension targets
   * when the 'operations' dimension is enabled.
   */
  targets: CoverageTarget[];
  /**
   * Enabled coverage dimensions for the current run.
   */
  enabledDimensions: Set<CoverageDimension>;
  /**
   * Context for computing stable coverage target IDs.
   */
  idContext: CoverageTargetIdContext;
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

function recordReuseKey(
  reuseIndex: Map<string, Set<string>>,
  reuseKey: string,
  operationKey: string
): void {
  const existing = reuseIndex.get(reuseKey) ?? new Set<string>();
  existing.add(operationKey);
  reuseIndex.set(reuseKey, existing);
}

// eslint-disable-next-line max-params, max-lines-per-function
function addRequestEdgesForOperation(
  graph: CoverageGraph,
  operationNodeId: string,
  operationPtr: string,
  operation: Record<string, unknown>,
  context: { operationKey: string; reuseIndex: Map<string, Set<string>> }
): boolean {
  const requestBody = operation.requestBody;
  if (!isRecord(requestBody)) return false;
  const content = requestBody.content;
  if (!isRecord(content)) return false;

  let added = false;

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

    const reuseKey =
      isRecord(schema) && typeof schema.$ref === 'string'
        ? schema.$ref
        : `#${schemaPtr}`;
    recordReuseKey(context.reuseIndex, reuseKey, context.operationKey);

    graph.edges.push({
      from: operationNodeId,
      to: `#${schemaPtr}`,
      kind: 'operation',
      meta: {
        role: 'request',
        contentType,
      },
    });

    added = true;
  }

  return added;
}

// eslint-disable-next-line max-params, max-lines-per-function
function addResponseEdgesForOperation(
  graph: CoverageGraph,
  operationNodeId: string,
  operationPtr: string,
  operation: Record<string, unknown>,
  context: { operationKey: string; reuseIndex: Map<string, Set<string>> }
): boolean {
  const responses = operation.responses;
  if (!isRecord(responses)) return false;

  let added = false;

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

      const reuseKey =
        isRecord(schema) && typeof schema.$ref === 'string'
          ? schema.$ref
          : `#${schemaPtr}`;
      recordReuseKey(context.reuseIndex, reuseKey, context.operationKey);

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
      added = true;
    }
  }

  return added;
}

function addSchemaReusedTargetsFromIndex(
  reuseIndex: Map<string, Set<string>>,
  operationsEnabled: boolean,
  targets: CoverageTarget[],
  idContext: CoverageTargetIdContext
): void {
  if (!operationsEnabled) return;

  for (const [reuseKey, opKeys] of reuseIndex) {
    if (opKeys.size <= 1) continue;
    const canonPath = reuseKey.startsWith('#') ? reuseKey : `#${reuseKey}`;
    const targetBase: CoverageTarget = {
      id: '',
      dimension: 'operations',
      kind: 'SCHEMA_REUSED_COVERED',
      canonPath,
      status: 'deprecated',
      meta: {
        operationKeys: Array.from(opKeys).sort(),
      },
    };
    const id = computeCoverageTargetId(targetBase, idContext);
    targets.push({ ...targetBase, id });
  }
}

// eslint-disable-next-line max-lines-per-function
export function attachOpenApiOperationNodes(
  input: AttachOpenApiOperationNodesInput
): void {
  const { rootSchema, graph, targets, enabledDimensions, idContext } = input;
  const paths = getOpenApiPaths(rootSchema);
  if (!paths) return;

  const operationsEnabled = enabledDimensions.has('operations');
  const reuseIndex = new Map<string, Set<string>>();

  for (const ctx of iterateOperations(paths)) {
    const { operationKey, operationPtr } = deriveOperationKey(ctx);
    const operationNodeId = `operation:${operationKey}`;
    const opContext = { operationKey, reuseIndex };

    graph.nodes.push({
      id: operationNodeId,
      kind: 'operation',
      canonPath: `#${operationPtr}`,
      operationKey,
    });

    const hasRequest = addRequestEdgesForOperation(
      graph,
      operationNodeId,
      operationPtr,
      ctx.operation,
      opContext
    );
    const hasResponse = addResponseEdgesForOperation(
      graph,
      operationNodeId,
      operationPtr,
      ctx.operation,
      opContext
    );

    if (!operationsEnabled) {
      continue;
    }

    const canonPath = `#${operationPtr}`;

    if (hasRequest) {
      const requestTargetBase: CoverageTarget = {
        id: '',
        dimension: 'operations',
        kind: 'OP_REQUEST_COVERED',
        canonPath,
        operationKey,
      };
      const requestId = computeCoverageTargetId(requestTargetBase, idContext);
      targets.push({ ...requestTargetBase, id: requestId });
    }

    if (hasResponse) {
      const responseTargetBase: CoverageTarget = {
        id: '',
        dimension: 'operations',
        kind: 'OP_RESPONSE_COVERED',
        canonPath,
        operationKey,
      };
      const responseId = computeCoverageTargetId(responseTargetBase, idContext);
      targets.push({ ...responseTargetBase, id: responseId });
    }
  }

  addSchemaReusedTargetsFromIndex(
    reuseIndex,
    operationsEnabled,
    targets,
    idContext
  );
}
