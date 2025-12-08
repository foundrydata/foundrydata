import type { ContainsNeed } from './arrays/contains-bag.js';
import { DIAGNOSTIC_CODES } from '../diag/codes.js';
import type {
  CoverageIndex,
  ComposeDiagnostics,
} from './composition-engine.js';

export interface VisitContext {
  hasUnevaluatedGuard: boolean;
}

export function hasUnevaluatedGuard(schema: unknown): boolean {
  if (schema && typeof schema === 'object') {
    const node = schema as Record<string, unknown>;
    if (
      node.unevaluatedProperties === false ||
      node.unevaluatedItems === false
    ) {
      return true;
    }

    if (Array.isArray(node.allOf)) {
      return node.allOf.some((sub) => hasUnevaluatedGuard(sub));
    }
  }

  return false;
}

function isSimpleObjectType(node: Record<string, unknown>): boolean {
  const type = node.type;
  return !type || type === 'object';
}

function hasDisallowedComposition(node: Record<string, unknown>): boolean {
  return Boolean(node.anyOf || node.oneOf || node.not || node.if);
}

function hasLocalUnevaluated(node: Record<string, unknown>): boolean {
  return (
    node.unevaluatedProperties !== undefined ||
    node.unevaluatedItems !== undefined
  );
}

function hasPlainProperties(node: Record<string, unknown>): boolean {
  return Boolean(node.properties && typeof node.properties === 'object');
}

function hasPlainPropertiesInAllOf(node: Record<string, unknown>): boolean {
  const allOf = Array.isArray(node.allOf) ? node.allOf : undefined;
  if (!allOf) return false;

  return allOf.some((branch) => {
    if (!branch || typeof branch !== 'object') return false;
    const branchNode = branch as Record<string, unknown>;
    if (!isSimpleObjectType(branchNode)) return false;
    if (hasDisallowedComposition(branchNode)) return false;
    if (branchNode.additionalProperties === false) return false;
    if (hasLocalUnevaluated(branchNode)) return false;
    return hasPlainProperties(branchNode);
  });
}

export function isSimpleObjectCandidate(
  schema: unknown,
  ctx: VisitContext
): boolean {
  if (!schema || typeof schema !== 'object') return false;
  if (ctx.hasUnevaluatedGuard) return false;

  const node = schema as Record<string, unknown>;
  if (!isSimpleObjectType(node)) return false;
  if (hasDisallowedComposition(node)) return false;

  if (node.additionalProperties === false) return false;
  if (hasLocalUnevaluated(node)) return false;
  if (!hasPlainProperties(node) && !hasPlainPropertiesInAllOf(node)) {
    return false;
  }

  return true;
}

function isArrayType(node: Record<string, unknown>): boolean {
  const type = node.type;
  return !type || type === 'array';
}

function hasTupleOrPrefixItems(node: Record<string, unknown>): boolean {
  return Boolean(node.prefixItems || Array.isArray(node.items));
}

function hasSimpleContains(node: Record<string, unknown>): boolean {
  return Boolean(node.contains && typeof node.contains === 'object');
}

function hasArrayUnevaluated(node: Record<string, unknown>): boolean {
  return (
    node.uniqueItems === true ||
    node.unevaluatedItems !== undefined ||
    node.unevaluatedProperties !== undefined
  );
}

export type ContainsKind = 'none' | 'simple' | 'complex';

export interface ComposeArtifacts {
  coverageIndex?: CoverageIndex;
  containsBag?: Map<string, ContainsNeed[]>;
  diag?: ComposeDiagnostics;
}

export function isSimpleArrayItemsContainsCandidate(
  schema: unknown,
  ctx: VisitContext,
  containsKind: ContainsKind
): boolean {
  if (!schema || typeof schema !== 'object') return false;
  if (ctx.hasUnevaluatedGuard) return false;

  const node = schema as Record<string, unknown>;
  if (!isArrayType(node)) return false;
  if (hasTupleOrPrefixItems(node)) return false;
  if (!hasSimpleContains(node)) return false;
  if (containsKind !== 'simple') return false;
  if (hasArrayUnevaluated(node)) return false;

  return true;
}

function getAtPath<T>(
  map: Map<string, T> | undefined,
  canonPath: string
): T | undefined {
  const variants = [
    canonPath,
    canonPath === '#' ? '' : undefined,
    canonPath.startsWith('#') ? canonPath.slice(1) : undefined,
  ];
  for (const key of variants) {
    if (key === undefined) continue;
    const value = map?.get(key);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function isMustCover(
  canonPath: string,
  coverageIndex: CoverageIndex | undefined,
  schema: unknown
): boolean {
  const node =
    schema && typeof schema === 'object'
      ? (schema as Record<string, unknown>)
      : undefined;
  if (node?.additionalProperties === false) {
    return true;
  }
  const entry = getAtPath(coverageIndex, canonPath);
  if (!entry) return false;
  if (Array.isArray(entry.provenance) && entry.provenance.length > 0) {
    return true;
  }
  return false;
}

function hasContainsDiagIssues(
  canonPath: string,
  diag: ComposeDiagnostics | undefined
): boolean {
  const codes = new Set<string>([
    DIAGNOSTIC_CODES.COMPLEXITY_CAP_CONTAINS,
    DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM,
    DIAGNOSTIC_CODES.CONTAINS_NEED_MIN_GT_MAX,
  ]);
  const matches = (entries: ComposeDiagnostics['warn']): boolean =>
    Boolean(
      entries?.some(
        (entry) => entry?.canonPath === canonPath && codes.has(entry.code)
      )
    );
  return matches(diag?.fatal) || matches(diag?.warn);
}

export function summarizeContainsKind(
  canonPath: string,
  schema: Record<string, unknown>,
  artifacts: ComposeArtifacts | undefined
): ContainsKind {
  const bag = getAtPath(artifacts?.containsBag, canonPath);
  const bagSize = bag?.length ?? 0;
  if (bagSize > 0) {
    if (bagSize > 1) return 'complex';
    if (hasContainsDiagIssues(canonPath, artifacts?.diag)) return 'complex';
    return 'simple';
  }
  if (!hasSimpleContains(schema)) return 'none';
  if (bagSize > 1) return 'complex';
  if (hasContainsDiagIssues(canonPath, artifacts?.diag)) return 'complex';
  return 'simple';
}
