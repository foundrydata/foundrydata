/* eslint-disable max-params */
/* eslint-disable max-lines */
/* eslint-disable max-depth */
/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DIAGNOSTIC_CODES, DIAGNOSTIC_PHASES } from '../diag/codes.js';
import type { CoverageIndex } from '../transform/composition-engine.js';
import type { ComposeResult } from '../transform/composition-engine.js';
import {
  createRepairOnlyValidatorAjv,
  extractAjvFlags,
  prepareSchemaForSourceAjv,
} from '../util/ajv-source.js';
import { structuralHash, bucketsEqual } from '../util/struct-hash.js';
import type { DiagnosticEnvelope } from '../diag/validate.js';
import type { PlanOptions } from '../types/options.js';
import type Ajv from 'ajv';
import {
  extractExactLiteralAlternatives,
  isRegexComplexityCapped,
  synthesizePatternExample,
} from '../util/pattern-literals.js';
import { resolveOptions } from '../types/options.js';
import type { MetricsCollector } from '../util/metrics.js';
import type { CoverageMode } from '@foundrydata/shared';
import type { CoverageEvent } from '../coverage/index.js';

export interface AjvErr {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
}

type AjvValidateFn = ((data: unknown) => boolean) & {
  errors?: AjvErr[];
};

export interface RepairCtx {
  ajv: Ajv;
  seed: number;
  budgetPerPath: number;
  ptrMap: Map<string, string>;
  rational?: PlanOptions['rational'];
  complexity?: PlanOptions['complexity'];
  /** Must-cover predicate exported by Compose per SPEC §8. */
  isNameInMustCover?: (canonPath: string, name: string) => boolean;
}

export interface RepairEpsilonDetails {
  epsilon?: string;
  delta?: 1 | -1;
}

export interface RenamePreflightResult {
  ok: boolean;
  candidate?: string;
  diagnostics?: DiagnosticEnvelope[];
}

export interface RenamePreflightOptions {
  // Canonical pointer of the object being repaired
  canonPath: string;
  // Current set of present property names in the object
  present: ReadonlySet<string>;
  // Whether additionalProperties:false is effective at this object
  apFalse: boolean;
  // Whether unevaluatedProperties:false applies at this object
  unevaluatedApplies?: boolean;
  // Check if a property name is evaluated under unevaluatedProperties:false guard
  isEvaluated?: (name: string) => boolean;
  // When true (default), enforce must-cover guard under AP:false
  mustCoverGuard?: boolean;
  // Coverage index from Compose phase, used to derive must-cover predicate
  coverageIndex?: CoverageIndex;
  // Optional explicit must-cover predicate (overrides coverageIndex)
  isNameInMustCover?: (canonPath: string, name: string) => boolean;
  // Names that must not be renamed due to required/dependent* constraints
  blockedSourceNames?: ReadonlySet<string>;
}

export interface RenamePreflightContext {
  validator: AjvValidateFn;
  current: unknown;
  objectPtr: string;
  from: string;
  candidate: string;
  canonPath: string;
  baselineDependentKeys: ReadonlySet<string>;
  baselineOneOfKeys?: ReadonlySet<string>;
}

export function runRenamePreflightCheck(ctx: RenamePreflightContext): {
  ok: boolean;
  diagnostics?: DiagnosticEnvelope[];
} {
  const draft = deepClone(ctx.current);
  const target = getByPointer(draft, ctx.objectPtr);
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return { ok: false, diagnostics: undefined };
  }
  renameKey(target as Record<string, unknown>, ctx.from, ctx.candidate);
  const passes = ctx.validator(draft);
  if (passes) return { ok: true };
  const previewErrors = (ctx.validator.errors ?? []) as AjvErr[];
  const propertyPtr = buildPropertyPointer(ctx.objectPtr || '', ctx.candidate);
  const targetPaths = new Set<string>([ctx.objectPtr || '', propertyPtr]);
  const dependentFailure = previewErrors.find((err) => {
    if (!isDependentConstraintError(err)) return false;
    const inst = err.instancePath || '';
    if (!targetPaths.has(inst)) return false;
    const key = makeErrorKey(err);
    return !ctx.baselineDependentKeys.has(key);
  });
  if (dependentFailure) {
    return {
      ok: false,
      diagnostics: [
        {
          code: DIAGNOSTIC_CODES.REPAIR_RENAME_PREFLIGHT_FAIL,
          canonPath: ctx.canonPath,
          phase: DIAGNOSTIC_PHASES.REPAIR,
          details: {
            from: ctx.from,
            to: ctx.candidate,
            reason: 'dependent',
          },
        },
      ],
    };
  }
  const branchFailure = previewErrors.find((err) => {
    if (err.keyword !== 'oneOf') return false;
    if ((err.instancePath || '') !== (ctx.objectPtr || '')) return false;
    const key = makeErrorKey(err);
    if (ctx.baselineOneOfKeys && ctx.baselineOneOfKeys.has(key)) {
      return false;
    }
    return true;
  });
  if (branchFailure) {
    return {
      ok: false,
      diagnostics: [
        {
          code: DIAGNOSTIC_CODES.REPAIR_RENAME_PREFLIGHT_FAIL,
          canonPath: ctx.canonPath,
          phase: DIAGNOSTIC_PHASES.REPAIR,
          details: {
            from: ctx.from,
            to: ctx.candidate,
            reason: 'branch',
          },
        },
      ],
    };
  }
  return { ok: true };
}

// SPEC §10 — epsilon logging: exact string "1e-<decimalPrecision>"
export function formatEpsilon(decimalPrecision: number): string {
  const p = Math.trunc(decimalPrecision);
  if (!(p >= 1 && p <= 100)) {
    // Clamp conservatively to reasonable bounds
    const clamped = Math.min(100, Math.max(1, p));
    return `1e-${clamped}`;
  }
  return `1e-${p}`;
}

// SPEC §10 — exclusive bounds nudges
export function nudgeDetailsForExclusive(opts: {
  integer: boolean;
  decimalPrecision: number;
  direction: 'up' | 'down';
}): RepairEpsilonDetails {
  if (opts.integer) {
    // Integer targets nudge by ±1; epsilon optional per SPEC
    return { delta: opts.direction === 'up' ? 1 : -1 };
  }
  return { epsilon: formatEpsilon(opts.decimalPrecision) };
}

