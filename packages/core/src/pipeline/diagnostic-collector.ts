/* eslint-disable max-lines-per-function */
import {
  DIAGNOSTIC_CODES,
  DIAGNOSTIC_PHASES,
  type DiagnosticCode,
} from '../diag/codes.js';
import type { DiagnosticEnvelope } from '../diag/validate.js';
import type { PipelineResult } from './types.js';

// eslint-disable-next-line complexity
export function collectAllDiagnosticsFromPipeline(
  result: PipelineResult
): DiagnosticEnvelope[] {
  const diagnostics: DiagnosticEnvelope[] = [];

  const normalizeNotes = result.stages.normalize.output?.notes ?? [];
  for (const note of normalizeNotes) {
    diagnostics.push({
      code: note.code,
      canonPath: note.canonPath,
      phase: DIAGNOSTIC_PHASES.NORMALIZE,
      details: note.details,
    });
  }

  const composeOutput = result.stages.compose.output;
  const composeDiag = composeOutput?.diag;
  if (composeDiag) {
    const addGroup = (
      entries?:
        | Array<{ code: DiagnosticCode; canonPath: string; details?: unknown }>
        | Array<{
            code: DiagnosticCode;
            canonPath: string;
            provable?: boolean;
            reason?: string;
            details?: unknown;
          }>
    ): void => {
      if (!entries) return;
      for (const entry of entries) {
        diagnostics.push({
          code: entry.code,
          canonPath: entry.canonPath,
          phase: DIAGNOSTIC_PHASES.COMPOSE,
          details: ('details' in entry ? entry.details : undefined) as unknown,
        });
      }
    };

    addGroup(composeDiag.fatal);
    addGroup(composeDiag.warn);
    addGroup(composeDiag.unsatHints);
    addGroup(composeDiag.run);
  }

  const generated = result.artifacts.generated;
  if (generated?.diagnostics) {
    for (const entry of generated.diagnostics) {
      const budget = entry.budget
        ? {
            tried: entry.budget.tried,
            limit: entry.budget.limit,
            skipped: entry.budget.skipped,
            // Map internal reasons to generic complexityCap per SPEC
            reason:
              entry.budget.reason === 'candidateBudget' ||
              entry.budget.reason === 'witnessDomainExhausted'
                ? 'complexityCap'
                : entry.budget.reason,
          }
        : undefined;
      diagnostics.push({
        code: entry.code,
        canonPath: entry.canonPath,
        phase: DIAGNOSTIC_PHASES.GENERATE,
        details: entry.details,
        budget,
        scoreDetails: entry.scoreDetails,
      });
    }
  }

  const validationDiagnostics = result.artifacts.validationDiagnostics;
  if (validationDiagnostics) {
    diagnostics.push(
      ...validationDiagnostics.map((d) => ({
        code: d.code,
        canonPath: d.canonPath,
        phase: DIAGNOSTIC_PHASES.VALIDATE,
        details: d.details,
        metrics: d.metrics,
        budget: d.budget,
        scoreDetails: d.scoreDetails,
      }))
    );
  }

  const repairDiagnostics = result.artifacts.repairDiagnostics;
  if (repairDiagnostics) {
    diagnostics.push(
      ...repairDiagnostics.map((d) => ({
        code: d.code,
        canonPath: d.canonPath,
        phase: DIAGNOSTIC_PHASES.REPAIR,
        details: d.details,
        metrics: d.metrics,
        budget: d.budget,
        scoreDetails: d.scoreDetails,
      }))
    );
  }

  return diagnostics;
}

export function isUnsatOrFailFastCode(code: DiagnosticCode): boolean {
  if (typeof code !== 'string') {
    return false;
  }

  if (code.startsWith('UNSAT_')) {
    return true;
  }

  return (
    code === DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN ||
    code === DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED ||
    code === DIAGNOSTIC_CODES.SCHEMA_INTERNAL_REF_MISSING ||
    code === DIAGNOSTIC_CODES.VALIDATION_COMPILE_ERROR
  );
}
