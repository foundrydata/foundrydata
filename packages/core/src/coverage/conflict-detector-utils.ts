import type { CoverageTarget } from '@foundrydata/shared';

export function stripHashPrefix(canonPath?: string): string {
  if (!canonPath) {
    return '';
  }
  if (canonPath.startsWith('#')) {
    return canonPath.slice(1);
  }
  return canonPath;
}

export function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function encodePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function buildPropertyCanonPath(
  ownerCanonPath: string | undefined,
  propertyName: string
): string | undefined {
  const encodedName = encodePointerSegment(propertyName);
  const ownerPointer = stripHashPrefix(ownerCanonPath);
  if (!ownerPointer) {
    return `#/properties/${encodedName}`;
  }
  const baseSegments = ownerPointer
    .split('/')
    .filter((segment) => segment.length > 0);
  const base = baseSegments.join('/');
  const pointer =
    base.length > 0
      ? `${base}/properties/${encodedName}`
      : `properties/${encodedName}`;
  return `#/${pointer}`;
}

export function isPathUnderUnsat(
  canonPath: string | undefined,
  unsatPaths?: Set<string>
): boolean {
  if (!canonPath || !unsatPaths || unsatPaths.size === 0) {
    return false;
  }
  for (const unsatPath of unsatPaths) {
    if (!unsatPath) {
      continue;
    }
    if (canonPath === unsatPath) {
      return true;
    }
    if (
      canonPath.startsWith(unsatPath) &&
      (canonPath.length === unsatPath.length ||
        canonPath.charAt(unsatPath.length) === '/' ||
        (unsatPath.endsWith('/') && canonPath.startsWith(unsatPath)))
    ) {
      return true;
    }
  }
  return false;
}

// eslint-disable-next-line complexity
export function resolveSchemaNode(
  schema: unknown,
  canonPath?: string
): unknown {
  if (!canonPath || !schema || typeof schema !== 'object') {
    return schema;
  }
  const pointer = stripHashPrefix(canonPath);
  if (pointer === '') {
    return schema;
  }
  const segments = pointer.split('/').filter((segment) => segment.length > 0);
  let current: unknown = schema;
  for (const rawSegment of segments) {
    const segment = decodePointerSegment(rawSegment);
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (Number.isInteger(index) && index >= 0 && index < current.length) {
        current = current[index];
        continue;
      }
      return undefined;
    }
    if (
      current &&
      typeof current === 'object' &&
      Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

export function getBranchCountForTarget(
  target: CoverageTarget,
  schemaNode: unknown
): number | undefined {
  if (Array.isArray(schemaNode)) {
    return schemaNode.length;
  }
  if (!schemaNode || typeof schemaNode !== 'object') {
    return undefined;
  }
  switch (target.kind) {
    case 'ONEOF_BRANCH':
      return Array.isArray((schemaNode as Record<string, unknown>).oneOf)
        ? ((schemaNode as Record<string, unknown>).oneOf as unknown[]).length
        : undefined;
    case 'ANYOF_BRANCH':
      return Array.isArray((schemaNode as Record<string, unknown>).anyOf)
        ? ((schemaNode as Record<string, unknown>).anyOf as unknown[]).length
        : undefined;
    default:
      return undefined;
  }
}
