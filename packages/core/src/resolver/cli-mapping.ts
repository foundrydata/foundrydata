/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */
import type { PlanOptions } from '../types/options.js';

export interface ResolverCliOptions {
  /**
   * Comma-separated resolver strategies, e.g. "local,remote,schemastore".
   */
  resolve?: string;
  /**
   * Resolver cache directory; supports POSIX ~ expansion.
   */
  cacheDir?: string;
  /**
   * Optional curated snapshot path (NDJSON); disables remote fetch when set.
   */
  snapshotPath?: string;
  /**
   * Optional allow-list of hosts; empty ⇒ no additional restriction.
   */
  allowHosts?: string[];
  /**
   * Whether the final Source AJV should be hydrated from the resolver
   * registry before compile(original). Default: true.
   */
  hydrateFinalAjv?: boolean;
  /**
   * Planning-time stub mode for unresolved external refs. Only 'emptySchema'
   * is currently supported from the CLI.
   */
  stubUnresolved?: 'emptySchema';
}

/**
 * Map resolver-specific CLI flags into PlanOptions.resolver.
 *
 * This helper is shared between tooling entrypoints (e.g., scripts/run-corpus.ts)
 * so that Extension R1 behaves consistently across harnesses.
 */
export function mapResolverCliOptionsToPlanOptions(
  cli: ResolverCliOptions,
  base?: Partial<PlanOptions>
): Partial<PlanOptions> {
  const planOptions: Partial<PlanOptions> = { ...(base ?? {}) };

  type ResolverPlan = NonNullable<PlanOptions['resolver']>;
  const resolver: ResolverPlan = {
    ...(planOptions.resolver ?? {}),
  } as ResolverPlan;

  if (typeof cli.resolve === 'string' && cli.resolve.trim().length > 0) {
    const parts = cli.resolve
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0) as Array<
      'local' | 'remote' | 'schemastore'
    >;
    if (parts.length > 0) {
      resolver.strategies = parts;
    }
  }

  if (typeof cli.cacheDir === 'string' && cli.cacheDir.trim().length > 0) {
    resolver.cacheDir = cli.cacheDir;
  }

  if (
    typeof cli.snapshotPath === 'string' &&
    cli.snapshotPath.trim().length > 0
  ) {
    resolver.snapshotPath = cli.snapshotPath;
  }

  if (Array.isArray(cli.allowHosts) && cli.allowHosts.length > 0) {
    const existing = new Set<string>(resolver.allowlist ?? []);
    for (const host of cli.allowHosts) {
      const trimmed = host.trim();
      if (!trimmed) continue;
      existing.add(trimmed);
    }
    resolver.allowlist = Array.from(existing);
  }

  if (typeof cli.hydrateFinalAjv === 'boolean') {
    resolver.hydrateFinalAjv = cli.hydrateFinalAjv;
  }

  if (cli.stubUnresolved === 'emptySchema') {
    resolver.stubUnresolved = 'emptySchema';
  }

  if (Object.keys(resolver).length > 0) {
    planOptions.resolver = resolver;
  }

  return planOptions;
}
