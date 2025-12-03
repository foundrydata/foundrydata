import type { CliOptions } from './flags';

export type GValidProfileId = 'compat' | 'strict' | 'relaxed';

function parseGValidProfile(raw: unknown): GValidProfileId | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  const value = String(raw).toLowerCase();
  if (value === 'compat' || value === 'strict' || value === 'relaxed') {
    return value;
  }
  throw new Error(
    `Invalid --gvalid-profile value "${String(
      raw
    )}". Expected one of: compat, strict, relaxed.`
  );
}

/**
 * Apply a G_valid CLI profile on top of existing options.
 *
 * Rules:
 * - compat: no-op (preserves current defaults and explicit flags).
 * - strict: enables gvalid=true when not already set.
 * - relaxed: enables gvalid=true and gvalidRelaxRepair=true when not already set.
 * - Explicit --gvalid/--gvalid-relax-repair flags always take precedence.
 */
export function applyGValidProfileToCliOptions(
  base: CliOptions,
  rawProfile: unknown
): CliOptions {
  const profile = parseGValidProfile(rawProfile);
  if (!profile || profile === 'compat') {
    return base;
  }

  const next: CliOptions = { ...base };

  if (typeof next.gvalid !== 'boolean') {
    next.gvalid = true;
  }

  if (profile === 'relaxed' && next.gvalidRelaxRepair === undefined) {
    next.gvalidRelaxRepair = true;
  }

  return next;
}
