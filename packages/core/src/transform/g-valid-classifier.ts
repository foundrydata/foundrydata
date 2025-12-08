import {
  isDiscriminatedUnionCandidate,
  isSimpleConditionalCandidate,
} from './g-valid-extended.js';
import {
  type ComposeArtifacts,
  type VisitContext,
  hasUnevaluatedGuard,
  isMustCover,
  isSimpleArrayItemsContainsCandidate,
  isSimpleObjectCandidate,
  summarizeContainsKind,
} from './g-valid-baseline-helpers.js';

/**
 * G_valid motif types (v1 baseline and related non-G_valid motifs).
 */
export enum GValidMotif {
  None = 'none',
  SimpleObjectRequired = 'simpleObjectRequired',
  ArrayContainsSimple = 'arrayContainsSimple',
  ApFalseMustCover = 'apFalseMustCover',
  ComplexContains = 'complexContains',
  SimpleConditionalObject = 'simpleConditionalObject',
  DiscriminatedUnionObject = 'discriminatedUnionObject',
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
  motif: GValidMotif
): GValidInfo {
  return {
    canonPath,
    motif,
    isGValid: true,
  };
}

// eslint-disable-next-line max-lines-per-function
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

    // Extended G_valid motifs (v2): apply only after baseline motifs
    // so that must-cover/AP:false and v1 shapes win precedence.
    // For now, only classify conditionals at top-level / properties paths,
    // and avoid conditionals nested under allOf merges (which often
    // participate in AP:false / must-cover interplay like simple.json).
    const isEligiblePathForExtended = !canonPath.includes('/allOf/');
    if (isEligiblePathForExtended) {
      if (isSimpleConditionalCandidate(node, ctx)) {
        return makeGValidMotif(canonPath, GValidMotif.SimpleConditionalObject);
      }
      if (isDiscriminatedUnionCandidate(node, ctx)) {
        return makeGValidMotif(canonPath, GValidMotif.DiscriminatedUnionObject);
      }
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
