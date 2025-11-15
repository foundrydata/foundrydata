import type { ReportSummary } from '../model/report.js';

export interface BenchConfigEntry {
  id: string;
  schema: string;
  schemaId?: string;
  maxInstances?: number;
  seed?: number;
  planOptions?: unknown;
}

export type BenchConfig = BenchConfigEntry[];

export type BenchLevel = 'ok' | 'limited' | 'blocked';

export interface BenchSchemaSummary {
  id: string;
  schemaId: string;
  schemaPath: string;
  reportPath: string;
  summary: ReportSummary;
  level: BenchLevel;
}

export interface BenchTotals {
  schemas: number;
  instances: number;
  composeFatal: number;
  composeWarn: number;
  composeRunLevel: number;
  validateErrors: number;
  invalidInstances: number;
}

export interface BenchRunSummary {
  runId: string;
  generatedAt: string;
  toolName: string;
  toolVersion: string;
  engineVersion?: string;
  configPath: string;
  outDir: string;
  schemas: BenchSchemaSummary[];
  totals: BenchTotals;
}
