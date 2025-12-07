import type { PipelineOptions } from '@foundrydata/core';

import type { GateConfig } from '../gates/index.js';
import type { PlanOptions } from '../model/report.js';

export interface EngineRunOptions {
  schema: unknown;
  schemaId: string;
  schemaPath?: string;
  planOptions?: PlanOptions;
  maxInstances?: number;
  seed?: number;
  coverage?: PipelineOptions['coverage'];
  gateConfig?: GateConfig;
}
