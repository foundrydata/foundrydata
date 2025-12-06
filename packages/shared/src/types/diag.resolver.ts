export type ResolverStrategy = 'local' | 'remote' | 'schemastore';

export type ResolverDiagnosticCode =
  | 'RESOLVER_STRATEGIES_APPLIED'
  | 'RESOLVER_CACHE_HIT'
  | 'RESOLVER_CACHE_MISS_FETCHED'
  | 'RESOLVER_OFFLINE_UNAVAILABLE'
  | 'RESOLVER_ADD_SCHEMA_SKIPPED_INCOMPATIBLE_DIALECT'
  | 'RESOLVER_ADD_SCHEMA_SKIPPED_DUPLICATE_ID'
  | 'RESOLVER_SNAPSHOT_APPLIED'
  | 'RESOLVER_SNAPSHOT_LOAD_FAILED'
  | 'RESOLVER_SNAPSHOT_FINGERPRINT_MISMATCH'
  | 'EXTERNAL_REF_STUBBED'
  | 'EXTERNAL_REF_UNRESOLVED';

export interface ResolverStrategiesAppliedDetails {
  strategies: ResolverStrategy[];
  requested: ResolverStrategy[];
  cacheDir: string | null;
  snapshotPath?: string;
  registryFingerprint?: string;
}

export interface ResolverCacheHitDetails {
  ref: string;
  contentHash: string;
  alias?: string;
}

export interface ResolverCacheMissFetchedDetails {
  ref: string;
  bytes: number;
  contentHash: string;
}

export interface ResolverOfflineUnavailableDetails {
  ref: string;
  reason?:
    | 'no-strategy'
    | 'host-not-allowed'
    | 'max-docs'
    | 'fetch-error'
    | (string & {});
  limit?: number;
  error?: string;
}

export interface ResolverSnapshotAppliedDetails {
  path: string;
  count: number;
  fingerprint: string;
}

export interface ResolverSnapshotLoadFailedDetails {
  path?: string;
  message?: string;
  reason?: 'invalid-entry' | 'hash-failed' | 'parse-error' | (string & {});
  line?: string;
  uri?: string;
}

export interface ResolverSnapshotFingerprintMismatchDetails {
  path: string;
  declared: string;
  actual: string;
}

export interface ResolverAddSchemaSkippedIncompatibleDialectDetails {
  uri: string;
  docDialect: string;
  targetDialect?: string;
}

export interface ResolverAddSchemaSkippedDuplicateIdDetails {
  ref: string;
  id?: string;
  existingRef?: string;
  contentHash?: string;
  reason?: string;
  error?: string;
}

export interface ExternalRefStubbedDetails {
  ref: string;
  stubKind: 'emptySchema';
}

export interface ExternalRefUnresolvedDetails {
  ref?: string;
  mode?: 'strict' | 'lax';
  skippedValidation?: boolean;
  policy?: 'error' | 'warn' | 'ignore';
  failingRefs?: string[];
}

type RunDiagBase<Code extends ResolverDiagnosticCode, Details> = {
  code: Code;
  canonPath: '#';
  details: Details;
  phase?: 'compose';
};

export type ResolverRunDiagnostic =
  | RunDiagBase<'RESOLVER_STRATEGIES_APPLIED', ResolverStrategiesAppliedDetails>
  | RunDiagBase<'RESOLVER_CACHE_HIT', ResolverCacheHitDetails>
  | RunDiagBase<'RESOLVER_CACHE_MISS_FETCHED', ResolverCacheMissFetchedDetails>
  | RunDiagBase<
      'RESOLVER_OFFLINE_UNAVAILABLE',
      ResolverOfflineUnavailableDetails
    >
  | RunDiagBase<
      'RESOLVER_ADD_SCHEMA_SKIPPED_INCOMPATIBLE_DIALECT',
      ResolverAddSchemaSkippedIncompatibleDialectDetails
    >
  | RunDiagBase<
      'RESOLVER_ADD_SCHEMA_SKIPPED_DUPLICATE_ID',
      ResolverAddSchemaSkippedDuplicateIdDetails
    >
  | RunDiagBase<'RESOLVER_SNAPSHOT_APPLIED', ResolverSnapshotAppliedDetails>
  | RunDiagBase<
      'RESOLVER_SNAPSHOT_LOAD_FAILED',
      ResolverSnapshotLoadFailedDetails
    >
  | RunDiagBase<
      'RESOLVER_SNAPSHOT_FINGERPRINT_MISMATCH',
      ResolverSnapshotFingerprintMismatchDetails
    >
  | RunDiagBase<'EXTERNAL_REF_STUBBED', ExternalRefStubbedDetails>
  | (RunDiagBase<'EXTERNAL_REF_UNRESOLVED', ExternalRefUnresolvedDetails> & {
      phase?: 'compose' | 'validate';
    });

export type ResolverRunDiagnostics = ResolverRunDiagnostic[];
