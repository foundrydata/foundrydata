/* eslint-disable max-depth */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import type Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';

import { executePipeline } from './orchestrator.js';
import { type PipelineOptions, type PipelineResult } from './types.js';
import {
  createSourceAjv,
  detectDialectFromSchema,
  prepareSchemaForSourceAjv,
} from '../util/ajv-source.js';
import { resolveOptions } from '../types/options.js';
import type { DiagnosticEnvelope } from '../diag/validate.js';
import {
  collectAllDiagnosticsFromPipeline,
  isUnsatOrFailFastCode,
} from './diagnostic-collector.js';

export type OracleMode = 'strict' | 'lax';

export interface OracleHarnessSchemaConfig {
  id: string;
  schema: unknown;
}

export interface OracleHarnessRunOptions {
  schemas: OracleHarnessSchemaConfig[];
  mode: OracleMode;
  seed: number;
  count: number;
  validateFormats?: boolean;
}

export interface OracleHarnessItemViolation {
  index: number;
  item: unknown;
  errors: unknown[];
}

export type OracleHarnessOutcome =
  | 'ok'
  | 'invalid-items'
  | 'unsat-no-diagnostics';

export interface OracleHarnessSchemaReport {
  schemaId: string;
  mode: OracleMode;
  pipelineResult: PipelineResult;
  generatedItems: unknown[];
  skippedValidation: boolean;
  isSuccessWithItems: boolean;
  shortCircuited: boolean;
  allDiagnostics: DiagnosticEnvelope[];
  unsatDiagnostics: DiagnosticEnvelope[];
  invalidItems: OracleHarnessItemViolation[];
  outcome: OracleHarnessOutcome;
}

export interface OracleHarnessReport {
  ok: boolean;
  runs: OracleHarnessSchemaReport[];
}

/**
 * AJV-oracle validation harness.
 *
 * For each schema and seed, this runs the full Foundry pipeline via
 * {@link executePipeline}, then re-validates any generated instances against
 * a fresh Source AJV compiled from the original schema. It also checks that
 * early UNSAT / fail-fast outcomes are backed by meaningful diagnostics
 * (UNSAT_*, AP_FALSE_UNSAFE_PATTERN, EXTERNAL_REF_UNRESOLVED, etc.).
 */
export async function runOracleHarness(
  options: OracleHarnessRunOptions
): Promise<OracleHarnessReport> {
  const runs: OracleHarnessSchemaReport[] = [];

  for (const entry of options.schemas) {
    const pipelineOptions: PipelineOptions = {
      mode: options.mode,
      generate: {
        count: options.count,
        seed: options.seed,
      },
      validate: {
        validateFormats: options.validateFormats ?? false,
      },
    };

    const pipelineResult = await executePipeline(entry.schema, pipelineOptions);

    const generatedItems = pipelineResult.artifacts.generated?.items ?? [];
    const validation = pipelineResult.artifacts.validation;
    const skippedValidation = validation?.skippedValidation === true;

    const isSuccessWithItems =
      pipelineResult.status === 'completed' &&
      !skippedValidation &&
      generatedItems.length > 0;

    const shortCircuited =
      pipelineResult.status === 'failed' &&
      (pipelineResult.stages.compose.status === 'failed' ||
        pipelineResult.stages.generate.status !== 'completed' ||
        pipelineResult.stages.validate.status !== 'completed');

    const allDiagnostics = collectAllDiagnosticsFromPipeline(pipelineResult);
    const unsatDiagnostics = allDiagnostics.filter((diag) =>
      isUnsatOrFailFastCode(diag.code)
    );

    const invalidItems: OracleHarnessItemViolation[] = [];

    if (isSuccessWithItems) {
      const ajv = createSourceAjvForPipeline(entry.schema, pipelineOptions);
      const { schemaForAjv } = prepareSchemaForSourceAjv(
        entry.schema,
        detectDialectFromSchema(entry.schema)
      );

      let validateFn: ValidateFunction | undefined;
      try {
        validateFn = ajv.compile(schemaForAjv as object);
      } catch (error) {
        invalidItems.push({
          index: -1,
          item: undefined,
          errors: [error],
        });
      }

      if (invalidItems.length === 0 && validateFn) {
        for (let index = 0; index < generatedItems.length; index += 1) {
          const item = generatedItems[index];
          const ok = validateFn(item);
          if (!ok) {
            const errors = Array.isArray(validateFn.errors)
              ? validateFn.errors.map((err) => ({ ...err }))
              : [];
            invalidItems.push({ index, item, errors });
          }
        }
      }
    }

    const outcome: OracleHarnessOutcome =
      isSuccessWithItems && invalidItems.length > 0
        ? 'invalid-items'
        : shortCircuited && unsatDiagnostics.length === 0
          ? 'unsat-no-diagnostics'
          : 'ok';

    runs.push({
      schemaId: entry.id,
      mode: options.mode,
      pipelineResult,
      generatedItems,
      skippedValidation,
      isSuccessWithItems,
      shortCircuited,
      allDiagnostics,
      unsatDiagnostics,
      invalidItems,
      outcome,
    });
  }

  const ok = runs.every((run) => run.outcome === 'ok');

  return { ok, runs };
}

export function assertOracleInvariants(report: OracleHarnessReport): void {
  for (const run of report.runs) {
    if (run.isSuccessWithItems && run.invalidItems.length > 0) {
      throw new Error(
        `AJV-oracle invariant failed for schema "${run.schemaId}" in mode "${run.mode}": pipeline completed with generated items, but AJV reported ${run.invalidItems.length} invalid instance(s).`
      );
    }

    if (run.shortCircuited && run.unsatDiagnostics.length === 0) {
      throw new Error(
        `AJV-oracle invariant failed for schema "${run.schemaId}" in mode "${run.mode}": pipeline short-circuited without emitting UNSAT/fail-fast diagnostics.`
      );
    }
  }
}

function createSourceAjvForPipeline(
  schema: unknown,
  pipelineOptions: PipelineOptions
): Ajv {
  const planOptions = pipelineOptions.generate?.planOptions;
  const resolved = resolveOptions(planOptions);
  const shouldAlignMoP =
    resolved.rational.fallback === 'decimal' ||
    resolved.rational.fallback === 'float';
  const expectedMoP = shouldAlignMoP
    ? resolved.rational.decimalPrecision
    : undefined;

  const validateFormats = Boolean(pipelineOptions.validate?.validateFormats);
  const discriminator = Boolean(pipelineOptions.validate?.discriminator);
  const dialect = detectDialectFromSchema(schema);
  const mode: OracleMode = pipelineOptions.mode ?? 'strict';

  const ajv = createSourceAjv(
    {
      dialect,
      validateFormats,
      discriminator,
      multipleOfPrecision: expectedMoP,
      tolerateInvalidPatterns: mode === 'lax',
    },
    planOptions
  );

  return ajv;
}
