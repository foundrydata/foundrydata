/* eslint-disable max-depth */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import { getAjvClassLabel, type JsonSchemaDialect } from './ajv-source';

export type AjvClassName = ReturnType<typeof getAjvClassLabel>;

export interface DialectInfo {
  dialect: JsonSchemaDialect;
  ajvClass: AjvClassName;
}

export interface DynamicScopeBindingResult {
  code: 'DYNAMIC_SCOPE_BOUNDED' | 'DYNAMIC_PRESENT';
  name?: string;
  depth?: number;
  ref?: string;
}

export interface DynamicScopeBindingOptions {
  maxHops?: number;
}

const DEFAULT_DIALECT: JsonSchemaDialect = '2020-12';
const DEFAULT_MAX_HOPS = 2;

/**
 * Detects the JSON Schema dialect associated with a schema.
 * Relies on $schema when available and falls back to feature heuristics.
 */
export function detectDialect(
  schema: unknown,
  fallback: JsonSchemaDialect = DEFAULT_DIALECT
): JsonSchemaDialect {
  const explicit = extractDialectFromSchemaKeyword(schema);
  if (explicit) {
    return explicit;
  }

  const features = detectDialectFeatures(schema);
  if (features.dynamic) {
    return '2020-12';
  }
  if (features.recursive || features.defs) {
    return '2019-09';
  }
  if (features.legacyId) {
    return 'draft-04';
  }
  if (features.definitions) {
    return 'draft-07';
  }
  return fallback;
}

/**
 * Convenience helper returning both dialect and Ajv class label.
 */
export function detectDialectInfo(schema: unknown): DialectInfo {
  const dialect = detectDialect(schema);
  return { dialect, ajvClass: getAjvClassLabel(dialect) };
}

/**
 * Attempt to resolve a $dynamicRef within the same document using bounded scope.
 * Returns binding metadata without mutating the schema.
 * (REFONLY::{"anchors":["spec://§12#refs-and-dynamic"]})
 */
export function resolveDynamicRefBinding(
  rootSchema: unknown,
  canonPath: string,
  dynamicRefValue: string,
  options?: DynamicScopeBindingOptions
): DynamicScopeBindingResult {
  const name = extractDynamicRefName(dynamicRefValue);
  if (!name) {
    return { code: 'DYNAMIC_PRESENT' };
  }

  const segments = parsePointer(canonPath);
  if (!segments) {
    return { code: 'DYNAMIC_PRESENT' };
  }

  const dynamicNodeSegments = normalizeDynamicNodeSegments(
    rootSchema,
    segments
  );
  if (!dynamicNodeSegments) {
    return { code: 'DYNAMIC_PRESENT' };
  }

  const maxHops =
    options?.maxHops && options.maxHops > 0
      ? options.maxHops
      : DEFAULT_MAX_HOPS;

  if (
    hasRefBoundaryOnPath(rootSchema, dynamicNodeSegments) ||
    dynamicNodeSegments.length === 0
  ) {
    return { code: 'DYNAMIC_PRESENT' };
  }

  const candidate = findDynamicAnchorCandidate(
    rootSchema,
    dynamicNodeSegments,
    name,
    maxHops
  );
  if (!candidate) {
    return { code: 'DYNAMIC_PRESENT' };
  }

  if (hasAnchorCollisionAbove(rootSchema, candidate.segments, name)) {
    return { code: 'DYNAMIC_PRESENT' };
  }

  return {
    code: 'DYNAMIC_SCOPE_BOUNDED',
    name,
    depth: candidate.depth,
    ref: encodePointer(candidate.segments),
  };
}

function extractDialectFromSchemaKeyword(
  schema: unknown
): JsonSchemaDialect | null {
  if (schema && typeof schema === 'object') {
    const sch = (schema as Record<string, unknown>)['$schema'];
    if (typeof sch === 'string') {
      const lowered = sch.toLowerCase();
      if (lowered.includes('2020-12')) return '2020-12';
      if (lowered.includes('2019-09')) return '2019-09';
      if (lowered.includes('draft-2019')) return '2019-09';
      if (lowered.includes('draft-07') || lowered.includes('draft-06')) {
        return 'draft-07';
      }
      if (lowered.includes('draft-04') || lowered.endsWith('/schema#')) {
        return 'draft-04';
      }
    }
  }
  return null;
}

interface DialectFeatureFlags {
  dynamic: boolean;
  recursive: boolean;
  defs: boolean;
  definitions: boolean;
  legacyId: boolean;
}

