/* eslint-disable max-depth */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */

import { ParseError } from '../types/errors.js';

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface OpenApiDriverOptions {
  /**
   * Operation identifier. When provided, it is used to locate the operation
   * across all paths and HTTP methods.
   */
  operationId?: string;
  /**
   * Fallback path and method selection when operationId is not provided.
   * This is intentionally minimal and primarily used for tests.
   */
  path?: string;
  method?: HttpMethod | string;
  /**
   * HTTP status code to select from the responses map. Defaults to "200",
   * then "default", then the first available status code.
   */
  status?: string;
  /**
   * Content type to select from the response content map. Defaults to
   * "application/json" when available, otherwise the first available key.
   */
  contentType?: string;
  /**
   * Whether callers intend to prefer examples over generated data.
   * The driver itself does not generate instances; it exposes the best
   * candidate example (when present) so callers can make that decision.
   */
  preferExamples?: boolean;
}

export interface OpenApiSchemaSelectionMeta {
  path: string;
  method: HttpMethod;
  status: string;
  contentType: string;
}

export interface OpenApiSchemaSelection {
  schema: unknown;
  /**
   * Preferred example extracted from the OpenAPI document, or undefined when
   * no suitable example was found.
   */
  example?: unknown;
  /**
   * Where the example came from, for observability/debugging.
   */
  exampleSource?:
    | 'content.example'
    | 'content.examples.default'
    | 'content.examples.named'
    | 'schema.example'
    | 'schema.examples';
  meta: OpenApiSchemaSelectionMeta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function coerceHttpMethod(method: unknown): HttpMethod | undefined {
  if (typeof method !== 'string') return undefined;
  const lowered = method.toLowerCase();
  return HTTP_METHODS.includes(lowered as HttpMethod)
    ? (lowered as HttpMethod)
    : undefined;
}

function selectOperation(
  doc: Record<string, unknown>,
  opts: OpenApiDriverOptions
): { pathKey: string; method: HttpMethod; operation: Record<string, unknown> } {
  const paths = doc.paths;
  if (!isRecord(paths)) {
    throw new ParseError({
      message: 'Invalid OpenAPI document: missing or invalid "paths" object',
      context: { section: 'paths' },
    });
  }

  if (opts.operationId) {
    const matches: Array<{
      pathKey: string;
      method: HttpMethod;
      operation: Record<string, unknown>;
    }> = [];
    for (const [pathKey, pathItem] of Object.entries(paths)) {
      if (!isRecord(pathItem)) continue;
      for (const method of HTTP_METHODS) {
        const maybeOperation = pathItem[method];
        if (!isRecord(maybeOperation)) continue;
        if (maybeOperation.operationId === opts.operationId) {
          matches.push({ pathKey, method, operation: maybeOperation });
        }
      }
    }
    if (matches.length === 0) {
      throw new ParseError({
        message: `Operation with operationId "${opts.operationId}" not found`,
        context: { operationId: opts.operationId },
      });
    }
    if (matches.length > 1) {
      throw new ParseError({
        message: `OperationId "${opts.operationId}" is ambiguous across multiple paths`,
        context: {
          operationId: opts.operationId,
          matches: matches.map((m) => ({ path: m.pathKey, method: m.method })),
        },
      });
    }
    return matches[0]!;
  }

  const pathKey = opts.path;
  const method = coerceHttpMethod(opts.method);
  if (pathKey && method && isRecord(paths[pathKey])) {
    const pathItem = paths[pathKey] as Record<string, unknown>;
    const op = pathItem[method];
    if (isRecord(op)) {
      return { pathKey, method, operation: op };
    }
    throw new ParseError({
      message: `Operation for path "${pathKey}" and method "${method}" not found`,
      context: { path: pathKey, method },
    });
  }

  // Fallback: when the document contains a single operation overall, use it.
  const candidates: Array<{
    pathKey: string;
    method: HttpMethod;
    operation: Record<string, unknown>;
  }> = [];
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue;
    for (const method of HTTP_METHODS) {
      const maybeOperation = pathItem[method];
      if (!isRecord(maybeOperation)) continue;
      candidates.push({ pathKey, method, operation: maybeOperation });
    }
  }
  if (candidates.length === 1) {
    return candidates[0]!;
  }
  throw new ParseError({
    message:
      'OpenAPI selection is ambiguous: provide operationId or (path, method)',
    context: { candidates: candidates.length },
  });
}

