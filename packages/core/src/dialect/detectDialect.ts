/* eslint-disable max-lines-per-function */

export type Dialect =
  | 'draft-04'
  | 'draft-06'
  | 'draft-07'
  | '2019-09'
  | '2020-12'
  | 'unknown';

type KnownDialect = Exclude<Dialect, 'unknown'>;

const DIALECT_CANONICAL_META: Record<KnownDialect, string> = {
  'draft-04': 'https://json-schema.org/draft-04/schema',
  'draft-06': 'https://json-schema.org/draft-06/schema',
  'draft-07': 'https://json-schema.org/draft-07/schema',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
};

type DialectMetaState = {
  canonical: string;
  synonyms: string[];
};

const DIALECT_META_STATE: Record<KnownDialect, DialectMetaState> = {} as Record<
  KnownDialect,
  DialectMetaState
>;

const URI_DIALECT_BY_NORMALIZED = new Map<string, KnownDialect>();

function normalizeForIndex(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return '';
  const withoutFragment = trimmed.split('#')[0] ?? trimmed;
  const lower = withoutFragment.toLowerCase();
  const normalizedScheme = lower.startsWith('https://')
    ? `http://${lower.slice('https://'.length)}`
    : lower;
  return normalizedScheme.endsWith('/')
    ? normalizedScheme.slice(0, -1)
    : normalizedScheme;
}

function buildSynonyms(canonical: string): string[] {
  const lower = canonical.trim();
  if (!lower) return [];
  const httpVariant = lower.replace(/^https:\/\//, 'http://');
  const httpsVariant = lower.replace(/^http:\/\//, 'https://');
  const bases = new Set<string>([httpVariant, httpsVariant]);
  const synonyms: string[] = [];
  for (const base of bases) {
    synonyms.push(base);
    if (!base.endsWith('#')) {
      synonyms.push(`${base}#`);
    }
  }
  return synonyms;
}

for (const dialect of Object.keys(DIALECT_CANONICAL_META) as KnownDialect[]) {
  const canonical = DIALECT_CANONICAL_META[dialect]!;
  const synonyms = buildSynonyms(canonical);
  DIALECT_META_STATE[dialect] = {
    canonical,
    synonyms,
  };
  for (const uri of synonyms) {
    const key = normalizeForIndex(uri);
    if (!key) continue;
    if (!URI_DIALECT_BY_NORMALIZED.has(key)) {
      URI_DIALECT_BY_NORMALIZED.set(key, dialect);
    }
  }
}

export function getCanonicalMetaUri(dialect: KnownDialect): string {
  return DIALECT_META_STATE[dialect]?.canonical;
}

export function getDialectMetaSynonyms(dialect: KnownDialect): string[] {
  const state = DIALECT_META_STATE[dialect];
  return state ? state.synonyms.slice() : [];
}

export function normalizeDialectUri(uri: string): {
  dialect: Dialect;
  canonicalMetaUri: string;
  synonyms: string[];
} {
  if (typeof uri !== 'string') {
    return { dialect: 'unknown', canonicalMetaUri: '', synonyms: [] };
  }
  const normalized = normalizeForIndex(uri);
  const dialect = URI_DIALECT_BY_NORMALIZED.get(normalized);
  if (!dialect) {
    return {
      dialect: 'unknown',
      canonicalMetaUri: normalized || '',
      synonyms: normalized ? [normalized] : [],
    };
  }
  const state = DIALECT_META_STATE[dialect]!;
  return {
    dialect,
    canonicalMetaUri: state.canonical,
    synonyms: state.synonyms.slice(),
  };
}

interface FeatureFlags {
  hasPrefixItems: boolean;
  hasDefs: boolean;
  hasIfThenElseOrConst: boolean;
  hasLegacyRootId: boolean;
  hasRootDollarId: boolean;
}

function scanFeatureFlags(schema: unknown): FeatureFlags {
  const flags: FeatureFlags = {
    hasPrefixItems: false,
    hasDefs: false,
    hasIfThenElseOrConst: false,
    hasLegacyRootId: false,
    hasRootDollarId: false,
  };

  if (!schema || typeof schema !== 'object') {
    return flags;
  }

  const root = schema as Record<string, unknown>;
  if (typeof root.$id === 'string' && root.$id.trim().length > 0) {
    flags.hasRootDollarId = true;
  }
  if (typeof root.id === 'string' && root.id.trim().length > 0) {
    flags.hasLegacyRootId = true;
  }

  const seen = new WeakSet<object>();
  // eslint-disable-next-line complexity
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (
      !flags.hasPrefixItems &&
      Object.prototype.hasOwnProperty.call(rec, 'prefixItems')
    ) {
      flags.hasPrefixItems = true;
    }
    if (
      !flags.hasDefs &&
      Object.prototype.hasOwnProperty.call(rec, '$defs') &&
      rec.$defs &&
      typeof rec.$defs === 'object'
    ) {
      flags.hasDefs = true;
    }
    if (
      !flags.hasIfThenElseOrConst &&
      (Object.prototype.hasOwnProperty.call(rec, 'if') ||
        Object.prototype.hasOwnProperty.call(rec, 'then') ||
        Object.prototype.hasOwnProperty.call(rec, 'else') ||
        Object.prototype.hasOwnProperty.call(rec, 'const'))
    ) {
      flags.hasIfThenElseOrConst = true;
    }
    if (flags.hasPrefixItems && flags.hasDefs && flags.hasIfThenElseOrConst) {
      return;
    }
    for (const value of Object.values(rec)) {
      visit(value);
    }
  };

  visit(schema);
  return flags;
}

// eslint-disable-next-line complexity
export function detectDialect(schema: unknown): Dialect {
  if (!schema || typeof schema !== 'object') {
    return 'unknown';
  }

  const root = schema as Record<string, unknown>;
  const rawSchema = typeof root.$schema === 'string' ? root.$schema : undefined;

  if (rawSchema) {
    const { dialect } = normalizeDialectUri(rawSchema);
    if (dialect !== 'unknown') {
      return dialect;
    }
    const normalized = normalizeForIndex(rawSchema);
    if (normalized.endsWith('/schema')) {
      return 'draft-04';
    }
    const lowered = rawSchema.trim().toLowerCase();
    if (lowered.includes('2020-12')) return '2020-12';
    if (lowered.includes('2019-09') || lowered.includes('draft/2019-09')) {
      return '2019-09';
    }
    if (lowered.includes('draft-07')) return 'draft-07';
    if (lowered.includes('draft-06')) return 'draft-06';
    if (lowered.includes('draft-04')) return 'draft-04';
  }

  const flags = scanFeatureFlags(schema);

  if (flags.hasPrefixItems) {
    return '2020-12';
  }

  if (flags.hasDefs) {
    return '2019-09';
  }

  if (!flags.hasDefs && flags.hasIfThenElseOrConst) {
    return 'draft-07';
  }

  if (flags.hasLegacyRootId && !flags.hasRootDollarId && !flags.hasDefs) {
    const idVal = (schema as { id?: unknown }).id;
    const idStr = typeof idVal === 'string' ? idVal.trim().toLowerCase() : '';
    if (idStr.includes('draft-04') || idStr.includes('/draft-04/')) {
      return 'draft-04';
    }
    return 'draft-06';
  }

  return 'unknown';
}
