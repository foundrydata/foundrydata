/* eslint-disable max-lines-per-function */

import {
  normalize,
  type NormalizerNote,
  type NormalizeOptions,
} from './transform/schema-normalizer.js';
import {
  compose,
  type ComposeDiagnostics,
  type CoverageIndex,
} from './transform/composition-engine.js';
import { executePipeline } from './pipeline/orchestrator.js';
import type { PipelineResult } from './pipeline/types.js';
import type { CoverageReport } from '@foundrydata/shared';
import type { PlanOptions } from './types/options.js';
import {
  createSourceAjv,
  detectDialectFromSchema,
  prepareSchemaForSourceAjv,
} from './util/ajv-source.js';

// NOTE: The root README “Node.js API” section documents Normalize/Compose/Generate/Validate
// using the facades exported from this module. Any change to their signatures or defaults
// should be reflected in that README section to keep docs and DX in sync.

export type Mode = 'strict' | 'lax';

export interface Diagnostic {
  code: string;
  canonPath: string;
  details?: unknown;
}

export interface NormalizeApiResult {
  /**
   * Canonical 2020-12-like view of the schema produced by the normalizer.
   * The original schema is never mutated.
   */
  canonSchema: unknown;
  /**
   * Map from canonical JSON Pointer to original schema pointer.
   */
  ptrMap: Record<string, string>;
  /**
   * Normalizer notes emitted during canonicalization.
   */
  notes: Diagnostic[];
}

export interface ComposeApiResult {
  /**
   * Coverage index for AP:false objects, keyed by canonical pointer.
   * Each entry exposes has(name) and optional enumerate(k) when finiteness
   * is proven, as produced by the composition engine.
   */
  coverageIndex: CoverageIndex;
  /**
   * Flat list of planning diagnostics (fatal, warn, unsatHints, run-level).
   */
  planDiag: Diagnostic[];
  /**
   * Optional name automaton summary for observability.
   */
  nameDfaSummary?: { states: number; finite: boolean; capsHit?: boolean };
}

export interface ComposeApiOptions {
  /**
   * Compatibility mode for planning and downstream generation.
   */
  mode: Mode;
  /**
   * Optional deterministic seed for branch selection.
   */
  seed?: number;
  /**
   * Optional plan options forwarded to the composition engine.
   */
  planOptions?: Partial<PlanOptions>;
}

export interface NormalizeApiOptions {
  /**
   * Low-level normalizer options; when omitted, conservative defaults apply.
   */
  normalizeOptions?: NormalizeOptions;
}

export interface GenerateOptions {
  /**
   * Strict or lax mode for the end-to-end pipeline.
   * Defaults to 'strict'.
   */
  mode?: Mode;
  /**
   * Prefer schema/OpenAPI examples when present, falling back to generation.
   */
  preferExamples?: boolean;
  /**
   * Plan options forwarded to Normalize/Compose/Generate/Repair/Validate.
   */
  planOptions?: Partial<PlanOptions>;
  /**
   * Per-item repair attempts on validation failure (1–3, default: 1).
   */
  repairAttempts?: number;
  /**
   * When true, enable ajv-formats on both planning and final AJV instances.
   * Defaults to true.
   */
  validateFormats?: boolean;
  /**
   * Enable discriminator keyword support on both AJV instances.
   * Defaults to false.
   */
  discriminator?: boolean;
  /**
   * Enable or disable metrics collection on the pipeline.
   * Defaults to true.
   */
  metricsEnabled?: boolean;
}

/**
 * Async iterable of generated instances backed by a single pipeline run.
 * Consumers can iterate to obtain fixtures and optionally await `result`
 * to access diagnostics and metrics from the underlying PipelineResult.
 */
export interface GenerateIterable extends AsyncIterable<unknown> {
  readonly result: Promise<PipelineResult>;
  readonly coverage?: Promise<CoverageReport | undefined>;
}

export interface ValidateOptions {
  /**
   * When true, enable ajv-formats on the Source AJV instance.
   * Defaults to false to match the core pipeline's format-relaxed default.
   */
  validateFormats?: boolean;
  /**
   * Enable discriminator keyword support on the Source AJV instance.
   * Defaults to false.
   */
  discriminator?: boolean;
  /**
   * Optional PlanOptions used to derive multipleOfPrecision and related flags.
   */
  planOptions?: Partial<PlanOptions>;
}

export interface ValidateResult {
  /**
   * True when the instance passes AJV validation against the original schema.
   */
  valid: boolean;
  /**
   * Raw AJV error objects when validation fails or compilation throws.
   */
  ajvErrors?: unknown[];
}

/**
 * Normalize — Stage 1 of the pipeline.
 *
 * Produces a canonical 2020-12-like view of the schema together with pointer
 * maps and notes. This is a thin facade over `normalize` from
 * `schema-normalizer.ts` and never mutates the original schema.
 */
export function Normalize(
  schema: unknown,
  options?: NormalizeApiOptions
): NormalizeApiResult {
  const normalizeOptions = options?.normalizeOptions;
  const result = normalize(schema, normalizeOptions);
  return {
    canonSchema: result.schema,
    ptrMap: mapToRecord(result.ptrMap),
    notes: result.notes.map(noteToDiagnostic),
  };
}

