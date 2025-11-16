import type { PlanOptions } from '../model/report.js';

export interface EngineRunOptions {
  schema: unknown;
  schemaId: string;
  schemaPath?: string;
  planOptions?: PlanOptions;
  maxInstances?: number;
  seed?: number;
}