function selectResponse(
  operation: Record<string, unknown>,
  opts: OpenApiDriverOptions
): { status: string; response: Record<string, unknown> } {
  const responses = operation.responses;
  if (!isRecord(responses)) {
    throw new ParseError({
      message: 'Operation has no responses object',
      context: { section: 'responses' },
    });
  }

  const statusKeys = Object.keys(responses);
  if (statusKeys.length === 0) {
    throw new ParseError({
      message: 'Operation responses are empty',
      context: { section: 'responses' },
    });
  }

  const preferredStatuses = [
    opts.status,
    '200',
    '201',
    'default',
    statusKeys[0],
  ].filter((s): s is string => typeof s === 'string' && statusKeys.includes(s));

  const status = preferredStatuses[0]!;
  const response = responses[status];
  if (!isRecord(response)) {
    throw new ParseError({
      message: `Response for status "${status}" is not an object`,
      context: { status },
    });
  }

  return { status, response };
}

function selectContent(
  response: Record<string, unknown>,
  opts: OpenApiDriverOptions
): { contentType: string; mediaType: Record<string, unknown> } {
  const content = response.content;
  if (!isRecord(content)) {
    throw new ParseError({
      message: 'Response has no content object',
      context: { section: 'content' },
    });
  }

  const contentTypes = Object.keys(content);
  if (contentTypes.length === 0) {
    throw new ParseError({
      message: 'Response content is empty',
      context: { section: 'content' },
    });
  }

  const preferredTypes = [
    opts.contentType,
    'application/json',
    contentTypes[0],
  ].filter(
    (t): t is string => typeof t === 'string' && contentTypes.includes(t)
  );

  const contentType = preferredTypes[0]!;
  const mediaType = content[contentType];
  if (!isRecord(mediaType)) {
    throw new ParseError({
      message: `Content entry for "${contentType}" is not an object`,
      context: { contentType },
    });
  }

  return { contentType, mediaType };
}

function extractExampleFromMediaAndSchema(
  mediaType: Record<string, unknown>,
  schema: unknown
): {
  example?: unknown;
  exampleSource?: OpenApiSchemaSelection['exampleSource'];
} {
  if ('example' in mediaType) {
    return { example: mediaType.example, exampleSource: 'content.example' };
  }

  const maybeExamples = mediaType.examples;
  if (isRecord(maybeExamples)) {
    const named = maybeExamples as Record<string, unknown>;
    const defaultExample = named.default;
    if (isRecord(defaultExample) && 'value' in defaultExample) {
      return {
        example: (defaultExample as Record<string, unknown>).value,
        exampleSource: 'content.examples.default',
      };
    }
    const [firstKey, firstValue] = Object.entries(named)[0] ?? [];
    if (firstKey && isRecord(firstValue) && 'value' in firstValue) {
      return {
        example: (firstValue as Record<string, unknown>).value,
        exampleSource: 'content.examples.named',
      };
    }
  }

  if (isRecord(schema) && 'example' in schema) {
    return {
      example: (schema as Record<string, unknown>).example,
      exampleSource: 'schema.example',
    };
  }

  if (isRecord(schema) && Array.isArray(schema.examples)) {
    const [first] = schema.examples;
    if (first !== undefined) {
      return {
        example: first,
        exampleSource: 'schema.examples',
      };
    }
  }

  return {};
}

/**
 * Select a response schema and, when available, a preferred example from
 * an OpenAPI 3.1-style document.
 *
 * This function never performs I/O. It only navigates the in-memory document
 * and throws ParseError for invalid or ambiguous inputs.
 */
export function selectResponseSchemaAndExample(
  document: unknown,
  opts: OpenApiDriverOptions
): OpenApiSchemaSelection {
  if (!isRecord(document)) {
    throw new ParseError({
      message: 'Invalid OpenAPI document: expected an object',
      context: { section: 'root' },
    });
  }

  const { pathKey, method, operation } = selectOperation(document, opts);
  const { status, response } = selectResponse(operation, opts);
  const { contentType, mediaType } = selectContent(response, opts);

  const schema = isRecord(mediaType) ? mediaType.schema : undefined;
  if (schema === undefined) {
    throw new ParseError({
      message: 'Selected content entry has no schema',
      context: { path: pathKey, method, status, contentType },
    });
  }

  const { example, exampleSource } = extractExampleFromMediaAndSchema(
    mediaType,
    schema
  );

  return {
    schema,
    example,
    exampleSource,
    meta: {
      path: pathKey,
      method,
      status,
      contentType,
    },
  };
}
