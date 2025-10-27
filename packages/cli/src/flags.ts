/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import { type PlanOptions } from '@foundrydata/core';

/**
 * CLI options interface matching Commander.js option structure
 */
interface CliOptions {
  rewriteConditionals?: 'never' | 'safe' | 'aggressive';
  debugFreeze?: boolean;
  skipTrials?: boolean;
  trialsPerBranch?: number;
  maxBranchesToTry?: number;
  skipTrialsIfBranchesGt?: number;
  externalRefStrict?: 'error' | 'warn' | 'ignore';
  dynamicRefStrict?: 'warn' | 'note';
  encodingBigintJson?: 'string' | 'number' | 'error';
  metrics?: boolean;
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