function detectDialectFeatures(schema: unknown): DialectFeatureFlags {
  const flags: DialectFeatureFlags = {
    dynamic: false,
    recursive: false,
    defs: false,
    definitions: false,
    legacyId: false,
  };

  if (!schema || typeof schema !== 'object') {
    return flags;
  }

  const queue: Record<string, unknown>[] = [schema as Record<string, unknown>];
  const seen = new WeakSet<object>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);

    if (!flags.dynamic) {
      const dynamicRef = current['$dynamicRef'];
      const dynamicAnchor = current['$dynamicAnchor'];
      flags.dynamic =
        typeof dynamicRef === 'string' ||
        typeof dynamicAnchor === 'string' ||
        Object.prototype.hasOwnProperty.call(current, 'unevaluatedItems') ||
        Object.prototype.hasOwnProperty.call(
          current,
          'unevaluatedProperties'
        ) ||
        Object.prototype.hasOwnProperty.call(current, 'prefixItems');
    }
    if (!flags.recursive) {
      const recursiveAnchor = current['$recursiveAnchor'];
      const recursiveRef = current['$recursiveRef'];
      flags.recursive =
        typeof recursiveAnchor === 'boolean' ||
        typeof recursiveRef === 'string';
    }
    if (!flags.defs) {
      flags.defs = Object.prototype.hasOwnProperty.call(current, '$defs');
    }
    if (!flags.definitions) {
      flags.definitions = Object.prototype.hasOwnProperty.call(
        current,
        'definitions'
      );
    }
    if (!flags.legacyId) {
      const hasId = Object.prototype.hasOwnProperty.call(current, 'id');
      const hasDollarId = Object.prototype.hasOwnProperty.call(current, '$id');
      flags.legacyId = hasId && !hasDollarId;
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          for (const element of value) {
            if (element && typeof element === 'object') {
              queue.push(element as Record<string, unknown>);
            }
          }
        } else {
          queue.push(value as Record<string, unknown>);
        }
      }
    }
  }

  return flags;
}

function extractDynamicRefName(ref: string): string | null {
  if (typeof ref !== 'string' || !ref.startsWith('#')) {
    return null;
  }
  const raw = ref.slice(1);
  if (!raw || raw.includes('/')) {
    return null;
  }
  return decodePointerToken(raw);
}

function parsePointer(pointer: string): string[] | null {
  if (typeof pointer !== 'string') {
    return null;
  }
  const withoutHash = pointer.startsWith('#') ? pointer.slice(1) : pointer;
  if (withoutHash === '') {
    return [];
  }
  const trimmed = withoutHash.startsWith('/')
    ? withoutHash.slice(1)
    : withoutHash;
  if (trimmed === '') {
    return [];
  }
  return trimmed.split('/').map(decodePointerToken);
}

function encodePointer(segments: string[]): string {
  if (!segments.length) {
    return '#';
  }
  const encoded = segments.map(encodePointerToken).join('/');
  return `#/${encoded}`;
}

function encodePointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

function decodePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function normalizeDynamicNodeSegments(
  root: unknown,
  segments: string[]
): string[] | null {
  const node = getByPointer(root, segments);
  if (isRecord(node)) {
    if (typeof node['$dynamicRef'] !== 'string') {
      return null;
    }
    return segments;
  }

  if (segments.length > 0 && segments[segments.length - 1] === '$dynamicRef') {
    const parentSegments = segments.slice(0, -1);
    const parent = getByPointer(root, parentSegments);
    if (isRecord(parent) && typeof parent['$dynamicRef'] === 'string') {
      return parentSegments;
    }
  }

  return null;
}

function getByPointer(root: unknown, segments: string[]): unknown {
  let cursor: unknown = root;
  for (const segment of segments) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return undefined;
      }
      cursor = cursor[index];
    } else if (isRecord(cursor)) {
      cursor = cursor[segment];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasRefBoundaryOnPath(
  root: unknown,
  targetSegments: string[]
): boolean {
  for (let i = 0; i < targetSegments.length; i++) {
    const ancestorSegments = targetSegments.slice(0, i);
    const node = getByPointer(root, ancestorSegments);
    if (
      isRecord(node) &&
      (typeof node['$ref'] === 'string' ||
        typeof node['$dynamicRef'] === 'string')
    ) {
      return true;
    }
  }
  return false;
}

interface AnchorCandidate {
  segments: string[];
  depth: number;
}

function findDynamicAnchorCandidate(
  root: unknown,
  targetSegments: string[],
  name: string,
  maxHops: number
): AnchorCandidate | null {
  const limit = Math.min(maxHops, targetSegments.length);
  for (let depth = 1; depth <= limit; depth++) {
    const ancestorSegments = targetSegments.slice(
      0,
      targetSegments.length - depth
    );
    const node = getByPointer(root, ancestorSegments);
    if (isRecord(node) && node['$dynamicAnchor'] === name) {
      return { segments: ancestorSegments, depth };
    }
  }
  return null;
}

function hasAnchorCollisionAbove(
  root: unknown,
  anchorSegments: string[],
  name: string
): boolean {
  for (let depth = 1; depth <= anchorSegments.length; depth++) {
    const ancestorSegments = anchorSegments.slice(
      0,
      anchorSegments.length - depth
    );
    const node = getByPointer(root, ancestorSegments);
    if (isRecord(node) && node['$dynamicAnchor'] === name) {
      return true;
    }
  }
  return false;
}
