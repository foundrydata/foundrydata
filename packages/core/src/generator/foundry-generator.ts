/* eslint-disable max-depth */
/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
/**
 * FoundryGenerator: Orchestrates Parse → Plan → Generate → Validate
 */

import { ok, err, type Result } from '../types/result';
import {
  ParseError,
  GenerationError,
  ValidationError,
  ConfigError,
  type FoundryError,
} from '../types/errors';
import type { Schema } from '../types/schema';
import {
  ParserRegistry,
  JSONSchemaParser,
  createDefaultParserRegistry,
} from '../parser';
import {
  FormatRegistry,
  defaultFormatRegistry,
  initializeBuiltInFormats,
} from '../registry/format-registry';
import {
  UUIDGenerator,
  EmailGenerator,
  DateGenerator,
  DateTimeGenerator,
} from './formats';
import type { FormatOptions } from '../registry/format-registry';
import {
  createGeneratorContext,
  type GeneratorContext,
} from './data-generator';
import { ObjectGenerator } from './types/object-generator';
import { ArrayGenerator } from './types/array-generator';
import { StringGenerator } from './types/string-generator';
import { NumberGenerator } from './types/number-generator';
import { IntegerGenerator } from './types/integer-generator';
import { BooleanGenerator } from './types/boolean-generator';
import {
  ComplianceValidator,
  type ComplianceReport,
} from '../validator/compliance-validator';

export enum PipelineStage {
  Parse = 'parse',
  Resolve = 'resolve',
  Plan = 'plan',
  Generate = 'generate',
  Validate = 'validate',
}

export interface PipelineDurations {
  parseMs: number;
  resolveMs: number;
  planMs: number;
  generateMs: number;
  validateMs: number;
  totalMs: number;
}

export interface PipelineMetrics {
  durations: PipelineDurations;
  itemsGenerated: number;
  formatsUsed: string[];
  validatorCacheHitRate?: number;
  compiledSchemas?: number;
  memory?: { rss: number; heapUsed: number };
  itemsRepaired?: number;
  repairAttemptsUsed?: number;
}

export interface GenerationPlan {
  generator:
    | ObjectGenerator
    | ArrayGenerator
    | StringGenerator
    | NumberGenerator
    | IntegerGenerator
    | BooleanGenerator;
  schema: Schema;
  formatRegistry: FormatRegistry;
  /** List of unsupported features detected (compat=lax) */
  unsupportedFeatures?: string[];
  compat?: 'strict' | 'lax';
}

export interface GenerationOptions {
  seed?: number;
  locale?: string;
  count?: number;
  /** Additional retry attempts per item when initial validation fails */
  repairAttempts?: number;
  /** Compatibility mode: 'strict' (default) fails on unsupported features, 'lax' proceeds */
  compat?: 'strict' | 'lax';
}

export interface GenerationOutput {
  items: unknown[];
  report: ComplianceReport;
  metrics: PipelineMetrics;
  seed: number;
}

/**
 * Simple seed normalizer/deriver for per-item determinism
 */
class SeedManager {
  normalize(seed?: number): number {
    if (typeof seed !== 'number' || !Number.isFinite(seed)) return 123456789;
    // Force 32-bit unsigned for stability
    return seed >>> 0;
  }

  derive(baseSeed: number, index: number): number {
    // Simple derivation: base plus index in 32-bit space
    return (baseSeed + (index >>> 0)) >>> 0;
  }
}

/**
 * Wrapper around FormatRegistry to track which formats were used
 */
class FormatRegistryWithMetrics extends FormatRegistry {
  private readonly inner: FormatRegistry;
  private readonly used = new Set<string>();

  constructor(inner?: FormatRegistry) {
    super();
    this.inner = inner ?? defaultFormatRegistry;
  }

  override generate(
    format: string,
    options?: FormatOptions
  ): Result<string, GenerationError> {
    this.used.add(format);
    return this.inner.generate(format, options);
  }

  override validate(format: string, value: string): boolean {
    this.used.add(format);
    return this.inner.validate(format, value);
  }

  getUsedFormats(): string[] {
    return Array.from(this.used.values()).sort();
  }
}

/**
 * Simple stage timer utility
 */