/**
 * Compose — Stage 2 of the pipeline.
 *
 * Runs normalization followed by the composition engine to produce the
 * CoverageIndex and planning diagnostics. This is a thin facade over
 * `normalize` and `compose`, keeping the core logic in the underlying modules.
 */
export function Compose(
  schema: unknown,
  options: ComposeApiOptions
): ComposeApiResult {
  const normalizeResult = normalize(schema, {
    rewriteConditionals: options.planOptions?.rewriteConditionals,
    guards: options.planOptions?.guards,
  });

  const composeResult = compose(normalizeResult, {
    mode: options.mode,
    seed: options.seed,
    planOptions: options.planOptions,
  });

  return {
    coverageIndex: composeResult.coverageIndex,
    planDiag: flattenComposeDiagnostics(composeResult.diag),
    nameDfaSummary: composeResult.nameDfaSummary,
  };
}

/**
 * Generate — Full 5-stage pipeline (Normalize → Compose → Generate → Repair → Validate).
 *
 * Returns an async iterable of instances backed by a single deterministic
 * pipeline run. The attached `result` promise exposes the underlying
 * PipelineResult (diagnostics, metrics, artifacts) without duplicating logic.
 */
export function Generate(
  k: number,
  seed: number,
  schema: unknown,
  options: GenerateOptions = {}
): GenerateIterable {
  const mode: Mode = options.mode ?? 'strict';
  const planOptions = options.planOptions;
  const validateFormats = options.validateFormats ?? true;
  const discriminator = options.discriminator ?? false;
  const repairAttempts = Math.max(1, Math.min(3, options.repairAttempts ?? 1));

  const pipelinePromise = executePipeline(schema, {
    mode,
    metrics: { enabled: options.metricsEnabled ?? true },
    compose: { planOptions },
    generate: {
      count: k,
      seed,
      planOptions,
      preferExamples: options.preferExamples,
    },
    repair: { attempts: repairAttempts },
    validate: {
      validateFormats,
      discriminator,
    },
  });

  async function* iterator(): AsyncIterableIterator<unknown> {
    const result = await pipelinePromise;
    if (result.status !== 'completed') {
      const stageError = result.errors[0];
      if (stageError) throw stageError;
      throw new Error('Generation pipeline failed');
    }
    const generatedStage = result.stages.generate.output;
    const repairedItems = result.artifacts.repaired;
    const items = Array.isArray(repairedItems)
      ? repairedItems
      : (generatedStage?.items ?? []);
    for (const item of items) {
      // Yield items exactly as validated by the pipeline
      yield item;
    }
  }

  const asyncIterator = iterator() as unknown as GenerateIterable;
  Object.defineProperty(asyncIterator, 'result', {
    value: pipelinePromise,
    enumerable: false,
    writable: false,
  });

  Object.defineProperty(asyncIterator, 'coverage', {
    value: pipelinePromise.then(
      (result) => result.artifacts.coverageReport as CoverageReport | undefined
    ),
    enumerable: false,
    writable: false,
  });

  return asyncIterator;
}

/**
 * Validate — AJV-oracle validation against the original schema.
 *
 * Uses the same Source AJV factory as the core pipeline (unicodeRegExp:true,
 * consistent multipleOfPrecision, optional ajv-formats) to validate a single
 * instance against the original schema. No network I/O is performed.
 */
export function Validate(
  instance: unknown,
  originalSchema: unknown,
  options: ValidateOptions = {}
): ValidateResult {
  const dialect = detectDialectFromSchema(originalSchema);
  const { schemaForAjv } = prepareSchemaForSourceAjv(originalSchema, dialect);
  const planOptions = options.planOptions;
  const validateFormats = options.validateFormats ?? false;
  const discriminator = options.discriminator ?? false;

  try {
    const ajv = createSourceAjv(
      {
        dialect,
        validateFormats,
        discriminator,
      },
      planOptions
    );
    const validateFn = ajv.compile(schemaForAjv as object);
    const ok = validateFn(instance);
    const errors = Array.isArray(validateFn.errors)
      ? (validateFn.errors as unknown[]).slice()
      : undefined;
    return { valid: ok, ajvErrors: errors };
  } catch (error) {
    return { valid: false, ajvErrors: [error] };
  }
}

// Internal helpers

function mapToRecord(map: Map<string, string>): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [key, value] of map.entries()) {
    obj[key] = value;
  }
  return obj;
}

function noteToDiagnostic(note: NormalizerNote): Diagnostic {
  return {
    code: note.code,
    canonPath: note.canonPath,
    details: note.details,
  };
}

function flattenComposeDiagnostics(diag?: ComposeDiagnostics): Diagnostic[] {
  if (!diag) return [];
  const out: Diagnostic[] = [];
  const push = (
    entries?:
      | Array<{ code: string; canonPath: string; details?: unknown }>
      | undefined
  ): void => {
    if (!entries) return;
    for (const entry of entries) {
      out.push({
        code: entry.code,
        canonPath: entry.canonPath,
        details: entry.details,
      });
    }
  };
  push(diag.fatal);
  push(diag.warn);
  push(diag.unsatHints);
  push(diag.run);
  return out;
}
