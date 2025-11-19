import {
  DIAGNOSTIC_CODES,
  getDiagnosticPhase,
  type DiagnosticCode,
  type DiagnosticPhase,
} from '../diag/codes.js';
import type { DiagnosticEnvelope } from '../diag/validate.js';

export function dedupeDiagnosticsForCorpus(
  diagnostics: DiagnosticEnvelope[]
): DiagnosticEnvelope[] {
  if (diagnostics.length <= 1) {
    return diagnostics;
  }

  const seen = new Set<string>();
  const result: DiagnosticEnvelope[] = [];

  for (const diag of diagnostics) {
    const phase = getDiagnosticPhase(diag.code);
    const key = buildDiagnosticDedupeKey(diag, phase);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diag);
  }

  return result;
}

function buildDiagnosticDedupeKey(
  diag: DiagnosticEnvelope,
  phase: DiagnosticPhase | undefined
): string {
  const phaseKey = phase ?? 'any';
  const detailKey = buildDiagnosticDetailKey(diag.code, diag.details);
  return `${String(diag.code)}::${phaseKey}::${diag.canonPath}::${detailKey}`;
}

function buildDiagnosticDetailKey(
  code: DiagnosticCode,
  details: unknown
): string {
  if (
    code === DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED ||
    code === DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR
  ) {
    if (details && typeof details === 'object') {
      const value = details as {
        context?: unknown;
        patternSource?: unknown;
      };
      const context =
        typeof value.context === 'string'
          ? value.context
          : value.context === undefined
            ? ''
            : String(value.context);
      const patternSource =
        typeof value.patternSource === 'string'
          ? value.patternSource
          : value.patternSource === undefined
            ? ''
            : String(value.patternSource);
      return `context=${context}|patternSource=${patternSource}`;
    }
    return 'regex';
  }

  if (code === DIAGNOSTIC_CODES.TARGET_ENUM_ROUNDROBIN_PATTERNPROPS) {
    // Aggregate this generator-only note at run level by code/path/phase.
    return '';
  }

  if (details === undefined) {
    return '';
  }

  try {
    return JSON.stringify(details);
  } catch {
    return '';
  }
}
