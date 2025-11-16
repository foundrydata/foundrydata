/* eslint-disable complexity */
/* eslint-disable max-depth */
/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
import type Ajv from 'ajv';

import { DIAGNOSTIC_CODES } from '../diag/codes.js';
import type { DiagnosticEnvelope } from '../diag/validate.js';

export type PipelineMode = 'strict' | 'lax';

export type ExternalRefIneligibilityReason =
  | 'no-external-refs'
  | 'no-compile-errors'
  | 'non-ref-error'
  | 'missing-ref-value'
  | 'failing-ref-mismatch'
  | 'probe-failed';

export interface ExternalRefClassification {
  extRefs: string[];
  failingRefs: string[];
  exemplar?: string;
  skipEligible: boolean;
  reason?: ExternalRefIneligibilityReason;
}

export interface ExternalRefFailureAnalysisOptions {
  schema: unknown;
  error: unknown;
  createSourceAjv: () => Ajv;
}

export interface ExternalRefSummaryOptions {
  exclude?: (ref: string) => boolean;
}

export interface ExternalRefSummary {
  extRefs: string[];
  exemplar?: string;
}

const ABSOLUTE_URI_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const SYNTHETIC_ROOT_BASE = 'json-schema://fd.internal/root';

export function classifyExternalRefFailure(
  options: ExternalRefFailureAnalysisOptions
): ExternalRefClassification {
  const { schema, error, createSourceAjv } = options;
  const { extRefs, rawExtRefs, canonicalLookup, probe } =
    collectExternalRefsAndProbe(schema);
  const extRefList = Array.from(extRefs);

  const errorSummary = analyzeCompileError(error);
  const failingRefs = Array.from(errorSummary.refValues);

  if (errorSummary.total === 0) {
    return {
      extRefs: extRefList,
      failingRefs,
      skipEligible: false,
      reason: 'no-compile-errors',
    };
  }

  if (extRefList.length === 0) {
    return {
      extRefs: extRefList,
      failingRefs,
      skipEligible: false,
      reason: 'no-external-refs',
    };
  }

  let reason: ExternalRefIneligibilityReason | undefined;
  let skipEligible = true;

  if (errorSummary.hasNonRefError) {
    skipEligible = false;
    reason = 'non-ref-error';
  }

  if (errorSummary.missingRefValue) {
    skipEligible = false;
    reason = reason ?? 'missing-ref-value';
  }

  const mismatch = failingRefs.some((ref) => {
    const canonical = canonicalLookup.get(ref) ?? ref;
    return !extRefs.has(canonical);
  });
  if (mismatch) {
    skipEligible = false;
    reason = reason ?? 'failing-ref-mismatch';
  }

  if (skipEligible) {
    try {
      const ajv = createSourceAjv();
      if (isSchemaLike(probe)) {
        ajv.compile(probe);
      } else {
        skipEligible = false;
        reason = 'probe-failed';
      }
    } catch {
      skipEligible = false;
      reason = 'probe-failed';
    }
  }

  const exemplar = selectExemplar(extRefs.size > 0 ? extRefs : rawExtRefs);

  return {
    extRefs: extRefList,
    failingRefs,
    exemplar,
    skipEligible,
    reason,
  };
}

type ExternalRefStrictPolicy = 'error' | 'warn' | 'ignore';

export function createExternalRefDiagnostic(
  mode: PipelineMode,
  classification: ExternalRefClassification,
  options: {
    skipValidation?: boolean;
    policy?: ExternalRefStrictPolicy;
  } = {}
): DiagnosticEnvelope {
  const details: Record<string, unknown> = { mode };
  let metrics: DiagnosticEnvelope['metrics'] | undefined;
  const shouldSkip = options.skipValidation ?? mode === 'lax';
  if (classification.exemplar) {
    details.ref = classification.exemplar;
  }
  if (classification.failingRefs && classification.failingRefs.length > 0) {
    details.failingRefs = Array.from(classification.failingRefs);
  }
  if (mode === 'lax' && shouldSkip) {
    details.skippedValidation = true;
    metrics = { validationsPerRow: 0 };
  }
  if (options.policy && options.policy !== 'error') {
    details.policy = options.policy;
  }
  return {
    code: DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED,
    canonPath: '',
    details,
    metrics,
  };
}

