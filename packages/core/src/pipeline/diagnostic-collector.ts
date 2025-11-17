/* eslint-disable max-lines-per-function */
import { DIAGNOSTIC_CODES, type DiagnosticCode } from '../diag/codes.js';
import type { DiagnosticEnvelope } from '../diag/validate.js';
import type { PipelineResult } from './types.js';

export function collectAllDiagnosticsFromPipeline(
  result: PipelineResult
): DiagnosticEnvelope[] {
  const diagnostics: DiagnosticEnvelope[] = [];

  const normalizeNotes = result.stages.normalize.output?.notes ?? [];
  for (const note of normalizeNotes) {
    diagnostics.push({
      code: note.code,
      canonPath: note.canonPath,
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
      diagnostics.push(entry);
    }
  }

  const validationDiagnostics = result.artifacts.validationDiagnostics;
  if (validationDiagnostics) {
    diagnostics.push(...validationDiagnostics);
  }

  const repairDiagnostics = result.artifacts.repairDiagnostics;
  if (repairDiagnostics) {
    diagnostics.push(...repairDiagnostics);
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