// SPEC §10 — closed enum rename order: lexicographically smallest (UTF-16 code unit order)
export function chooseClosedEnumRenameCandidate(
  offendingKey: string,
  enumValues: readonly string[],
  options: RenamePreflightOptions
): RenamePreflightResult {
  const {
    canonPath,
    present,
    apFalse,
    mustCoverGuard = true,
    coverageIndex,
    isNameInMustCover,
    unevaluatedApplies,
    isEvaluated,
  } = options;

  const diagnostics: DiagnosticEnvelope[] = [];

  // Never rename keys that are required or referenced by dependent* (antecedent/depender)
  if (
    options.blockedSourceNames &&
    options.blockedSourceNames.has(offendingKey)
  ) {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.REPAIR_RENAME_PREFLIGHT_FAIL,
      canonPath,
      phase: DIAGNOSTIC_PHASES.REPAIR,
      details: { from: offendingKey, to: offendingKey, reason: 'dependent' },
    });
    return { ok: false, diagnostics };
  }

  // Determine must-cover predicate
  const mcPredicate: ((cp: string, n: string) => boolean) | undefined =
    isNameInMustCover ??
    (coverageIndex
      ? (cp, n) => {
          const entry = coverageIndex.get(cp);
          return entry ? Boolean(entry.has(n)) : false;
        }
      : undefined);

  // When AP:false applies and guard enabled, ctx.isNameInMustCover is mandatory
  if (apFalse && mustCoverGuard && !mcPredicate) {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.MUSTCOVER_INDEX_MISSING,
      canonPath,
      phase: DIAGNOSTIC_PHASES.REPAIR,
      details: { guard: true },
    });
    return { ok: false, diagnostics };
  }

  // Build candidate set: enum minus present keys
  const presentSet = present;
  const candidates = enumValues
    .filter((n) => !presentSet.has(n))
    .slice()
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  let lastAttempted: string | undefined;
  for (const candidate of candidates) {
    if (
      apFalse &&
      mustCoverGuard &&
      mcPredicate &&
      !mcPredicate(canonPath, candidate)
    ) {
      // Not in must-cover ⇒ skip
      continue;
    }
    if (unevaluatedApplies && isEvaluated && !isEvaluated(candidate)) {
      // Evaluation guard failed under unevaluatedProperties:false
      lastAttempted = candidate;
      diagnostics.push({
        code: DIAGNOSTIC_CODES.REPAIR_EVAL_GUARD_FAIL,
        canonPath,
        phase: DIAGNOSTIC_PHASES.REPAIR,
        details: { from: offendingKey, to: candidate, reason: 'notEvaluated' },
      });
      // Try next candidate
      continue;
    }
    // Found valid candidate
    return {
      ok: true,
      candidate,
      diagnostics: diagnostics.length ? diagnostics : undefined,
    };
  }

  // No candidate passes preflight
  if (unevaluatedApplies && isEvaluated && lastAttempted) {
    // Emit a single fail reflecting last attempted or generic
    diagnostics.push({
      code: DIAGNOSTIC_CODES.REPAIR_RENAME_PREFLIGHT_FAIL,
      canonPath,
      phase: DIAGNOSTIC_PHASES.REPAIR,
      details: { from: offendingKey, to: lastAttempted, reason: 'branch' },
    });
  }
  return {
    ok: false,
    diagnostics: diagnostics.length ? diagnostics : undefined,
  };
}

export interface RepairEngineInit {
  coverageIndex?: CoverageIndex;
  decimalPrecision?: number; // defaults to 12
}

export class RepairEngine {
  private readonly coverageIndex?: CoverageIndex;
  private readonly decimalPrecision: number;

  constructor(init: RepairEngineInit = {}) {
    this.coverageIndex = init.coverageIndex;
    this.decimalPrecision = init.decimalPrecision ?? 12;
  }

  getEpsilon(): string {
    return formatEpsilon(this.decimalPrecision);
  }

  preflightClosedEnumRename(
    offendingKey: string,
    enumValues: readonly string[],
    options: Omit<RenamePreflightOptions, 'coverageIndex'>
  ): RenamePreflightResult {
    return chooseClosedEnumRenameCandidate(offendingKey, enumValues, {
      ...options,
      coverageIndex: this.coverageIndex,
    });
  }
}

// === AJV-driven application (limited scope: propertyNames enum rename, required+default) ===