class MetricsCollector {
  private marks = new Map<PipelineStage, number>();
  private durations: PipelineDurations = {
    parseMs: 0,
    resolveMs: 0,
    planMs: 0,
    generateMs: 0,
    validateMs: 0,
    totalMs: 0,
  };

  start(stage: PipelineStage): void {
    this.marks.set(stage, Date.now());
  }

  end(stage: PipelineStage): void {
    const start = this.marks.get(stage) ?? Date.now();
    const delta = Date.now() - start;
    switch (stage) {
      case PipelineStage.Parse:
        this.durations.parseMs = delta;
        break;
      case PipelineStage.Plan:
        this.durations.planMs = delta;
        break;
      case PipelineStage.Resolve:
        this.durations.resolveMs = delta;
        break;
      case PipelineStage.Generate:
        this.durations.generateMs = delta;
        break;
      case PipelineStage.Validate:
        this.durations.validateMs = delta;
        break;
    }
  }

  finalize(): PipelineDurations {
    this.durations.totalMs =
      this.durations.parseMs +
      this.durations.resolveMs +
      this.durations.planMs +
      this.durations.generateMs +
      this.durations.validateMs;
    return this.durations;
  }
}

export class FoundryGenerator {
  private readonly parserRegistry: ParserRegistry;
  private readonly formatRegistry: FormatRegistryWithMetrics;
  private readonly validator: ComplianceValidator;
  private readonly seedManager = new SeedManager();

  constructor(opts?: {
    parserRegistry?: ParserRegistry;
    formatRegistry?: FormatRegistry;
    validator?: ComplianceValidator;
  }) {
    this.parserRegistry = opts?.parserRegistry ?? createDefaultParserRegistry();
    // Ensure JSONSchemaParser is registered when using a fresh registry
    type MaybeGet = { getRegisteredParsers?: () => string[] };
    const maybe = this.parserRegistry as unknown as MaybeGet;
    if (!maybe.getRegisteredParsers) {
      // Fallback: register explicitly (older registries)
      this.parserRegistry.register(new JSONSchemaParser());
    }

    // Ensure a usable format registry is provided/initialized
    const innerRegistry = opts?.formatRegistry ?? defaultFormatRegistry;
    // Trigger lazy initializer if configured elsewhere
    try {
      void innerRegistry.getRegisteredFormats();
    } catch {
      // ignore
    }
    // Fail-safe: if essential formats are missing, initialize built-ins locally
    const essentials = new Set(['uuid', 'email', 'date', 'date-time']);
    const registered = new Set(innerRegistry.getRegisteredFormats());
    const missingEssential = Array.from(essentials).some(
      (f) => !registered.has(f)
    );
    if (missingEssential) {
      initializeBuiltInFormats(innerRegistry, [
        new UUIDGenerator(),
        new EmailGenerator(),
        new DateGenerator(),
        new DateTimeGenerator(),
      ]);
    }

    this.formatRegistry = new FormatRegistryWithMetrics(innerRegistry);
    this.validator = opts?.validator ?? new ComplianceValidator();
  }

  parseSchema(input: unknown): Result<Schema, ParseError> {
    try {
      return this.parserRegistry.parse(input);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return err(
        new ParseError({
          message: `Parse stage failed: ${errMsg}`,
          context: { stage: PipelineStage.Parse },
        })
      );
    }
  }

