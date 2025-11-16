/* eslint-disable max-lines */
import type Ajv from 'ajv';

import { stableHash } from './stable-hash.js';
import { extractAjvFlags } from './ajv-source.js';
import {
  resolveOptions,
  type PlanOptions,
  type ResolvedOptions,
} from '../types/options.js';

const PLAN_OPTIONS_SUBKEY_FIELDS = [
  'complexity.maxAnyOfBranches',
  'complexity.maxContainsNeeds',
  'complexity.maxOneOfBranches',
  'complexity.maxPatternProps',
  'conditionals.exclusivityStringTweak',
  'conditionals.minThenSatisfaction',
  'conditionals.strategy',
  'disablePatternOverlapAnalysis',
  'guards.maxGeneratedNotNesting',
  'guards.maxDynamicScopeHops',
  'patternWitness.alphabet',
  'patternWitness.maxCandidates',
  'patternWitness.maxLength',
  'rational.decimalPrecision',
  'rational.fallback',
  'rational.maxLcmBits',
  'rational.maxRatBits',
  'rational.qCap',
  'repair.mustCoverGuard',
  // Resolver stub mode influences effective view behavior (SPEC §14)
  'resolver.stubUnresolved',
  'trials.maxBranchesToTry',
  'trials.perBranch',
  'trials.skipTrials',
  'trials.skipTrialsIfBranchesGt',
] as const;

const AJV_FLAG_KEYS = [
  'validateFormats',
  'allowUnionTypes',
  'strictTypes',
  'strictSchema',
  'unicodeRegExp',
  'coerceTypes',
  'multipleOfPrecision',
  'discriminator',
] as const;

type PlanOptionsSubKeyField = (typeof PLAN_OPTIONS_SUBKEY_FIELDS)[number];

interface ResolvedLike extends ResolvedOptions {
  cache: ResolvedOptions['cache'];
}

type OptionsInput = Partial<PlanOptions> | ResolvedOptions | undefined | null;

interface AjvWithMetadata extends Ajv {
  __fd_ajvClass?: string;
  version?: string;
}

function isResolvedOptions(value: OptionsInput): value is ResolvedOptions {
  if (!value) return false;
  const candidate = value as ResolvedOptions;
  return (
    typeof candidate.cache?.lruSize === 'number' &&
    typeof candidate.guards?.maxDynamicScopeHops === 'number' &&
    typeof candidate.conditionals?.strategy === 'string'
  );
}

function ensureResolvedOptions(options: OptionsInput): ResolvedLike {
  if (!options) return resolveOptions();
  if (isResolvedOptions(options)) {
    return options;
  }
  return resolveOptions(options ?? undefined);
}