export function schemaHasExternalRefs(schema: unknown): boolean {
  return collectExternalRefsAndProbe(schema).extRefs.size > 0;
}

export function summarizeExternalRefs(
  schema: unknown,
  options?: ExternalRefSummaryOptions
): ExternalRefSummary {
  const { extRefs, rawExtRefs } = collectExternalRefsAndProbe(schema);
  const filtered = new Set<string>();
  if (options?.exclude) {
    for (const ref of extRefs) {
      if (options.exclude(ref)) {
        continue;
      }
      filtered.add(ref);
    }
  } else {
    for (const ref of extRefs) {
      filtered.add(ref);
    }
  }
  if (filtered.size === 0) {
    return { extRefs: [], exemplar: undefined };
  }
  const exemplar = selectExemplar(filtered) ?? selectExemplar(rawExtRefs);
  return {
    extRefs: Array.from(filtered),
    exemplar,
  };
}

/**
 * Build a "probe" schema by replacing external $ref subtrees with {} while preserving
 * fragment-only refs and in-document structure. Used for Lax planning-time stubs.
 */
export function buildExternalRefProbeSchema(schema: unknown): {
  probe: unknown;
  extRefs: string[];
} {
  const { probe, extRefs } = collectExternalRefsAndProbe(schema);
  return { probe, extRefs: Array.from(extRefs) };
}

function collectExternalRefsAndProbe(schema: unknown): {
  extRefs: Set<string>;
  rawExtRefs: Set<string>;
  canonicalLookup: Map<string, string>;
  probe: unknown;
} {
  const seen = new WeakMap<object, unknown>();
  const extRefs = new Set<string>();
  const rawExtRefs = new Set<string>();
  const canonicalLookup = new Map<string, string>();

  const visit = (node: unknown, base: string): unknown => {
    if (node === null) {
      return null;
    }
    if (typeof node !== 'object') {
      return node;
    }

    if (seen.has(node as object)) {
      return seen.get(node as object) ?? node;
    }

    if (Array.isArray(node)) {
      const replacement: unknown[] = [];
      seen.set(node, replacement);
      for (const entry of node) {
        replacement.push(visit(entry, base));
      }
      return replacement;
    }

    const record = node as Record<string, unknown>;
    const effectiveBase = resolveIdBase(record, base);
    const refValue = record['$ref'];
    if (typeof refValue === 'string') {
      const resolvedRef = resolveRefAgainstBase(refValue, effectiveBase);
      const trimmed = refValue.trim();
      const canonicalRef = resolvedRef ?? trimmed;
      const external =
        canonicalRef !== '' &&
        (resolvedRef
          ? !isFragmentOnlyRef(resolvedRef, effectiveBase)
          : !trimmed.startsWith('#'));
      if (external) {
        if (canonicalRef) {
          extRefs.add(canonicalRef);
          canonicalLookup.set(canonicalRef, canonicalRef);
        }
        if (trimmed) {
          rawExtRefs.add(trimmed);
          if (canonicalRef) {
            canonicalLookup.set(trimmed, canonicalRef);
          }
        }
        const blank: Record<string, unknown> = {};
        seen.set(record, blank);
        return blank;
      }
    }

    const clone: Record<string, unknown> = {};
    seen.set(record, clone);
    for (const [key, value] of Object.entries(record)) {
      clone[key] = visit(value, effectiveBase);
    }
    return clone;
  };

  const probe = visit(schema, SYNTHETIC_ROOT_BASE);
  return { extRefs, rawExtRefs, canonicalLookup, probe };
}

function resolveIdBase(
  record: Record<string, unknown>,
  parentBase: string
): string {
  const rawId = record['$id'];
  if (typeof rawId !== 'string') {
    return parentBase;
  }
  const trimmed = rawId.trim();
  if (trimmed === '') {
    return parentBase;
  }
  const effectiveBase = ensureAbsoluteBase(parentBase);
  try {
    return new URL(trimmed, effectiveBase).href;
  } catch {
    try {
      return new URL(trimmed).href;
    } catch {
      return parentBase;
    }
  }
}

