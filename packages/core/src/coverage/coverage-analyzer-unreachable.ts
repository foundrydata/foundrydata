import type { CoverageTarget } from '@foundrydata/shared';
import type { ComposeDiagnostics } from '../transform/composition-engine.js';

interface UnsatPathEntry {
  canonPath: string;
  code: string;
  details?: unknown;
}

const STRONG_UNSAT_CODES = new Set<string>([
  'UNSAT_AP_FALSE_EMPTY_COVERAGE',
  'UNSAT_NUMERIC_BOUNDS',
  'UNSAT_REQUIRED_AP_FALSE',
  'UNSAT_REQUIRED_VS_PROPERTYNAMES',
  'UNSAT_DEPENDENT_REQUIRED_AP_FALSE',
  'UNSAT_MINPROPERTIES_VS_COVERAGE',
  'UNSAT_MINPROPS_PNAMES',
]);

function collectUnsatPathEntries(
  planDiag?: ComposeDiagnostics
): UnsatPathEntry[] {
  if (!planDiag) {
    return [];
  }
  const entries: UnsatPathEntry[] = [];
  const addEntry = (
    code: string,
    canonPath: string,
    details?: unknown
  ): void => {
    if (!canonPath || !STRONG_UNSAT_CODES.has(code)) {
      return;
    }
    entries.push({ code, canonPath, details });
  };

  for (const entry of planDiag.fatal ?? []) {
    addEntry(entry.code, entry.canonPath, entry.details);
  }

  for (const hint of planDiag.unsatHints ?? []) {
    if (hint.provable === true) {
      addEntry(hint.code, hint.canonPath, hint.details);
    }
  }

  return entries;
}

export function buildUnsatPathSet(planDiag?: ComposeDiagnostics): Set<string> {
  return new Set(
    collectUnsatPathEntries(planDiag).map((entry) => entry.canonPath)
  );
}

function findUnsatEntryForPath(
  targetCanonPath: string,
  entries: UnsatPathEntry[]
): UnsatPathEntry | undefined {
  if (!targetCanonPath || entries.length === 0) {
    return undefined;
  }
  for (const entry of entries) {
    const unsatPath = entry.canonPath;
    if (!unsatPath) {
      continue;
    }
    if (targetCanonPath === unsatPath) {
      return entry;
    }
    if (
      targetCanonPath.startsWith(unsatPath) &&
      (targetCanonPath.length === unsatPath.length ||
        targetCanonPath.charAt(unsatPath.length) === '/' ||
        (unsatPath.endsWith('/') && targetCanonPath.startsWith(unsatPath)))
    ) {
      return entry;
    }
  }
  return undefined;
}

function buildConflictMeta(
  existingMeta: Record<string, unknown> | undefined,
  entry: UnsatPathEntry
): Record<string, unknown> {
  const detail =
    entry.details !== undefined ? { conflictReasonDetail: entry.details } : {};
  return {
    ...(existingMeta ?? {}),
    conflictDetected: true,
    conflictReasonCode: entry.code,
    conflictReasonCanonPath: entry.canonPath,
    ...detail,
  };
}

export function applyUnreachableStatusToTargets(
  targets: CoverageTarget[],
  planDiag?: ComposeDiagnostics
): CoverageTarget[] {
  const entries = collectUnsatPathEntries(planDiag);
  if (entries.length === 0) {
    return targets;
  }

  return targets.map((target) => {
    const canonPath = target.canonPath || '';
    const matching = findUnsatEntryForPath(canonPath, entries);
    if (!matching) {
      return target;
    }
    const existingMeta =
      target.meta && typeof target.meta === 'object'
        ? (target.meta as Record<string, unknown>)
        : undefined;
    return {
      ...target,
      status:
        target.kind === 'SCHEMA_REUSED_COVERED' ? 'deprecated' : 'unreachable',
      meta: buildConflictMeta(existingMeta, matching),
    } as CoverageTarget;
  });
}