function pickNested(source: unknown, path: PlanOptionsSubKeyField): unknown {
  const segments = path.split('.');
  let cursor: unknown = source;
  for (const segment of segments) {
    if (cursor === null || typeof cursor !== 'object' || !(segment in cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function normalizePlanOptionsValue(
  path: PlanOptionsSubKeyField,
  value: unknown
): unknown {
  if (path === 'conditionals.strategy' && value === 'rewrite') {
    return 'if-aware-lite';
  }
  return value;
}

function sortObjectKeys(
  input: Record<string, unknown>
): Record<string, unknown> {
  const sorted = Object.keys(input)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = input[key];
      return acc;
    }, {});
  return sorted;
}

export function createPlanOptionsSubKey(
  options?: Partial<PlanOptions> | ResolvedOptions
): string {
  const resolved = ensureResolvedOptions(options);
  const payload: Record<string, unknown> = {};

  for (const field of PLAN_OPTIONS_SUBKEY_FIELDS) {
    const raw = pickNested(resolved, field);
    if (raw === undefined) continue;
    const normalized = normalizePlanOptionsValue(field, raw);
    if (normalized === undefined) continue;
    payload[field] = normalized;
  }

  const canonical = sortObjectKeys(payload);
  return JSON.stringify(canonical);
}

interface AjvFlagsDescriptor {
  record: Record<string, unknown>;
  json: string;
}

function deriveAjvFlagsDescriptor(ajv: Ajv): AjvFlagsDescriptor {
  const fullFlags = extractAjvFlags(ajv);
  const selected: Record<string, unknown> = {};
  for (const key of AJV_FLAG_KEYS) {
    const value = (fullFlags as Record<string, unknown>)[key];
    if (value !== undefined) {
      selected[key] = value;
    }
  }
  const sorted = sortObjectKeys(selected);
  return {
    record: sorted,
    json: JSON.stringify(sorted),
  };
}

function deriveAjvMajor(ajv: AjvWithMetadata): number {
  const version = ajv.version ?? '';
  const majorToken = version.split('.')[0] ?? '';
  const major = Number.parseInt(majorToken, 10);
  if (Number.isNaN(major)) {
    return 0;
  }
  return major;
}

function deriveAjvClass(ajv: AjvWithMetadata): string {
  if (ajv.__fd_ajvClass && typeof ajv.__fd_ajvClass === 'string') {
    return ajv.__fd_ajvClass;
  }
  return 'unknown';
}

export interface CacheKeyContext {
  ajvMajor: number;
  ajvClass: string;
  ajvFlags: Record<string, unknown>;
  ajvFlagsJson: string;
  planOptionsSubKey: string;
  userSalt?: string;
}

export interface CacheKeyContextParams {
  ajv: Ajv;
  planOptions?: Partial<PlanOptions> | ResolvedOptions;
  planOptionsSubKey?: string;
  userSalt?: string;
}

export function createCacheKeyContext({
  ajv,
  planOptions,
  planOptionsSubKey,
  userSalt,
}: CacheKeyContextParams): CacheKeyContext {
  const subKey =
    planOptionsSubKey ?? createPlanOptionsSubKey(planOptions ?? undefined);
  const metadataAjv = ajv as AjvWithMetadata;
  const flags = deriveAjvFlagsDescriptor(ajv);
  return {
    ajvMajor: deriveAjvMajor(metadataAjv),
    ajvClass: deriveAjvClass(metadataAjv),
    ajvFlags: flags.record,
    ajvFlagsJson: flags.json,
    planOptionsSubKey: subKey,
    userSalt,
  };
}

function serializeCacheContext(context: CacheKeyContext): string {
  const payload: Record<string, unknown> = {
    ajvMajor: context.ajvMajor,
    ajvClass: context.ajvClass,
    ajvFlags: context.ajvFlagsJson,
    planOptionsSubKey: context.planOptionsSubKey,
  };
  if (context.userSalt !== undefined) {
    payload.userSalt = context.userSalt;
  }
  return JSON.stringify(payload);
}

export interface BranchMemoKeyParams {
  canonPath: string;
  seed: number;
  context: CacheKeyContext;
  userKey?: unknown;
}

export function buildBranchMemoKey({
  canonPath,
  seed,
  context,
  userKey,
}: BranchMemoKeyParams): string {
  if (typeof canonPath !== 'string') {
    throw new TypeError('canonPath must be a canonical JSON Pointer string');
  }
  if (!Number.isFinite(seed)) {
    throw new TypeError('seed must be a finite number');
  }
  const payload: Record<string, unknown> = {
    canonPath,
    seed,
    ajvMajor: context.ajvMajor,
    ajvClass: context.ajvClass,
    ajvFlags: context.ajvFlags,
    planOptionsSubKey: context.planOptionsSubKey,
  };
  if (context.userSalt !== undefined) {
    payload.userSalt = context.userSalt;
  }
  if (userKey !== undefined) {
    payload.userKey = userKey;
  }
  return JSON.stringify(payload);
}

export interface SchemaCacheOptions {
  preferWeakMap: boolean;
  useId: boolean;
  hashIfBytesLt: number;
  lruSize: number;
}

function extractSchemaId(schema: unknown): string | null {
  if (schema && typeof schema === 'object') {
    const id = (schema as Record<string, unknown>)['$id'];
    if (typeof id === 'string' && id.length > 0) {
      return id;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function makeStringCacheKey(
  kind: 'id' | 'hash',
  handle: string,
  contextKey: string
): string {
  return JSON.stringify([kind, handle, contextKey]);
}

export class SchemaCache<Value> {
  private readonly identityBuckets = new WeakMap<object, Map<string, Value>>();
  private readonly stringEntries = new Map<string, Value>();
  private readonly options: SchemaCacheOptions;

  constructor(options: SchemaCacheOptions) {
    this.options = options;
  }

  public get(schema: unknown, context: CacheKeyContext): Value | undefined {
    const contextKey = serializeCacheContext(context);

    if (this.options.preferWeakMap && isRecord(schema)) {
      const bucket = this.identityBuckets.get(schema);
      const hit = bucket?.get(contextKey);
      if (hit !== undefined) {
        return hit;
      }
    }

    if (this.options.useId) {
      const schemaId = extractSchemaId(schema);
      if (schemaId) {
        const key = makeStringCacheKey('id', schemaId, contextKey);
        const hit = this.getStringEntry(key);
        if (hit !== undefined) {
          return hit;
        }
      }
    }

    const hashKey = this.computeHashHandle(schema);
    if (hashKey) {
      const key = makeStringCacheKey('hash', hashKey, contextKey);
      const hit = this.getStringEntry(key);
      if (hit !== undefined) {
        return hit;
      }
    }

    return undefined;
  }

  public set(schema: unknown, context: CacheKeyContext, value: Value): void {
    const contextKey = serializeCacheContext(context);

    if (this.options.preferWeakMap && isRecord(schema)) {
      let bucket = this.identityBuckets.get(schema);
      if (!bucket) {
        bucket = new Map<string, Value>();
        this.identityBuckets.set(schema, bucket);
      }
      bucket.set(contextKey, value);
      return;
    }

    if (this.options.useId) {
      const schemaId = extractSchemaId(schema);
      if (schemaId) {
        const key = makeStringCacheKey('id', schemaId, contextKey);
        this.storeStringEntry(key, value);
        return;
      }
    }

    const hashKey = this.computeHashHandle(schema);
    if (hashKey) {
      const key = makeStringCacheKey('hash', hashKey, contextKey);
      this.storeStringEntry(key, value);
    }
  }

  public clear(): void {
    this.stringEntries.clear();
  }

  private computeHashHandle(schema: unknown): string | null {
    const result = stableHash(schema, {
      maxBytes: this.options.hashIfBytesLt,
    });
    return result?.digest ?? null;
  }

  private getStringEntry(key: string): Value | undefined {
    if (!this.stringEntries.has(key)) return undefined;
    const value = this.stringEntries.get(key);
    if (value !== undefined) {
      this.stringEntries.delete(key);
      this.stringEntries.set(key, value);
    }
    return value;
  }

  private storeStringEntry(key: string, value: Value): void {
    if (this.stringEntries.has(key)) {
      this.stringEntries.delete(key);
    }
    this.stringEntries.set(key, value);
    if (this.stringEntries.size > this.options.lruSize) {
      const oldest = this.stringEntries.keys().next();
      if (!oldest.done) {
        this.stringEntries.delete(oldest.value);
      }
    }
  }
}

export function createSchemaCache<Value>(
  options?: Partial<PlanOptions> | ResolvedOptions
): SchemaCache<Value> {
  const resolved = ensureResolvedOptions(options);
  const cacheOptions: SchemaCacheOptions = {
    preferWeakMap: resolved.cache.preferWeakMap,
    useId: resolved.cache.useId,
    hashIfBytesLt: resolved.cache.hashIfBytesLt,
    lruSize: resolved.cache.lruSize,
  };
  return new SchemaCache<Value>(cacheOptions);
}

// Separate LRU spaces per AJV instance (planning vs source)
export type CacheSpace = 'source' | 'planning';

export class SchemaCachePool<Value> {
  private readonly source: SchemaCache<Value>;
  private readonly planning: SchemaCache<Value>;

  constructor(options?: Partial<PlanOptions> | ResolvedOptions) {
    this.source = createSchemaCache<Value>(options);
    this.planning = createSchemaCache<Value>(options);
  }

  public get(space: CacheSpace): SchemaCache<Value> {
    return space === 'source' ? this.source : this.planning;
  }

  public clear(space?: CacheSpace): void {
    if (!space) {
      this.source.clear();
      this.planning.clear();
      return;
    }
    this.get(space).clear();
  }
}

export function createSchemaCachePool<Value>(
  options?: Partial<PlanOptions> | ResolvedOptions
): SchemaCachePool<Value> {
  return new SchemaCachePool<Value>(options);
}