function resolveRefAgainstBase(
  value: string,
  base: string
): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  const effectiveBase = ensureAbsoluteBase(base);
  try {
    return new URL(trimmed, effectiveBase).href;
  } catch {
    try {
      if (ABSOLUTE_URI_PATTERN.test(trimmed)) {
        return new URL(trimmed).href;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function ensureAbsoluteBase(candidate: string | undefined): string {
  if (candidate && ABSOLUTE_URI_PATTERN.test(candidate)) {
    return candidate;
  }
  return SYNTHETIC_ROOT_BASE;
}

function isFragmentOnlyRef(resolved: string, base: string): boolean {
  try {
    const resolvedUrl = new URL(resolved);
    if (!resolvedUrl.hash) {
      return false;
    }
    const baseDoc = removeFragment(ensureAbsoluteBase(base));
    const resolvedDoc = removeFragment(resolvedUrl.href);
    return resolvedDoc === baseDoc;
  } catch {
    return false;
  }
}

function removeFragment(uri: string): string {
  try {
    const url = new URL(uri);
    url.hash = '';
    return url.href;
  } catch {
    const index = uri.indexOf('#');
    return index >= 0 ? uri.slice(0, index) : uri;
  }
}

function analyzeCompileError(error: unknown): CompileErrorSummary {
  const entries = enumerateAjvErrorObjects(error);
  if (entries.length === 0) {
    return {
      total: 0,
      refValues: new Set<string>(),
      hasNonRefError: false,
      missingRefValue: false,
    };
  }

  const refValues = new Set<string>();
  let hasNonRefError = false;
  let missingRefValue = false;

  for (const entry of entries) {
    const keyword = getKeyword(entry);
    const refValue = extractRefValue(entry);
    const effectiveKeyword = keyword ?? (refValue ? '$ref' : undefined);
    if (effectiveKeyword !== '$ref') {
      hasNonRefError = true;
    }
    if (!refValue) {
      missingRefValue = true;
    } else {
      refValues.add(refValue);
    }
  }

  return {
    total: entries.length,
    refValues,
    hasNonRefError,
    missingRefValue,
  };
}

function enumerateAjvErrorObjects(source: unknown): Record<string, unknown>[] {
  const stack: unknown[] = [source];
  const visited = new Set<unknown>();
  const results: Record<string, unknown>[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const obj = current as Record<string, unknown>;
    const errors = Array.isArray(obj.errors)
      ? (obj.errors as unknown[])
      : undefined;
    if (errors && errors.length > 0) {
      for (const entry of errors) {
        stack.push(entry);
      }
      continue;
    }

    results.push(obj);
    const cause = (obj as { cause?: unknown }).cause;
    if (cause !== undefined) {
      stack.push(cause);
    }
  }

  return results;
}

function getKeyword(entry: Record<string, unknown>): string | undefined {
  const raw = entry.keyword;
  return typeof raw === 'string' ? raw : undefined;
}

function extractRefValue(entry: Record<string, unknown>): string | undefined {
  const directMissing = entry.missingRef;
  if (typeof directMissing === 'string') {
    return directMissing.trim();
  }
  const directRef = entry.ref;
  if (typeof directRef === 'string') {
    return directRef.trim();
  }

  const params = entry.params;
  if (params && typeof params === 'object') {
    const refParam = (params as Record<string, unknown>).ref;
    if (typeof refParam === 'string') {
      return refParam.trim();
    }
    const missingParam = (params as Record<string, unknown>).missingRef;
    if (typeof missingParam === 'string') {
      return missingParam.trim();
    }
  }

  return undefined;
}

function selectExemplar(set: Set<string>): string | undefined {
  if (set.size === 0) {
    return undefined;
  }
  return Array.from(set).sort()[0];
}

function isSchemaLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

interface CompileErrorSummary {
  total: number;
  refValues: Set<string>;
  hasNonRefError: boolean;
  missingRefValue: boolean;
}
