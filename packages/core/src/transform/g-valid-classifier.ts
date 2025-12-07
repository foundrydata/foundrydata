import type { ContainsNeed } from './arrays/contains-bag.js';
import { DIAGNOSTIC_CODES } from '../diag/codes.js';
import type {
  CoverageIndex,
  ComposeDiagnostics,
} from './composition-engine.js';

/**
 * G_valid motif types (v1 baseline and related non-G_valid motifs).
 */
export enum GValidMotif {
  None = 'none',
  SimpleObjectRequired = 'simpleObjectRequired',
  ArrayContainsSimple = 'arrayContainsSimple',
  ApFalseMustCover = 'apFalseMustCover',
  ComplexContains = 'complexContains',
}

/**
 * Per-path G_valid classification result.
 */
export interface GValidInfo {
  /** Canonical path for this classification (e.g. "#/properties/items"). */
  canonPath: string;
  /** Motif detected at this location. */
  motif: GValidMotif;
  /** Whether this location is considered inside the G_valid zone v1. */
  isGValid: boolean;
}

/**
 * Internal map from canonPath to G_valid classification.
 */
export type GValidClassificationIndex = Map<string, GValidInfo>;

/**
 * Helper to create a non-G_valid entry with no specific motif.
 */
export function makeGValidNone(canonPath: string): GValidInfo {
  return {
    canonPath,
    motif: GValidMotif.None,
    isGValid: false,
  };
}

/**
 * Helper to create a baseline G_valid v1 entry for a given motif.
 */
export function makeGValidMotif(
  canonPath: string,
  motif: GValidMotif.SimpleObjectRequired | GValidMotif.ArrayContainsSimple
): GValidInfo {
  return {
    canonPath,
    motif,
    isGValid: true,
  };
}

function hasUnevaluatedGuard(schema: unknown): boolean {
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

interface VisitContext {
  hasUnevaluatedGuard: boolean;
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

function isSimpleObjectCandidate(schema: unknown, ctx: VisitContext): boolean {
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

function isSimpleArrayItemsContainsCandidate(
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

type ContainsKind = 'none' | 'simple' | 'complex';

interface ComposeArtifacts {
  coverageIndex?: CoverageIndex;
  containsBag?: Map<string, ContainsNeed[]>;
  diag?: ComposeDiagnostics;
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

function isMustCover(
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

function summarizeContainsKind(
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

function classifyNode(
  schema: unknown,
  canonPath: string,
  ctx: VisitContext,
  artifacts: ComposeArtifacts | undefined
): GValidInfo {
  const coverageIndex = artifacts?.coverageIndex;
  const mustCover = isMustCover(canonPath, coverageIndex, schema);

  if (mustCover) {
    return {
      canonPath,
      motif: GValidMotif.ApFalseMustCover,
      isGValid: false,
    };
  }

  if (isSimpleObjectCandidate(schema, ctx)) {
    return makeGValidMotif(canonPath, GValidMotif.SimpleObjectRequired);
  }

  if (schema && typeof schema === 'object') {
    const node = schema as Record<string, unknown>;
    const containsKind = summarizeContainsKind(canonPath, node, artifacts);
    if (containsKind === 'complex') {
      return {
        canonPath,
        motif: GValidMotif.ComplexContains,
        isGValid: false,
      };
    }
    if (isSimpleArrayItemsContainsCandidate(schema, ctx, containsKind)) {
      return makeGValidMotif(canonPath, GValidMotif.ArrayContainsSimple);
    }
  }

  return makeGValidNone(canonPath);
}

interface WalkerEnv {
  artifacts?: ComposeArtifacts;
  out: GValidClassificationIndex;
}

function visitChildren(
  node: Record<string, unknown>,
  canonPath: string,
  ctx: VisitContext,
  env: WalkerEnv
): void {
  const nestedKeys: Array<keyof typeof node> = [
    'properties',
    'items',
    'contains',
    'allOf',
    'anyOf',
    'oneOf',
    'then',
    'else',
  ];

  nestedKeys.forEach((key) => {
    const value = node[key as string];
    if (!value) return;

    if (key === 'properties' && typeof value === 'object') {
      const props = value as Record<string, unknown>;
      for (const [propName, sub] of Object.entries(props)) {
        const base =
          canonPath === '#' ? '#/properties' : `${canonPath}/properties`;
        const childPath = `${base}/${propName}`;
        walkSchema(sub, childPath, ctx, env);
      }
    } else if (key === 'items') {
      const childPath = canonPath === '#' ? '#/items' : `${canonPath}/items`;
      walkSchema(value, childPath, ctx, env);
    } else if (key === 'contains') {
      const childPath =
        canonPath === '#' ? '#/contains' : `${canonPath}/contains`;
      walkSchema(value, childPath, ctx, env);
    } else if (Array.isArray(value)) {
      value.forEach((sub, index) => {
        const childPath =
          canonPath === '#'
            ? `#/${key}/${index}`
            : `${canonPath}/${key}/${index}`;
        walkSchema(sub, childPath, ctx, env);
      });
    }
  });
}

function walkSchema(
  schema: unknown,
  canonPath: string,
  ctx: VisitContext,
  env: WalkerEnv
): void {
  if (!schema || typeof schema !== 'object') return;

  const node = schema as Record<string, unknown>;
  const nextCtx: VisitContext = {
    hasUnevaluatedGuard: ctx.hasUnevaluatedGuard || hasUnevaluatedGuard(schema),
  };

  const info = classifyNode(schema, canonPath, nextCtx, env.artifacts);
  env.out.set(canonPath, info);

  visitChildren(node, canonPath, nextCtx, env);
}

export function classifyGValid(
  canonicalSchema: unknown,
  composeArtifacts?: ComposeArtifacts
): GValidClassificationIndex {
  const out: GValidClassificationIndex = new Map();
  const env: WalkerEnv = {
    artifacts: composeArtifacts,
    out,
  };

  walkSchema(canonicalSchema, '#', { hasUnevaluatedGuard: false }, env);

  return out;
}
