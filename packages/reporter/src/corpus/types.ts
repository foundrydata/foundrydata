import type { DiagnosticEnvelope } from '@foundrydata/core';

export type CorpusMode = 'strict' | 'lax';

export interface CorpusSchemaMetrics {
  normalizeMs?: number;
  composeMs?: number;
  generateMs?: number;
  repairMs?: number;
  validateMs?: number;
  validationsPerRow?: number;
  repairPassesPerRow?: number;
  // Name automaton / name enumeration metrics (R3)
  nameBfsNodesExpanded?: number;
  nameBfsQueuePeak?: number;
  nameBeamWidthPeak?: number;
  nameEnumResults?: number;
  nameEnumElapsedMs?: number;
  patternPropsHit?: number;
  presencePressureResolved?: boolean;
}

export interface CorpusSchemaCaps {
  regexCapped?: number;
  nameAutomatonCapped?: number;
  smtTimeouts?: number;
}

export interface CorpusSchemaResult {
  id: string;
  mode: CorpusMode;
  schemaPath?: string;
  instancesTried: number;
  instancesValid: number;
  unsat: boolean;
  failFast: boolean;
  diagnostics: DiagnosticEnvelope[];
  metrics?: CorpusSchemaMetrics;
  caps?: CorpusSchemaCaps;
}

export interface CorpusRunSummary {
  totalSchemas: number;
  schemasWithSuccess: number;
  totalInstancesTried: number;
  totalInstancesValid: number;
  unsatCount: number;
  failFastCount: number;
  caps: {
    regexCapped: number;
    nameAutomatonCapped: number;
    smtTimeouts: number;
  };
}

export interface CorpusRunReport {
  mode: CorpusMode;
  seed: number;
  instancesPerSchema: number;
  results: CorpusSchemaResult[];
  summary: CorpusRunSummary;
}