  // Heuristic scan for unsupported features (aligns with parser's PLANNED_FEATURES)
  private scanUnsupportedFeatures(input: unknown): string[] {
    const unsupported: string[] = [];
    const KEYS = new Set([
      'allOf',
      'anyOf',
      'oneOf',
      'not',
      'if',
      'then',
      'else',
      'patternProperties',
      'propertyNames',
      'dependentSchemas',
      // 'unevaluatedProperties', // supported now
      // 'unevaluatedItems', // supported now
      'contains',
      'minContains',
      'maxContains',
    ]);
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      for (const k of Object.keys(node as Record<string, unknown>)) {
        if (KEYS.has(k)) unsupported.push(k);
        visit((node as Record<string, unknown>)[k]);
      }
    };
    visit(input);
    return Array.from(new Set(unsupported)).sort();
  }

  private inferScenarioFromComment(
    input: unknown
  ): 'normal' | 'edge' | 'peak' | 'error' {
    if (!input || typeof input !== 'object') return 'normal';
    const comment = (input as Record<string, unknown>)['$comment'];
    if (typeof comment !== 'string') return 'normal';
    const c = comment.toLowerCase();
    if (c.includes('edge')) return 'edge';
    if (c.includes('peak')) return 'peak';
    if (c.includes('error')) return 'error';
    return 'normal';
  }

  /**
   * Synchronous local $ref resolver for in-document references (e.g. '#/...').
   * Does not fetch external URIs. Best-effort for common patterns using $defs/definitions.
   */
  private resolveLocalRefs(root: unknown): unknown {
    const seen = new WeakSet<object>();

    const decode = (token: string): string =>
      token.replace(/~1/g, '/').replace(/~0/g, '~');

    const getByPointer = (obj: unknown, pointer: string): unknown => {
      if (!pointer || pointer === '#') return obj;
      const path = pointer.startsWith('#') ? pointer.slice(1) : pointer;
      const tokens = path.split('/').slice(1).map(decode).filter(Boolean);
      let cur: unknown = obj;
      for (const t of tokens) {
        if (typeof cur !== 'object' || cur === null) return undefined;
        cur = (cur as Record<string, unknown>)[t];
      }
      return cur;
    };

    // Normalize draft-07 definitions to $defs in a shallow clone of root
    const normalizeRoot = (input: unknown): unknown => {
      if (!input || typeof input !== 'object') return input;
      const cloned = this.clone(input as Record<string, unknown>);
      const defs = (cloned as Record<string, unknown>)['definitions'];
      if (defs && typeof defs === 'object') {
        const targetDefs =
          (cloned as Record<string, unknown>)['$defs'] &&
          typeof (cloned as Record<string, unknown>)['$defs'] === 'object'
            ? ((cloned as Record<string, unknown>)['$defs'] as Record<
                string,
                unknown
              >)
            : (((cloned as Record<string, unknown>)['$defs'] = {}),
              (cloned as Record<string, unknown>)['$defs'] as Record<
                string,
                unknown
              >);
        for (const [k, v] of Object.entries(defs as Record<string, unknown>)) {
          if (!(k in targetDefs)) targetDefs[k] = v;
        }
        // keep original definitions for AJV; do not delete
      }
      return cloned;
    };

    const rootNorm = normalizeRoot(root) as Record<string, unknown>;

    const walk = (node: unknown, refStack: Set<string>): unknown => {
      if (node === null || typeof node !== 'object') return node;
      if (seen.has(node as object)) return node;
      seen.add(node as object);

      // Handle direct $ref (in-document)
      if (
        typeof (node as Record<string, unknown>)['$ref'] === 'string' &&
        ((node as Record<string, unknown>)['$ref'] as string).startsWith('#')
      ) {
        // Rewrite draft-07 definitions path to $defs
        const refPtr = (
          (node as Record<string, unknown>)['$ref'] as string
        ).replace(/^#\/definitions\//, '#/$defs/');
        if (refStack.has(refPtr)) {
          // cycle detected – keep $ref as stub to avoid infinite expansion
          return { $ref: refPtr };
        }
        const target = getByPointer(rootNorm, refPtr);
        if (target !== undefined) {
          const nextStack = new Set(refStack);
          nextStack.add(refPtr);
          return walk(this.clone(target), nextStack);
        }
        return { $ref: refPtr }; // unresolved; keep normalized ref as-is
      }

      if (Array.isArray(node)) {
        return (node as unknown[]).map((v) => walk(v, refStack));
      }

      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = walk(v, refStack);
      }
      return out;
    };

    return walk(rootNorm, new Set<string>());
  }

  // Simple deep clone for plain JSON-compatible structures
  private clone<T>(value: T): T {
    return value && typeof value === 'object'
      ? JSON.parse(JSON.stringify(value))
      : value;
  }

  planGeneration(schema: Schema): Result<GenerationPlan, ConfigError> {
    try {
      if (schema === false) {
        return err(
          new ConfigError({
            message: 'Schema is false (unsatisfiable) - cannot generate',
            context: { stage: PipelineStage.Plan },
          })
        );
      }

      // Choose generator based on root schema type (default: object)
      let generator:
        | ObjectGenerator
        | ArrayGenerator
        | StringGenerator
        | NumberGenerator
        | IntegerGenerator
        | BooleanGenerator;

      if (typeof schema === 'boolean') {
        // true schema → any value allowed, use object for deterministic output
        generator = new ObjectGenerator();
      } else {
        const t = Array.isArray(schema.type)
          ? schema.type[0]
          : (schema.type ?? 'object');
        switch (t) {
          case 'object':
            generator = new ObjectGenerator();
            break;
          case 'array':
            generator = new ArrayGenerator();
            break;
          case 'string':
            generator = new StringGenerator();
            break;
          case 'number':
            generator = new NumberGenerator();
            break;
          case 'integer':
            generator = new IntegerGenerator();
            break;
          case 'boolean':
            generator = new BooleanGenerator();
            break;
          default:
            generator = new ObjectGenerator();
            break;
        }
      }

      return ok({ generator, schema, formatRegistry: this.formatRegistry });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return err(
        new ConfigError({
          message: `Plan stage failed: ${errMsg}`,
          context: { stage: PipelineStage.Plan },
        })
      );
    }
  }

  generateData(
    plan: GenerationPlan,
    options: Required<Pick<GenerationOptions, 'seed' | 'locale' | 'count'>> &
      Pick<GenerationOptions, 'repairAttempts'>,
    originalSchema: object
  ): Result<
    {
      items: unknown[];
      contextTemplate: Omit<GeneratorContext, 'seed'>;
      repairs: { itemsRepaired: number; attemptsUsed: number };
    },
    GenerationError
  > {
    const { generator, schema, formatRegistry } = plan;
    const baseSeed = this.seedManager.normalize(options.seed);
    const locale = options.locale;
    const count = Math.max(0, options.count);

    try {
      const items: unknown[] = [];
      let itemsRepaired = 0;
      let attemptsUsed = 0;
      // Use a template context we will clone per item to keep caches isolated
      const scenario = this.inferScenarioFromComment(originalSchema);
      const templateContext = createGeneratorContext(schema, formatRegistry, {
        seed: baseSeed,
        locale,
        path: '$',
        scenario,
      });

      for (let i = 0; i < count; i++) {
        const baseIndexSeed = this.seedManager.derive(baseSeed, i);
        const maxAttempts = Math.max(0, options.repairAttempts ?? 1);
        let accepted: unknown | undefined;
        let attempt = 0;
        let lastError: unknown = undefined;

        while (attempt <= maxAttempts) {
          const attemptSeed =
            (baseIndexSeed ^ Math.imul(attempt, 0x9e3779b9)) >>> 0;
          const context: GeneratorContext = {
            ...templateContext,
            cache: new Map(),
            seed: attemptSeed,
            currentDepth: 0,
            path: '$',
          };

          const genRes = generator.generate(schema, context);
          if (genRes.isErr()) {
            lastError = genRes.error;
            attempt++;
            continue;
          }

          const v = this.validator.validateSingle(genRes.value, originalSchema);
          if (v.isOk() && v.value.valid) {
            accepted = genRes.value;
            if (attempt > 0) {
              itemsRepaired++;
              attemptsUsed += attempt;
            }
            break;
          }
          lastError = v.isErr() ? v.error : v.value;
          attempt++;
        }

        if (accepted === undefined) {
          return err(
            new GenerationError({
              message:
                `Generate stage failed at index ${i} after ${maxAttempts + 1} attempts` +
                (lastError &&
                typeof (lastError as { message?: unknown }).message === 'string'
                  ? `: ${(lastError as { message: string }).message}`
                  : ''),
              context: {
                stage: PipelineStage.Generate,
                index: i,
                lastError,
              },
            })
          );
        }
        items.push(accepted);
      }

      // Return items and the reusable context template (without seed)
      const { seed: _omit, ...rest } = templateContext;
      return ok({
        items,
        contextTemplate: rest,
        repairs: { itemsRepaired, attemptsUsed },
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return err(
        new GenerationError({
          message: `Generate stage failed: ${errMsg}`,
          context: { stage: PipelineStage.Generate },
        })
      );
    }
  }

  validateOutput(
    items: unknown[],
    originalSchema: object
  ): Result<ComplianceReport, ValidationError> {
    try {
      const reportResult = this.validator.validate(items, originalSchema);
      if (reportResult.isErr()) return err(reportResult.error);

      const report = reportResult.value;
      if (!report.compliant || report.score !== 100) {
        return err(
          new ValidationError({
            message: 'Validate stage failed: compliance score < 100%',
            failures: report.details.flatMap((d) => d.errors),
            context: { stage: PipelineStage.Validate, report },
          })
        );
      }
      return ok(report);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return err(
        new ValidationError({
          message: `Validate stage failed: ${errMsg}`,
          failures: [],
          context: { stage: PipelineStage.Validate },
        })
      );
    }
  }

  run(
    schemaInput: object,
    options: GenerationOptions & { count?: number }
  ): Result<GenerationOutput, FoundryError> {
    const metrics = new MetricsCollector();

    // Parse original (early feature checks / errors)
    metrics.start(PipelineStage.Parse);
    const parsedOriginal = this.parseSchema(schemaInput);
    metrics.end(PipelineStage.Parse);
    const compat = options.compat ?? 'strict';
    if (parsedOriginal.isErr() && compat !== 'lax') return parsedOriginal;

    // Resolve in-document references for planning/generation
    metrics.start(PipelineStage.Resolve);
    const resolvedInput = this.resolveLocalRefs(schemaInput);
    metrics.end(PipelineStage.Resolve);

    // Parse resolved schema for generation
    const parsed = this.parseSchema(resolvedInput);
    let genSchema: Schema;
    if (parsed.isOk()) {
      genSchema = parsed.value;
    } else if (compat === 'lax') {
      // Soft-accept: proceed with the original resolved object as Schema
      genSchema = resolvedInput as Schema;
    } else {
      return parsed;
    }

    // Plan
    metrics.start(PipelineStage.Plan);
    const plan = this.planGeneration(genSchema);
    metrics.end(PipelineStage.Plan);
    if (plan.isErr()) return plan;
    const planValue = plan.value as GenerationPlan;
    // Annotate plan with compat + unsupported features (if lax)
    if (compat === 'lax') {
      const unsupported = this.scanUnsupportedFeatures(schemaInput);
      planValue.unsupportedFeatures = unsupported;
      planValue.compat = 'lax';
    }

    // Generate
    const seed = this.seedManager.normalize(options.seed);
    const locale = options.locale ?? 'en';
    const count = options.count ?? 1;

    metrics.start(PipelineStage.Generate);
    const gen = this.generateData(
      planValue,
      {
        seed,
        locale,
        count,
        repairAttempts: options.repairAttempts ?? 1,
      },
      schemaInput
    );
    metrics.end(PipelineStage.Generate);
    if (gen.isErr()) return gen;

    // Validate
    metrics.start(PipelineStage.Validate);
    const validation = this.validateOutput(gen.value.items, schemaInput);
    metrics.end(PipelineStage.Validate);
    if (validation.isErr()) return validation;

    // Collect metrics
    const durations = metrics.finalize();
    const validatorMetrics = this.validator.getMetrics();
    const formatsUsed = this.formatRegistry.getUsedFormats();

    const memory =
      typeof process !== 'undefined' &&
      typeof process.memoryUsage === 'function'
        ? (() => {
            const m = process.memoryUsage();
            return { rss: m.rss, heapUsed: m.heapUsed };
          })()
        : undefined;

    const pipelineMetrics: PipelineMetrics = {
      durations,
      itemsGenerated: gen.value.items.length,
      formatsUsed,
      validatorCacheHitRate: validatorMetrics.cacheHitRate,
      compiledSchemas: validatorMetrics.compiledSchemas,
      memory,
      itemsRepaired: gen.value.repairs.itemsRepaired,
      repairAttemptsUsed: gen.value.repairs.attemptsUsed,
    };

    return ok({
      items: gen.value.items,
      report: validation.value,
      metrics: pipelineMetrics,
      seed,
    });
  }
}
