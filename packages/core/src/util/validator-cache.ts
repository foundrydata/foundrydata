import type Ajv from 'ajv';

import { stableHash } from './stable-hash.js';
import { extractAjvFlags } from './ajv-source.js';
import { createPlanOptionsSubKey } from './cache.js';
import type { PlanOptions, ResolvedOptions } from '../types/options.js';

type PlanInput = Partial<PlanOptions> | ResolvedOptions | undefined;

interface ValidatorCacheKey {
  schemaHash: string;
  ajvMajor: number;
  ajvClass: string;
  ajvFlagsJson: string;
  planOptionsSubKey: string;
  registryFingerprint?: string;
}

const MAX_VALIDATOR_CACHE_ENTRIES = 64;
const validatorCache = new Map<string, unknown>();

function toAjvMajor(ajv: Ajv): number {
  const raw =
    (ajv as { version?: string }).version &&
    typeof (ajv as { version?: string }).version === 'string'
      ? ((ajv as { version?: string }).version as string)
      : '0';
  const token = raw.split('.')[0] ?? '0';
  const parsed = Number.parseInt(token, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toAjvClass(ajv: Ajv): string {
  const marker = (ajv as { __fd_ajvClass?: string }).__fd_ajvClass;
  if (marker && typeof marker === 'string') {
    return marker;
  }
  return 'unknown';
}

function makeCacheKey(params: ValidatorCacheKey): string {
  return JSON.stringify(params);
}

function computeSchemaHash(value: unknown): string | undefined {
  const result = stableHash(value);
  return result?.digest;
}

function computeBaseKeyParams(args: {
  ajv: Ajv;
  schema: unknown;
  planOptions: PlanInput;
  registryFingerprint?: string;
}): ValidatorCacheKey | undefined {
  const schemaHash = computeSchemaHash(args.schema);
  if (!schemaHash) {
    return undefined;
  }

  const flags = extractAjvFlags(args.ajv) as Record<string, unknown>;
  const sortedFlags: Record<string, unknown> = {};
  const flagKeys = Object.keys(flags).sort();
  for (const key of flagKeys) {
    sortedFlags[key] = flags[key];
  }

  const ajvFlagsJson = JSON.stringify(sortedFlags);
  const planOptionsSubKey = createPlanOptionsSubKey(args.planOptions);
  const ajvMajor = toAjvMajor(args.ajv);
  const ajvClass = toAjvClass(args.ajv);

  return {
    schemaHash,
    ajvMajor,
    ajvClass,
    ajvFlagsJson,
    planOptionsSubKey,
    registryFingerprint: args.registryFingerprint,
  };
}

export function getCachedValidator<T>(params: {
  ajv: Ajv;
  schema: unknown;
  planOptions?: PlanInput;
  registryFingerprint?: string;
}): T | undefined {
  const keyParams = computeBaseKeyParams({
    ajv: params.ajv,
    schema: params.schema,
    planOptions: params.planOptions,
    registryFingerprint: params.registryFingerprint,
  });
  if (!keyParams) {
    return undefined;
  }
  const key = makeCacheKey(keyParams);
  const hit = validatorCache.get(key) as T | undefined;
  if (hit !== undefined) {
    validatorCache.delete(key);
    validatorCache.set(key, hit);
  }
  return hit;
}

export function setCachedValidator<T>(params: {
  ajv: Ajv;
  schema: unknown;
  planOptions?: PlanInput;
  registryFingerprint?: string;
  validateFn: T;
}): void {
  const keyParams = computeBaseKeyParams({
    ajv: params.ajv,
    schema: params.schema,
    planOptions: params.planOptions,
    registryFingerprint: params.registryFingerprint,
  });
  if (!keyParams) {
    return;
  }
  const key = makeCacheKey(keyParams);
  if (validatorCache.has(key)) {
    validatorCache.delete(key);
  }
  validatorCache.set(key, params.validateFn);
  if (validatorCache.size > MAX_VALIDATOR_CACHE_ENTRIES) {
    const oldest = validatorCache.keys().next();
    if (!oldest.done) {
      validatorCache.delete(oldest.value);
    }
  }
}
