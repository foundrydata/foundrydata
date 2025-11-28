/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import { type PlanOptions } from '@foundrydata/core';

export type OutputFormat = 'json' | 'ndjson';

/**
 * CLI options interface matching Commander.js option structure
 */
export interface CliOptions {
  rewriteConditionals?: 'never' | 'safe';
  debugFreeze?: boolean;
  skipTrials?: boolean;
  trialsPerBranch?: number;
  maxBranchesToTry?: number;
  skipTrialsIfBranchesGt?: number;
  externalRefStrict?: 'error' | 'warn';
  dynamicRefStrict?: 'warn' | 'note';
  encodingBigintJson?: 'string' | 'number' | 'error';
  metrics?: boolean;
  // Generation/runtime flags (parsed in CLI)
  count?: string | number;
  rows?: string | number;
  n?: string | number;
  seed?: string | number;
  coverage?: 'off' | 'measure' | 'guided' | string;
  coverageDimensions?: string;
  coverageMin?: string | number;
  coverageReport?: string;
  coverageProfile?: 'quick' | 'balanced' | 'thorough' | string;
  coverageExcludeUnreachable?: string | boolean;
  mode?: 'strict' | 'lax' | string;
  compat?: 'strict' | 'lax' | string;
  out?: string;
  preferExamples?: boolean;
  // Resolver extension flags
  resolve?: string; // e.g., "local,remote,schemastore"
  cacheDir?: string;
  failOnUnresolved?: string | boolean;
  // Allow additional CLI options that we don't process
  [key: string]: unknown;
}

/**
 * Parse CLI options into PlanOptions configuration
 */
export function parsePlanOptions(options: CliOptions): Partial<PlanOptions> {
  const planOptions: Partial<PlanOptions> = {};

  // Normalization options
  if (options.rewriteConditionals) {
    planOptions.rewriteConditionals = options.rewriteConditionals;
  }
  if (options.debugFreeze !== undefined) {
    planOptions.debugFreeze = options.debugFreeze;
  }

  // Branch trials options
  if (
    options.skipTrials !== undefined ||
    options.trialsPerBranch !== undefined ||
    options.maxBranchesToTry !== undefined ||
    options.skipTrialsIfBranchesGt !== undefined
  ) {
    planOptions.trials = {};

    if (options.skipTrials !== undefined) {
      planOptions.trials.skipTrials = options.skipTrials;
    }
    if (options.trialsPerBranch !== undefined) {
      planOptions.trials.perBranch = options.trialsPerBranch;
    }
    if (options.maxBranchesToTry !== undefined) {
      planOptions.trials.maxBranchesToTry = options.maxBranchesToTry;
    }
    if (options.skipTrialsIfBranchesGt !== undefined) {
      planOptions.trials.skipTrialsIfBranchesGt =
        options.skipTrialsIfBranchesGt;
    }
  }

  // Fail-fast options
  if (
    options.externalRefStrict !== undefined ||
    options.dynamicRefStrict !== undefined
  ) {
    planOptions.failFast = {};

    if (options.externalRefStrict !== undefined) {
      planOptions.failFast.externalRefStrict = options.externalRefStrict;
    }
    if (options.dynamicRefStrict !== undefined) {
      planOptions.failFast.dynamicRefStrict = options.dynamicRefStrict;
    }
  }

  // Encoding options
  if (options.encodingBigintJson !== undefined) {
    planOptions.encoding = {
      bigintJSON: options.encodingBigintJson,
    };
  }

  // Metrics toggle (Commander sets metrics=false when --no-metrics is used)
  if (typeof options.metrics === 'boolean') {
    planOptions.metrics = options.metrics;
  }

  // Resolver (Extension R1) — map CLI flags when provided
  const hasResolverFlag =
    typeof options.resolve === 'string' ||
    typeof options.cacheDir === 'string' ||
    options.failOnUnresolved !== undefined;
  if (hasResolverFlag) {
    type ResolverOptions = NonNullable<PlanOptions['resolver']>;
    const base: ResolverOptions = {
      ...(planOptions.resolver ?? {}),
    } as ResolverOptions;
    if (typeof options.resolve === 'string') {
      const parts = options.resolve
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as Array<'local' | 'remote' | 'schemastore'>;
      if (parts.length > 0) base.strategies = parts;
    }
    if (typeof options.cacheDir === 'string') {
      base.cacheDir = options.cacheDir;
    }
    if (
      (typeof options.failOnUnresolved === 'string' &&
        options.failOnUnresolved === 'false') ||
      options.failOnUnresolved === false
    ) {
      base.stubUnresolved = 'emptySchema';
    }
    planOptions.resolver = base;
  }

  return planOptions;
}

/**
 * Resolve count/rows/n into a single positive integer.
 *
 * - If none of the flags are provided, defaults to 1.
 * - If multiple are provided, they must agree on the same numeric value.
 */
export function resolveRowCount(
  options: Pick<CliOptions, 'count' | 'rows' | 'n'>
): number {
  const rawValues: Array<[string, unknown]> = [
    ['rows', options.rows],
    ['count', options.count],
    ['n', options.n],
  ];

  const provided = rawValues.filter(([, value]) => value !== undefined);

  if (provided.length === 0) {
    return 1;
  }

  const parsed: Array<[string, number]> = provided.map(([name, value]) => {
    const num = typeof value === 'number' ? value : Number(String(value));
    if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) {
      throw new Error(
        `Invalid ${name} value "${String(value)}". Expected a positive integer.`
      );
    }
    return [name, num];
  });

  const firstEntry = parsed[0];
  if (!firstEntry) {
    // Defensive; should be unreachable because provided.length > 0.
    return 1;
  }
  const firstValue = firstEntry[1];
  for (let idx = 1; idx < parsed.length; idx += 1) {
    const entry = parsed[idx];
    if (!entry) continue;
    const value = entry[1];
    if (value !== firstValue) {
      const names = parsed.map(([n]) => `--${n}`).join(', ');
      throw new Error(
        `Conflicting row count flags (${names}) with different values.`
      );
    }
  }

  return firstValue;
}

/**
 * Resolve mode/compat into a strict|lax compatibility mode.
 *
 * CLI allows both --mode and --compat for ergonomics; --mode, when provided,
 * takes precedence. Any other value than 'strict' or 'lax' is rejected.
 */
export function resolveCompatMode(
  options: Pick<CliOptions, 'mode' | 'compat'>
): 'strict' | 'lax' {
  const raw = (options.mode ?? options.compat ?? 'strict') as string;
  const normalized = raw.toLowerCase();
  if (normalized === 'strict' || normalized === 'lax') {
    return normalized;
  }
  throw new Error(`Invalid mode "${raw}". Expected "strict" or "lax".`);
}

/**
 * Resolve output format flag into a known format or throw.
 */
export function resolveOutputFormat(value: unknown): OutputFormat {
  if (value === undefined || value === null || value === '') {
    return 'json';
  }
  const raw = String(value).toLowerCase();
  if (raw === 'json' || raw === 'ndjson') {
    return raw;
  }
  throw new Error(
    `Invalid --out value "${String(
      value
    )}". Supported formats are "json" and "ndjson".`
  );
}
