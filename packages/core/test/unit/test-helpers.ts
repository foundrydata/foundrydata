/* eslint-disable complexity */
import type Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';

import {
  normalize,
  type NormalizeOptions,
  type NormalizeResult,
} from '../../src/transform/schema-normalizer.js';
import {
  compose,
  type ComposeOptions,
  type ComposeResult,
} from '../../src/transform/composition-engine.js';
import {
  generateFromCompose,
  type FoundryGeneratorOptions,
  type GeneratorStageOutput,
} from '../../src/generator/foundry-generator.js';
import {
  createSourceAjv,
  type JsonSchemaDialect,
} from '../../src/util/ajv-source.js';
import type { PlanOptions } from '../../src/types/options.js';

export interface ComposePipelineOptions {
  normalize?: NormalizeOptions;
  compose?: ComposeOptions;
}

export interface PipelineRunOptions extends ComposePipelineOptions {
  generate?: FoundryGeneratorOptions;
  planOptions?: Partial<PlanOptions>;
}

export function normalizeSchema(
  schema: unknown,
  options?: NormalizeOptions
): NormalizeResult {
  return normalize(schema, options);
}

export function composeEffective(
  schema: unknown,
  options: ComposePipelineOptions = {}
): {
  canonical: ComposeResult;
  normalize: NormalizeResult;
} {
  const normalized = normalizeSchema(schema, options.normalize);
  const composed = compose(normalized, options.compose);
  return { normalize: normalized, canonical: composed };
}

export function runPipelineStages(
  schema: unknown,
  options: PipelineRunOptions = {}
): {
  normalize: NormalizeResult;
  compose: ComposeResult;
  generate: GeneratorStageOutput;
} {
  const normalized = normalizeSchema(schema, options.normalize);
  const composed = compose(normalized, options.compose);
  const generated = generateFromCompose(composed, {
    ...options.generate,
    sourceSchema: schema,
    planOptions: options.planOptions,
  });
  return { normalize: normalized, compose: composed, generate: generated };
}

export function detectDialectFromSchema(schema: unknown): JsonSchemaDialect {
  if (schema && typeof schema === 'object') {
    const value = (schema as Record<string, unknown>)['$schema'];
    if (typeof value === 'string') {
      const lowered = value.toLowerCase();
      if (lowered.includes('2020-12')) return '2020-12';
      if (lowered.includes('2019-09') || lowered.includes('draft-2019')) {
        return '2019-09';
      }
      if (lowered.includes('draft-07') || lowered.includes('draft-06')) {
        return 'draft-07';
      }
      if (lowered.includes('draft-04') || lowered.endsWith('/schema#')) {
        return 'draft-04';
      }
    }
  }
  return '2020-12';
}

export function createSourceAjvForSchema(
  schema: unknown,
  params: {
    validateFormats?: boolean;
    multipleOfPrecision?: number;
    discriminator?: boolean;
  } = {},
  planOptions?: Partial<PlanOptions>
): Ajv {
  const dialect = detectDialectFromSchema(schema);
  return createSourceAjv(
    {
      dialect,
      validateFormats: params.validateFormats,
      multipleOfPrecision: params.multipleOfPrecision,
      discriminator: params.discriminator,
    },
    planOptions
  );
}

export function compileOneOfBranchValidators(
  ajv: Ajv,
  schema: Record<string, unknown>
): ValidateFunction[] {
  const oneOf = Array.isArray(schema.oneOf) ? (schema.oneOf as unknown[]) : [];
  return oneOf.map((branch) =>
    ajv.compile({
      $id: undefined,
      ...branch,
    })
  );
}

export function collectCoverageNames(entry: {
  has: (name: string) => boolean;
  enumerate?: () => string[];
}): Set<string> {
  const names = new Set<string>();
  if (entry.enumerate) {
    for (const value of entry.enumerate()) {
      names.add(value);
    }
  }
  if (!entry.enumerate) {
    const alphabet = ['a', 'b', 'c', 'kind', 'alpha', 'beta'];
    for (const candidate of alphabet) {
      if (entry.has(candidate)) {
        names.add(candidate);
      }
    }
  }
  return names;
}