function decodeJsonPointer(ptr: string): string[] {
  const s = ptr.startsWith('#') ? ptr.slice(1) : ptr;
  const noLead = s.startsWith('/') ? s.slice(1) : s;
  if (noLead.length === 0) return [];
  return noLead
    .split('/')
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function getByPointer(root: unknown, ptr: string): unknown {
  const segments = decodeJsonPointer(ptr);
  let cur: any = root;
  for (const seg of segments) {
    if (cur == null) return undefined;
    const idx = String(Number(seg)) === seg ? Number(seg) : seg;
    cur = cur[idx as any];
  }
  return cur;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setByPointer(root: unknown, ptr: string, value: unknown): boolean {
  const segments = decodeJsonPointer(ptr);
  if (segments.length === 0) return false;
  const last = segments.pop()!;
  let cur: any = root;
  for (const seg of segments) {
    if (cur == null) return false;
    const idx = String(Number(seg)) === seg ? Number(seg) : seg;
    cur = cur[idx as any];
  }
  if (cur == null) return false;
  const key: any = String(Number(last)) === last ? Number(last) : last;
  (cur as any)[key] = value;
  return true;
}

interface PointerResolution {
  origin: string;
  canon?: string;
}

interface PointerResolverOptions {
  propertyName?: string;
}

function stripPointerPrefix(ptr: string): string {
  if (!ptr) return '';
  return ptr.startsWith('#') ? ptr.slice(1) : ptr;
}

function decodePointerToPath(ptr: string): string {
  const segments = decodeJsonPointer(ptr);
  if (segments.length === 0) return '';
  return segments.join('/');
}

function createSchemaPointerResolver(
  schema: unknown,
  canonical: ComposeResult['canonical']
): (rawPtr: string, opts?: PointerResolverOptions) => PointerResolution {
  const cache = new Map<string, PointerResolution>();
  const revEntries = Array.from(canonical.revPtrMap.entries()).map(
    ([origin, canonList]) => ({
      origin,
      canon: canonList && canonList.length > 0 ? canonList[0] : undefined,
      decoded: decodePointerToPath(origin),
    })
  );

  return (rawPtr: string, opts?: PointerResolverOptions): PointerResolution => {
    const cacheKey =
      opts?.propertyName != null ? `${rawPtr}::${opts.propertyName}` : rawPtr;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const core = stripPointerPrefix(rawPtr);
    const normalizedRaw =
      core.length > 0 && core.startsWith('/') ? core.slice(1) : core;
    type Candidate = {
      origin: string;
      canon?: string;
      node: unknown;
      decoded: string;
    };
    const candidates: Candidate[] = [];

    const directNode = getByPointer(schema, rawPtr);
    if (directNode !== undefined) {
      const directCanon = canonical.revPtrMap.get(rawPtr)?.[0];
      candidates.push({
        origin: rawPtr,
        canon: directCanon,
        node: directNode,
        decoded: decodePointerToPath(rawPtr),
      });
    }

    for (const entry of revEntries) {
      if (normalizedRaw.length > 0 && !entry.decoded.endsWith(normalizedRaw)) {
        continue;
      }
      const node = getByPointer(schema, entry.origin);
      if (node === undefined) continue;
      candidates.push({
        origin: entry.origin,
        canon: entry.canon,
        node,
        decoded: entry.decoded,
      });
    }

    let filtered = candidates;
    if (opts?.propertyName) {
      filtered = candidates.filter((candidate) => {
        const props = (candidate.node as any)?.properties;
        return (
          props && typeof props === 'object' && opts.propertyName! in props
        );
      });
      if (filtered.length === 0) filtered = candidates;
    }

    if (filtered.length === 0) {
      const fallback: PointerResolution = { origin: rawPtr, canon: undefined };
      cache.set(cacheKey, fallback);
      return fallback;
    }

    filtered.sort((a, b) => {
      const lenA = a.decoded.length;
      const lenB = b.decoded.length;
      if (lenA !== lenB) return lenA - lenB;
      return a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : 0;
    });

    const chosen = filtered[0]!;
    const resolution: PointerResolution = {
      origin: chosen.origin,
      canon: chosen.canon,
    };
    cache.set(cacheKey, resolution);
    return resolution;
  };
}

function renameKey(
  target: Record<string, unknown>,
  from: string,
  to: string
): void {
  if (from === to) return;
  const hasFrom = Object.prototype.hasOwnProperty.call(target, from);
  if (!hasFrom) return;
  if (!Object.prototype.hasOwnProperty.call(target, to)) {
    target[to] = target[from];
  }
  delete target[from];
}

function detectDialect(
  schema: unknown
): '2020-12' | '2019-09' | 'draft-07' | 'draft-04' {
  if (schema && typeof schema === 'object') {
    const sch = (schema as Record<string, unknown>)['$schema'];
    if (typeof sch === 'string') {
      const lowered = sch.toLowerCase();
      if (lowered.includes('2020-12')) return '2020-12';
      if (lowered.includes('2019-09') || lowered.includes('draft-2019'))
        return '2019-09';
      if (lowered.includes('draft-07') || lowered.includes('draft-06'))
        return 'draft-07';
      if (lowered.includes('draft-04') || lowered.endsWith('/schema#'))
        return 'draft-04';
    }
  }
  return '2020-12';
}

function anyErrorAtPath(
  errors: AjvErr[],
  keyword: string,
  instancePath: string,
  propName?: string
): boolean {
  for (const err of errors) {
    if (err.keyword !== keyword) continue;
    if (err.instancePath !== instancePath) continue;
    if (propName) {
      // additionalProperties uses params.additionalProperty; unevaluatedProperties uses params.unevaluatedProperty
      const ap =
        (err.params as any).additionalProperty ??
        (err.params as any).unevaluatedProperty;
      if (ap !== undefined && ap !== propName) continue;
    }
    return true;
  }
  return false;
}

const DEPENDENT_KEYWORDS = new Set([
  'dependentRequired',
  'dependentSchemas',
  'dependencies',
]);

function isDependentConstraintError(err: AjvErr): boolean {
  if (DEPENDENT_KEYWORDS.has(err.keyword)) return true;
  const schemaPath = err.schemaPath || '';
  if (
    /\/(?:dependentSchemas|dependencies|dependentRequired)\//.test(schemaPath)
  ) {
    return true;
  }
  return false;
}

function encodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function buildPropertyPointer(objectPtr: string, name: string): string {
  const encoded = encodeJsonPointerSegment(name);
  if (!objectPtr || objectPtr === '#') {
    return objectPtr === '#' ? `#/${encoded}` : `/${encoded}`;
  }
  return `${objectPtr}/${encoded}`;
}

function makeErrorKey(err: AjvErr): string {
  return `${err.keyword}::${err.instancePath || ''}::${err.schemaPath}`;
}

function buildIsEvaluatedFn(
  ajvValidate: (data: unknown) => boolean,
  baseItem: any,
  objectPtr: string
): (name: string) => boolean {
  return (name: string) => {
    const draft = deepClone(baseItem);
    const parentAndKey = getByPointer(draft, objectPtr);
    if (
      parentAndKey &&
      typeof parentAndKey === 'object' &&
      !Array.isArray(parentAndKey)
    ) {
      (parentAndKey as Record<string, unknown>)[name] = null;
    } else {
      return true; // not an object; guard vacuous
    }
    const ok = ajvValidate(draft);
    const errors = (ajvValidate as any).errors as AjvErr[] | null | undefined;
    if (!errors || ok) {
      return true; // no unevaluatedProperties/additionalProperties complaints
    }
    return !(
      anyErrorAtPath(errors, 'unevaluatedProperties', objectPtr, name) ||
      anyErrorAtPath(errors, 'additionalProperties', objectPtr, name)
    );
  };
}

function normalizeSchemaPointerFromError(schemaPath: string): string {
  // Remove leading '#'
  const noHash = schemaPath.startsWith('#') ? schemaPath.slice(1) : schemaPath;
  return noHash;
}

function isUnderPropertyNames(schemaPtr: string): boolean {
  // True when the schema pointer path points inside a /propertyNames subtree
  return /\/propertyNames(?:\/|$)/.test(schemaPtr);
}

function codePointLength(value: string): number {
  // Count Unicode code points (surrogates count as 1)
  return Array.from(value).length;
}

function codePointSlice(value: string, endExclusive: number): string {
  // Return prefix of string with at most endExclusive code points
  if (endExclusive <= 0) return '';
  const arr = Array.from(value);
  if (arr.length <= endExclusive) return value;
  return arr.slice(0, endExclusive).join('');
}

function padToMinCodePoints(value: string, min: number, padChar = 'a'): string {
  const arr = Array.from(value);
  if (arr.length >= min) return value;
  const padCount = min - arr.length;
  return value + padChar.repeat(padCount);
}

function hasIntegerType(schemaNode: any): boolean {
  const t = schemaNode?.type;
  if (typeof t === 'string') return t === 'integer';
  if (Array.isArray(t)) return t.includes('integer');
  return false;
}

function epsilonNumber(decimalPrecision = 12): number {
  const p = Math.max(1, Math.min(100, Math.trunc(decimalPrecision)));
  // using base-10 epsilon as per SPEC
  return Math.pow(10, -p);
}

export interface RepairAction {
  action: string;
  canonPath: string;
  origPath?: string;
  instancePath?: string;
  details?: Record<string, unknown>;
}

export interface RepairItemsResult {
  items: unknown[];
  diagnostics: DiagnosticEnvelope[];
  actions: RepairAction[];
}

interface RepairCoverageOptions {
  mode: CoverageMode;
  emit: (event: CoverageEvent) => void;
}

function canonicalizeCoveragePath(pointer: string): string {
  if (!pointer) return '#';
  if (pointer.startsWith('#')) return pointer;
  if (pointer.startsWith('/')) return `#${pointer}`;
  return `#/${pointer}`;
}

function emitPropertyPresentFromRepair(
  coverage: RepairCoverageOptions | undefined,
  canonPath: string,
  propertyName: string
): void {
  if (!coverage) return;
  const mode = coverage.mode;
  if (mode !== 'measure' && mode !== 'guided') return;
  try {
    coverage.emit({
      dimension: 'structure',
      kind: 'PROPERTY_PRESENT',
      canonPath: canonicalizeCoveragePath(canonPath),
      params: { propertyName },
    });
  } catch {
    // Coverage hooks must never affect repair behavior.
  }
}

export function repairItemsAjvDriven(
  items: unknown[],
  args: {
    schema: unknown;
    effective: ComposeResult;
    planOptions?: Partial<PlanOptions>;
  },
  options?: {
    attempts?: number;
    metrics?: MetricsCollector;
    coverage?: RepairCoverageOptions;
  }
): RepairItemsResult {
  const { schema, effective } = args;
  const resolvedOptions = resolveOptions(args.planOptions);
  const bailLimit = Math.max(
    1,
    Math.trunc(resolvedOptions.complexity.bailOnUnsatAfter)
  );
  const attemptsOverride =
    options?.attempts !== undefined && Number.isFinite(options.attempts)
      ? Math.max(1, Math.trunc(options.attempts))
      : undefined;
  const baseAttempts = Math.max(1, Math.min(5, attemptsOverride ?? 1));
  const maxCycles = Math.min(bailLimit, baseAttempts);
  const metrics = options?.metrics;
  const coverage = options?.coverage;
  const dialect = detectDialect(schema);
  const sourceAjv = createRepairOnlyValidatorAjv({ dialect }, args.planOptions);
  const { schemaForAjv } = prepareSchemaForSourceAjv(schema, dialect);
  const validateFn = sourceAjv.compile(schemaForAjv as object);
  const ajvValidator = validateFn as AjvValidateFn;
  const ajvFlags = extractAjvFlags(sourceAjv);
  const decimalPrecision = ajvFlags.multipleOfPrecision ?? 12;
  const repairPlanOptions = resolvedOptions.repair;
  const mustCoverGuardEnabled = repairPlanOptions.mustCoverGuard !== false;

  const repaired: unknown[] = [];
  const diagnostics: DiagnosticEnvelope[] = [];
  const actions: RepairAction[] = [];
  const resolveSchemaPointer = createSchemaPointerResolver(
    schema,
    effective.canonical
  );
  for (const original of items) {
    // Fast-path: validate original without cloning to minimize overhead
    let pass = validateFn(original);
    if (pass) {
      repaired.push(original);
      continue;
    }

    let lastErrorCount =
      Array.isArray((validateFn as any).errors) &&
      (validateFn as any).errors.length > 0
        ? (validateFn as any).errors.length
        : 0;
    let cycles = 0;
    let current = deepClone(original);

    type RenameRegistryEntry =
      | { status: 'renamed' }
      | {
          status: 'pendingDelete';
          canonPath: string;
          from: string;
          mustCover: boolean;
          reason: 'deletedNoSafeName' | 'deletedMustCoverRejected';
        };
    const renameRegistry = new Map<string, RenameRegistryEntry>();
    const makeRenameKey = (ptr: string, name: string): string =>
      `${ptr}::${name}`;

    const attemptPropertyNamesRectification = (
      offending: string,
      objectPtr: string,
      parentPtr: string,
      errors: AjvErr[],
      baselineDependentKeys: ReadonlySet<string>
    ): { attempted: boolean; renamed: boolean } => {
      const key = makeRenameKey(objectPtr, offending);
      const existing = renameRegistry.get(key);
      if (existing) {
        return {
          attempted: true,
          renamed: existing.status === 'renamed',
        };
      }

      const obj = getByPointer(current, objectPtr);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return { attempted: false, renamed: false };
      }
      const resolvedParent = resolveSchemaPointer(parentPtr);
      const objectSchema = getByPointer(schema, resolvedParent.origin) as any;
      if (!objectSchema || typeof objectSchema !== 'object') {
        return { attempted: false, renamed: false };
      }

      const pnames = objectSchema.propertyNames;
      if (!pnames || typeof pnames !== 'object') {
        return { attempted: false, renamed: false };
      }

      let enumValues: string[] | undefined;
      if (Array.isArray(pnames.enum)) {
        enumValues = (pnames.enum as unknown[]).filter(
          (value): value is string => typeof value === 'string'
        );
      } else if (typeof pnames.const === 'string') {
        enumValues = [pnames.const];
      }
      if (
        (!enumValues || enumValues.length === 0) &&
        typeof pnames.pattern === 'string'
      ) {
        const patternSource = pnames.pattern;
        if (!isRegexComplexityCapped(patternSource)) {
          try {
            // Ensure the pattern compiles with the unicode flag before parsing literals
            new RegExp(patternSource, 'u');
            const literals = extractExactLiteralAlternatives(patternSource);
            if (literals && literals.length > 0) {
              enumValues = literals;
            }
          } catch {
            // ignore invalid patterns
          }
        }
      }
      if (!enumValues || enumValues.length === 0) {
        return { attempted: false, renamed: false };
      }

      const canonPath = resolvedParent.canon ?? resolvedParent.origin;
      const canonicalNode = getByPointer(
        effective.canonical.schema,
        canonPath
      ) as any;
      const apFalse = canonicalNode?.additionalProperties === false;
      const mustCoverActive = apFalse && mustCoverGuardEnabled;
      const present = new Set(Object.keys(obj as Record<string, unknown>));
      const unevalApplies =
        objectSchema?.unevaluatedProperties === false ||
        anyErrorAtPath(errors, 'unevaluatedProperties', objectPtr);
      const isEvaluated = buildIsEvaluatedFn(
        validateFn as any,
        current,
        objectPtr
      );

      const protectedNames = new Set<string>();
      if (Array.isArray(objectSchema?.required)) {
        for (const n of objectSchema.required as unknown[]) {
          if (typeof n === 'string') protectedNames.add(n);
        }
      }
      const depReq =
        (objectSchema as any)?.dependentRequired ??
        (objectSchema as any)?.dependencies;
      if (depReq && typeof depReq === 'object') {
        for (const key of Object.keys(depReq as Record<string, unknown>)) {
          protectedNames.add(key);
          const val = (depReq as any)[key];
          if (Array.isArray(val)) {
            for (const v of val) {
              if (typeof v === 'string') protectedNames.add(v);
            }
          }
        }
      }
      const depSchemas = (objectSchema as any)?.dependentSchemas;
      if (depSchemas && typeof depSchemas === 'object') {
        for (const key of Object.keys(depSchemas as Record<string, unknown>)) {
          protectedNames.add(key);
        }
      }

      const baselineOneOfKeys = new Set(
        (errors ?? [])
          .filter(
            (err) =>
              err.keyword === 'oneOf' && (err.instancePath || '') === objectPtr
          )
          .map((err) => makeErrorKey(err))
      );

      const res = chooseClosedEnumRenameCandidate(offending, enumValues, {
        canonPath,
        present,
        apFalse,
        mustCoverGuard: mustCoverGuardEnabled,
        coverageIndex: effective.coverageIndex,
        unevaluatedApplies: unevalApplies,
        isEvaluated,
        blockedSourceNames: protectedNames,
      });

      const aggregatedDiagnostics: DiagnosticEnvelope[] = [];
      if (res.diagnostics && res.diagnostics.length) {
        diagnostics.push(...res.diagnostics);
        aggregatedDiagnostics.push(
          ...(res.diagnostics as DiagnosticEnvelope[])
        );
      }

      if (res.ok && res.candidate) {
        const preflight = runRenamePreflightCheck({
          validator: ajvValidator,
          current,
          objectPtr,
          from: offending,
          candidate: res.candidate,
          canonPath,
          baselineDependentKeys,
          baselineOneOfKeys,
        });
        if (preflight.ok) {
          renameKey(obj as Record<string, unknown>, offending, res.candidate);
          /* istanbul ignore next */
          const eTraceUpdate = (_: string): void => {};
          eTraceUpdate(canonPath);
          diagnostics.push({
            code: DIAGNOSTIC_CODES.REPAIR_PNAMES_PATTERN_ENUM,
            canonPath,
            phase: DIAGNOSTIC_PHASES.REPAIR,
            details: {
              from: offending,
              to: res.candidate,
              reason: 'enumRename',
              mustCover: mustCoverActive,
            },
          });
          actions.push({
            action: 'renameProperty',
            canonPath,
            origPath: parentPtr,
            instancePath: objectPtr,
            details: { from: offending, to: res.candidate },
          });
          renameRegistry.set(key, { status: 'renamed' });
          return { attempted: true, renamed: true };
        }
        if (preflight.diagnostics && preflight.diagnostics.length) {
          diagnostics.push(...preflight.diagnostics);
          aggregatedDiagnostics.push(
            ...(preflight.diagnostics as DiagnosticEnvelope[])
          );
        }
      }

      const deleteReason: 'deletedNoSafeName' | 'deletedMustCoverRejected' =
        mustCoverActive &&
        aggregatedDiagnostics.some(
          (diag) => diag.code === DIAGNOSTIC_CODES.MUSTCOVER_INDEX_MISSING
        )
          ? 'deletedMustCoverRejected'
          : 'deletedNoSafeName';

      renameRegistry.set(key, {
        status: 'pendingDelete',
        canonPath,
        from: offending,
        mustCover: mustCoverActive,
        reason: deleteReason,
      });
      return { attempted: true, renamed: false };
    };

    for (let iter = 0; iter < maxCycles; iter += 1) {
      const errors = (validateFn as any).errors as AjvErr[] | undefined;
      if (!errors || errors.length === 0) break;
      let changed = false;
      cycles += 1;
      const dependentBaselineKeys = new Set(
        (errors ?? [])
          .filter((err) => isDependentConstraintError(err))
          .map((err) => makeErrorKey(err))
      );

      // Shape repairs: type, enum, const
      for (const err of errors) {
        const kw = err.keyword;
        const instPtr = err.instancePath || '';
        const sp = normalizeSchemaPointerFromError(err.schemaPath);
        if (kw === 'type') {
          // Skip mapping repairs when the error originates from propertyNames subtree
          if (isUnderPropertyNames(sp)) continue;
          // derive desired type
          const parentPtr = sp.replace(/\/(?:type)(?:\/.*)?$/, '');
          const resolvedParent = resolveSchemaPointer(parentPtr);
          const nodeSchema = getByPointer(schema, resolvedParent.origin) as any;
          let desired: string | undefined;
          if (typeof nodeSchema?.type === 'string') desired = nodeSchema.type;
          else if (
            Array.isArray(nodeSchema?.type) &&
            nodeSchema.type.length > 0
          )
            desired = String(nodeSchema.type[0]);
          if (!desired) continue;
          // Coerce minimal representative
          let replacement: unknown;
          switch (desired) {
            case 'string':
              replacement = '';
              break;
            case 'number':
              replacement = 0;
              break;
            case 'integer':
              replacement = 0;
              break;
            case 'boolean':
              replacement = false;
              break;
            case 'object':
              replacement = {};
              break;
            case 'array':
              replacement = [];
              break;
            case 'null':
              replacement = null;
              break;
            default:
              continue;
          }
          if (instPtr === '') current = replacement as any;
          else setByPointer(current, instPtr, replacement);
          changed = true;
        } else if (kw === 'enum') {
          if (isUnderPropertyNames(sp)) continue;
          const parentPtr = sp.replace(/\/(?:enum)(?:\/.*)?$/, '');
          const resolvedParent = resolveSchemaPointer(parentPtr);
          const nodeSchema = getByPointer(schema, resolvedParent.origin) as any;
          const e = Array.isArray(nodeSchema?.enum)
            ? nodeSchema.enum
            : undefined;
          if (!e || e.length === 0) continue;
          const first = e[0];
          if (instPtr === '') current = first as any;
          else setByPointer(current, instPtr, first);
          changed = true;
        } else if (kw === 'const') {
          if (isUnderPropertyNames(sp)) continue;
          const parentPtr = sp.replace(/\/(?:const)(?:\/.*)?$/, '');
          const resolvedParent = resolveSchemaPointer(parentPtr);
          const nodeSchema = getByPointer(schema, resolvedParent.origin) as any;
          if (!('const' in (nodeSchema ?? {}))) continue;
          const c = (nodeSchema as any).const;
          if (instPtr === '') current = c as any;
          else setByPointer(current, instPtr, c);
          changed = true;
        }
      }

      // Process required errors → add missing with default if available
      for (const err of errors) {
        if (err.keyword !== 'required') continue;
        const missing = (err.params as any).missingProperty as
          | string
          | undefined;
        if (!missing) continue;
        const objectPtr = err.instancePath || '';
        const obj = getByPointer(current, objectPtr);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;

        const sp = normalizeSchemaPointerFromError(err.schemaPath);
        const parentPtr = sp.replace(/\/(?:required)(?:\/.*)?$/, '');
        const resolvedParent = resolveSchemaPointer(parentPtr, {
          propertyName: missing,
        });
        const objectSchema = getByPointer(schema, resolvedParent.origin) as any;
        if (!objectSchema || typeof objectSchema !== 'object') continue;
        const canonPathReq = resolvedParent.canon ?? resolvedParent.origin;
        const props = objectSchema?.properties;
        const sub = props?.[missing];
        const hasDefault = sub && typeof sub === 'object' && 'default' in sub;
        if (!hasDefault) {
          // SPEC §10 mapping: if no default, synthesize a minimal value for the sub-schema
          const synth = (s: any): unknown => {
            if (!s || typeof s !== 'object') return null;
            if (Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0];
            if ('const' in s) return s.const;
            const t =
              typeof s.type === 'string'
                ? s.type
                : Array.isArray(s.type)
                  ? s.type[0]
                  : undefined;
            switch (t) {
              case 'string':
                return '';
              case 'number':
              case 'integer':
                return 0;
              case 'boolean':
                return false;
              case 'object':
                return {};
              case 'array':
                return [];
              case 'null':
                return null;
              default:
                return null;
            }
          };
          const unevalApplies2 =
            objectSchema?.unevaluatedProperties === false ||
            anyErrorAtPath(errors, 'unevaluatedProperties', objectPtr);
          const isEvaluated2 = buildIsEvaluatedFn(
            validateFn as any,
            current,
            objectPtr
          );
          if (unevalApplies2 && !isEvaluated2(missing)) {
            // Respect evaluation guard; skip add
            continue;
          }
          if (!(missing in (obj as Record<string, unknown>))) {
            (obj as Record<string, unknown>)[missing] = synth(sub);
            /* istanbul ignore next */
            const eTraceUpdate2 = (_: string): void => {};
            eTraceUpdate2(canonPathReq);
            emitPropertyPresentFromRepair(
              coverage,
              buildPropertyPointer(canonPathReq, missing),
              missing
            );
            changed = true;
            actions.push({
              action: 'addRequiredSynth',
              canonPath: canonPathReq,
              origPath: parentPtr,
              instancePath: objectPtr,
              details: { name: missing },
            });
          }
          continue;
        }

        const unevalApplies =
          objectSchema?.unevaluatedProperties === false ||
          anyErrorAtPath(errors, 'unevaluatedProperties', objectPtr);
        const isEvaluated = buildIsEvaluatedFn(
          validateFn as any,
          current,
          objectPtr
        );
        if (unevalApplies && !isEvaluated(missing)) {
          // Respect evaluation guard; skip add
          continue;
        }

        if (!(missing in (obj as Record<string, unknown>))) {
          (obj as Record<string, unknown>)[missing] = (sub as any).default;
          // E-Trace refresh for object O after add
          /* istanbul ignore next */
          const eTraceUpdate = (_: string): void => {};
          eTraceUpdate(canonPathReq);
          emitPropertyPresentFromRepair(
            coverage,
            buildPropertyPointer(canonPathReq, missing),
            missing
          );
          changed = true;
          actions.push({
            action: 'addRequiredDefault',
            canonPath: canonPathReq,
            origPath: parentPtr,
            instancePath: objectPtr,
            details: { name: missing },
          });
        }
      }

      // Bounds — string minLength/maxLength adjustments
      for (const err of errors) {
        const kw = err.keyword;
        if (kw !== 'minLength' && kw !== 'maxLength') continue;
        const instPtr = err.instancePath || '';
        const sp = normalizeSchemaPointerFromError(err.schemaPath);
        if (isUnderPropertyNames(sp)) continue;
        const limit = (err.params as any)?.limit as number | undefined;
        if (typeof limit !== 'number') continue;
        let curVal = getByPointer(current, instPtr);
        if (typeof curVal !== 'string') {
          if (instPtr === '') current = '' as any;
          else setByPointer(current, instPtr, '');
          curVal = '';
        }
        const len = codePointLength(curVal as string);
        if (kw === 'minLength' && len < limit) {
          const repairedStr = padToMinCodePoints(curVal as string, limit, 'a');
          if (instPtr === '') current = repairedStr as any;
          else setByPointer(current, instPtr, repairedStr);
          changed = true;
          const canonStr = sp.replace(/\/(?:minLength)(?:\/.*)?$/, '');
          actions.push({
            action: 'stringPadTruncate',
            canonPath: canonStr,
            instancePath: instPtr,
            details: { kind: 'minLength', limit, delta: limit - len },
          });
        } else if (kw === 'maxLength' && len > limit) {
          const repairedStr = codePointSlice(curVal as string, limit);
          if (instPtr === '') current = repairedStr as any;
          else setByPointer(current, instPtr, repairedStr);
          changed = true;
          const canonStr = sp.replace(/\/(?:maxLength)(?:\/.*)?$/, '');
          actions.push({
            action: 'stringPadTruncate',
            canonPath: canonStr,
            instancePath: instPtr,
            details: { kind: 'maxLength', limit, delta: len - limit },
          });
        }
      }

      // Bounds — uniqueItems and array length adjustments
      {
        const uniqueErr = errors.find((e) => e.keyword === 'uniqueItems');
        if (uniqueErr) {
          const arrPtr = uniqueErr.instancePath || '';
          const arr = getByPointer(current, arrPtr);
          if (Array.isArray(arr)) {
            const seen: Record<string, unknown[]> = {};
            const out: unknown[] = [];
            for (const item of arr) {
              const { digest } = structuralHash(item);
              const bucket = seen[digest] ?? (seen[digest] = []);
              if (!bucketsEqual(bucket, item)) {
                bucket.push(item);
                out.push(item);
              }
            }
            if (arrPtr === '') (current as any) = out as any;
            else setByPointer(current, arrPtr, out);
            const uniqCanon = (() => {
              const spp = normalizeSchemaPointerFromError(uniqueErr.schemaPath);
              return spp.replace(/\/(?:uniqueItems)(?:\/.*)?$/, '');
            })();
            actions.push({
              action: 'uniqueItemsDedup',
              canonPath: uniqCanon,
              instancePath: arrPtr,
              details: {
                removed: Array.isArray(arr) ? arr.length - out.length : 0,
              },
            });
            changed = true;
          }
        }
        const maxItemsErr = errors.find((e) => e.keyword === 'maxItems');
        if (maxItemsErr) {
          const arrPtr = maxItemsErr.instancePath || '';
          const arr = getByPointer(current, arrPtr);
          const limit = (maxItemsErr.params as any)?.limit as
            | number
            | undefined;
          if (
            Array.isArray(arr) &&
            typeof limit === 'number' &&
            arr.length > limit
          ) {
            const sliced = arr.slice(0, limit);
            if (arrPtr === '') (current as any) = sliced as any;
            else setByPointer(current, arrPtr, sliced);
            const sppMax = normalizeSchemaPointerFromError(
              maxItemsErr.schemaPath
            );
            const canonMax = sppMax.replace(/\/(?:maxItems)(?:\/.*)?$/, '');
            actions.push({
              action: 'maxItemsTrim',
              canonPath: canonMax,
              instancePath: arrPtr,
              details: { limit },
            });
            changed = true;
          }
        }
        const minItemsErr = errors.find((e) => e.keyword === 'minItems');
        if (minItemsErr) {
          const arrPtr = minItemsErr.instancePath || '';
          const arr = getByPointer(current, arrPtr);
          const limit = (minItemsErr.params as any)?.limit as
            | number
            | undefined;
          if (
            Array.isArray(arr) &&
            typeof limit === 'number' &&
            arr.length < limit
          ) {
            const sp = normalizeSchemaPointerFromError(minItemsErr.schemaPath);
            const parentPtr = sp.replace(/\/(?:minItems)(?:\/.*)?$/, '');
            const resolvedParent = resolveSchemaPointer(parentPtr);
            const nodeSchema = getByPointer(
              schema,
              resolvedParent.origin
            ) as any;
            if (!nodeSchema || typeof nodeSchema !== 'object') {
              continue;
            }
            const itemSchema = nodeSchema?.items;
            const prefixItems = Array.isArray(nodeSchema?.prefixItems)
              ? (nodeSchema.prefixItems as unknown[])
              : [];
            const synthFrom = (s: any): unknown => {
              if (!s || typeof s !== 'object') return null;
              if ('default' in s) return (s as any).default;
              if (Array.isArray((s as any).enum) && (s as any).enum.length > 0)
                return (s as any).enum[0];
              if ('const' in s) return (s as any).const;
              const t =
                typeof (s as any).type === 'string'
                  ? (s as any).type
                  : Array.isArray((s as any).type)
                    ? (s as any).type[0]
                    : undefined;
              switch (t) {
                case 'string':
                  return '';
                case 'number':
                case 'integer':
                  return 0;
                case 'boolean':
                  return false;
                case 'object':
                  return {};
                case 'array':
                  return [];
                case 'null':
                  return null;
                default:
                  return null;
              }
            };
            const toAdd = limit - arr.length;
            const additions: unknown[] = [];
            for (let i = arr.length; i < limit; i += 1) {
              const schemaForIndex =
                i < prefixItems.length ? prefixItems[i] : itemSchema;
              additions.push(synthFrom(schemaForIndex));
            }
            const grown = arr.concat(additions);
            if (arrPtr === '') (current as any) = grown as any;
            else setByPointer(current, arrPtr, grown);
            actions.push({
              action: 'minItemsGrow',
              canonPath: sp.replace(/\/(?:minItems)(?:\/.*)?$/, ''),
              instancePath: arrPtr,
              details: { added: toAdd, limit },
            });
            changed = true;
          }
        }
      }

      // Bounds — numeric clamping/nudging
      for (const err of errors) {
        const kw = err.keyword;
        if (
          kw !== 'minimum' &&
          kw !== 'maximum' &&
          kw !== 'exclusiveMinimum' &&
          kw !== 'exclusiveMaximum'
        ) {
          continue;
        }
        const valPtr = err.instancePath || '';
        const val = getByPointer(current, valPtr);
        if (typeof val !== 'number' || Number.isNaN(val)) continue;

        const sp = normalizeSchemaPointerFromError(err.schemaPath);
        const parentPtr = sp.replace(
          /\/(?:minimum|maximum|exclusiveMinimum|exclusiveMaximum|multipleOf)(?:\/.*)?$/,
          ''
        );
        const resolvedParent = resolveSchemaPointer(parentPtr);
        const numericSchema = getByPointer(
          schema,
          resolvedParent.origin
        ) as any;
        const canonPath2 = resolvedParent.canon ?? resolvedParent.origin;
        const isInt = hasIntegerType(numericSchema);
        const eNum = epsilonNumber(decimalPrecision);
        const epsilonStr = formatEpsilon(decimalPrecision);

        if (kw === 'minimum' || kw === 'maximum') {
          const limit = (err.params as any).limit as number | undefined;
          if (typeof limit !== 'number') continue;
          let next = val;
          if (kw === 'minimum' && val < limit) next = limit;
          if (kw === 'maximum' && val > limit) next = limit;
          if (next !== val) {
            const replacement = isInt ? Math.trunc(next) : next;
            if (valPtr === '') {
              current = replacement as unknown as typeof current;
            } else {
              setByPointer(current, valPtr, replacement);
            }
            changed = true;
            actions.push({
              action: 'numericClamp',
              canonPath: canonPath2,
              origPath: parentPtr,
              instancePath: valPtr,
              details: { kind: kw, limit },
            });
          }
        } else if (kw === 'exclusiveMinimum' || kw === 'exclusiveMaximum') {
          const limit = (err.params as any).limit as number | undefined;
          if (typeof limit !== 'number') continue;
          let next: number;
          if (kw === 'exclusiveMinimum') {
            next = isInt ? Math.ceil(limit + 1) : limit + eNum;
          } else {
            next = isInt ? Math.floor(limit - 1) : limit - eNum;
          }
          if (next !== val) {
            if (valPtr === '') {
              current = next as unknown as typeof current;
            } else {
              setByPointer(current, valPtr, next);
            }
            changed = true;
            actions.push({
              action: 'numericNudge',
              canonPath: canonPath2,
              origPath: parentPtr,
              instancePath: valPtr,
              details: isInt
                ? { kind: kw, delta: kw === 'exclusiveMinimum' ? +1 : -1 }
                : { kind: kw, epsilon: epsilonStr },
            });
          }
        }
      }

      // contains/minContains/maxContains with selective reduction across needs
      for (const err of errors) {
        const kw = err.keyword;
        if (kw !== 'contains' && kw !== 'minContains' && kw !== 'maxContains')
          continue;
        const arrPtr = err.instancePath || '';
        const arr0 = getByPointer(current, arrPtr);
        if (!Array.isArray(arr0)) continue;
        // Work on a local copy for safe mutation bookkeeping
        const arr = arr0 as unknown[];
        const sp = normalizeSchemaPointerFromError(err.schemaPath);
        const parentPtr = sp.replace(
          /\/(?:contains|minContains|maxContains)(?:\/.*)?$/,
          ''
        );
        const resolvedParent = resolveSchemaPointer(parentPtr);
        const canonPath = resolvedParent.canon ?? resolvedParent.origin;
        let needs = effective.containsBag.get(canonPath);
        if (!needs || needs.length === 0) {
          const objectSchema = getByPointer(
            schema,
            resolvedParent.origin
          ) as any;
          if (
            objectSchema &&
            typeof objectSchema === 'object' &&
            objectSchema.contains
          ) {
            const min =
              typeof objectSchema.minContains === 'number'
                ? objectSchema.minContains
                : 0;
            const max =
              typeof objectSchema.maxContains === 'number'
                ? objectSchema.maxContains
                : undefined;
            needs = [
              max !== undefined
                ? { schema: objectSchema.contains, min, max }
                : { schema: objectSchema.contains, min },
            ];
          } else {
            continue;
          }
        }

        // Compile validators and compute match matrix
        const validators = needs.map((n) =>
          sourceAjv.compile(n.schema as object)
        );
        const matches: boolean[][] = needs.map(() =>
          new Array(arr.length).fill(false)
        );
        const counts: number[] = new Array(needs.length).fill(0);
        for (let i = 0; i < arr.length; i += 1) {
          for (let k = 0; k < needs.length; k += 1) {
            const ok = validators[k]!(arr[i]);
            matches[k]![i] = ok;
            if (ok) counts[k]! += 1;
          }
        }

        const minByNeed = needs.map((n: any) =>
          typeof n.min === 'number' ? n.min : 0
        );
        const maxByNeed = needs.map((n: any) =>
          typeof n.max === 'number' ? n.max : undefined
        );

        // Synth helper
        const synth = (sch: any): unknown => {
          if (!sch || typeof sch !== 'object') return null;
          if (Array.isArray(sch.enum) && sch.enum.length > 0)
            return sch.enum[0];
          if ('const' in sch) return sch.const;
          const t =
            typeof sch.type === 'string'
              ? sch.type
              : Array.isArray(sch.type)
                ? sch.type[0]
                : undefined;
          if (t === 'string')
            return typeof sch.pattern === 'string'
              ? (synthesizePatternExample(sch.pattern) ?? '')
              : '';
          if (t === 'number' || t === 'integer') return 0;
          if (t === 'boolean') return false;
          if (t === 'null') return null;
          if (t === 'object') return {};
          if (t === 'array') return [];
          return null;
        };

        let mutated = false;
        // Enforce minContains by appending new witnesses
        for (let k = 0; k < needs.length; k += 1) {
          while (counts[k]! < minByNeed[k]!) {
            const candidate = synth((needs[k] as any).schema);
            arr.push(candidate);
            // Update match matrix for new element
            for (let j = 0; j < needs.length; j += 1) {
              const ok = validators[j]!(candidate);
              matches[j]!.push(ok);
              if (ok) counts[j]! += 1;
            }
            mutated = true;
          }
        }

        // Enforce maxContains by selectively removing safe elements from the end
        for (let k = 0; k < needs.length; k += 1) {
          const max = maxByNeed[k];
          if (typeof max !== 'number') continue;
          while (counts[k]! > max) {
            let removed = false;
            for (let i = arr.length - 1; i >= 0; i -= 1) {
              if (!matches[k]![i]) continue;
              // Check safety for other needs' minimums
              let safe = true;
              for (let j = 0; j < needs.length; j += 1) {
                if (j === k) continue;
                if (matches[j]![i] && counts[j]! - 1 < minByNeed[j]!) {
                  safe = false;
                  break;
                }
              }
              if (!safe) continue;
              // Remove this element and update counts/matches
              arr.splice(i, 1);
              for (let j = 0; j < needs.length; j += 1) {
                if (matches[j]![i]) counts[j]! -= 1;
                matches[j]!.splice(i, 1);
              }
              mutated = true;
              removed = true;
              break;
            }
            if (!removed) break; // cannot reduce further without violating other mins
          }
        }

        if (mutated) {
          if (arrPtr === '') (current as any) = arr as any;
          else setByPointer(current, arrPtr, arr);
          actions.push({
            action: 'containsAdjust',
            canonPath,
            origPath: parentPtr,
            instancePath: arrPtr,
          });
          changed = true;
        }
      }

      // Semantics — pattern witnesses and multipleOf snapping
      for (const err of errors) {
        const kw = err.keyword;
        if (kw !== 'pattern' && kw !== 'multipleOf') continue;
        const instPtr = err.instancePath || '';
        const sp = normalizeSchemaPointerFromError(err.schemaPath);
        if (kw === 'pattern') {
          if (isUnderPropertyNames(sp)) continue;
          const val = getByPointer(current, instPtr);
          if (typeof val !== 'string') {
            if (instPtr === '') current = '' as any;
            else setByPointer(current, instPtr, '');
            changed = true;
            continue;
          }
          const parentPtr = sp.replace(/\/(?:pattern)(?:\/.*)?$/, '');
          const resolvedParent = resolveSchemaPointer(parentPtr);
          const nodeSchema = getByPointer(schema, resolvedParent.origin) as any;
          const patternSource =
            typeof nodeSchema?.pattern === 'string'
              ? nodeSchema.pattern
              : undefined;
          if (!patternSource) continue;
          const candidate = synthesizePatternExample(patternSource) ?? '';
          if (instPtr === '') current = candidate as any;
          else setByPointer(current, instPtr, candidate);
          changed = true;
        } else if (kw === 'multipleOf') {
          const val = getByPointer(current, instPtr);
          if (typeof val !== 'number' || Number.isNaN(val)) continue;
          const parentPtr = sp.replace(/\/(?:multipleOf)(?:\/.*)?$/, '');
          const resolvedParent = resolveSchemaPointer(parentPtr);
          const numericSchema = getByPointer(
            schema,
            resolvedParent.origin
          ) as any;
          const canonPath2 = resolvedParent.canon ?? resolvedParent.origin;
          const isInt = hasIntegerType(numericSchema);
          const eNum = epsilonNumber(decimalPrecision);
          const epsilonStr = formatEpsilon(decimalPrecision);
          const m = (err.params as any).multipleOf as number | undefined;
          if (typeof m !== 'number' || m === 0) continue;
          const k = Math.round(val / m);
          let snapped = k * m;
          if (!Number.isFinite(snapped)) continue;
          if (Math.abs(snapped - val) < eNum) continue;
          if (isInt) snapped = Math.trunc(snapped);
          if (instPtr === '') {
            current = snapped as unknown as typeof current;
          } else {
            setByPointer(current, instPtr, snapped);
          }
          changed = true;
          actions.push({
            action: 'multipleOfSnap',
            canonPath: canonPath2,
            origPath: parentPtr,
            instancePath: instPtr,
            details: { multipleOf: m, epsilon: epsilonStr },
          });
        }
      }

      // Process propertyNames violations → attempt closed-enum rename
      const propertyNameGroups = new Map<
        string,
        { objectPtr: string; parentPtr: string; offenders: Set<string> }
      >();
      for (const err of errors) {
        if (err.keyword !== 'propertyNames') continue;
        const offending = (err.params as any).propertyName as
          | string
          | undefined;
        if (!offending) continue;
        const objectPtr = err.instancePath || '';
        const sp = normalizeSchemaPointerFromError(err.schemaPath);
        const parentPtr = sp.replace(/\/(?:propertyNames)(?:\/.*)?$/, '');
        const keyGroup = `${objectPtr}::${parentPtr}`;
        let group = propertyNameGroups.get(keyGroup);
        if (!group) {
          group = { objectPtr, parentPtr, offenders: new Set() };
          propertyNameGroups.set(keyGroup, group);
        }
        group.offenders.add(offending);
      }
      const orderedGroups = Array.from(propertyNameGroups.values()).sort(
        (a, b) =>
          a.objectPtr === b.objectPtr
            ? a.parentPtr.localeCompare(b.parentPtr)
            : a.objectPtr.localeCompare(b.objectPtr)
      );
      for (const group of orderedGroups) {
        const offenders = Array.from(group.offenders).sort((a, b) =>
          a < b ? -1 : a > b ? 1 : 0
        );
        for (const offending of offenders) {
          const result = attemptPropertyNamesRectification(
            offending,
            group.objectPtr,
            group.parentPtr,
            errors,
            dependentBaselineKeys
          );
          if (result.renamed) {
            changed = true;
          }
        }
      }
      // Remove extras under additionalProperties:false and unevaluatedProperties:false
      for (const err of errors) {
        if (
          err.keyword !== 'additionalProperties' &&
          err.keyword !== 'unevaluatedProperties'
        )
          continue;
        const objectPtr = err.instancePath || '';
        const obj = getByPointer(current, objectPtr);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
        const propName =
          (err.params as any).additionalProperty ??
          (err.params as any).unevaluatedProperty;
        if (typeof propName !== 'string') continue;
        const canonObj = normalizeSchemaPointerFromError(
          err.schemaPath
        ).replace(
          /\/(?:additionalProperties|unevaluatedProperties)(?:\/.*)?$/,
          ''
        );
        const renameAttempt = attemptPropertyNamesRectification(
          propName,
          objectPtr,
          canonObj,
          errors,
          dependentBaselineKeys
        );
        if (renameAttempt.renamed) {
          changed = true;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(
            obj as Record<string, unknown>,
            propName
          )
        ) {
          delete (obj as Record<string, unknown>)[propName];
          actions.push({
            action: 'removeAdditionalProperty',
            canonPath: canonObj,
            instancePath: objectPtr,
            details: {
              name: propName,
              kind:
                err.keyword === 'additionalProperties'
                  ? 'additional'
                  : 'unevaluated',
            },
          });
          changed = true;
          const registryEntry = renameRegistry.get(
            makeRenameKey(objectPtr, propName)
          );
          if (registryEntry && registryEntry.status === 'pendingDelete') {
            diagnostics.push({
              code: DIAGNOSTIC_CODES.REPAIR_PNAMES_PATTERN_ENUM,
              canonPath: registryEntry.canonPath,
              phase: DIAGNOSTIC_PHASES.REPAIR,
              details: {
                from: registryEntry.from,
                reason: registryEntry.reason,
                mustCover: registryEntry.mustCover,
              },
            });
            renameRegistry.delete(makeRenameKey(objectPtr, propName));
          }
        }
      }

      if (!changed) break;
      // Revalidate after a repair iteration
      pass = validateFn(current);
      const nextErrors = (validateFn as any).errors as AjvErr[] | undefined;
      const nextErrorCount = Array.isArray(nextErrors) ? nextErrors.length : 0;
      if (nextErrorCount <= 0) {
        lastErrorCount = 0;
        break;
      }
      if (nextErrorCount >= lastErrorCount) {
        lastErrorCount = nextErrorCount;
        break;
      }
      lastErrorCount = nextErrorCount;
      if (pass) break;
    }

    repaired.push(current);

    if (metrics && cycles > 0) {
      metrics.addRepairPasses(cycles);
    }

    if (!pass && lastErrorCount > 0 && cycles >= maxCycles) {
      diagnostics.push({
        code: DIAGNOSTIC_CODES.UNSAT_BUDGET_EXHAUSTED,
        canonPath: '#',
        phase: DIAGNOSTIC_PHASES.REPAIR,
        details: {
          cycles,
          lastErrorCount,
        },
      });
    }
  }

  return { items: repaired, diagnostics, actions };
}
