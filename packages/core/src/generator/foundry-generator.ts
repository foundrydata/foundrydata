/* eslint-disable complexity */
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
import {
  type ResolvedOptions,
  resolveOptions,
  type PlanOptions,
} from '../types/options';
import type { Schema } from '../types/schema';
import type { NormalizeResult } from '../transform/schema-normalizer';
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
  RegexGenerator,
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
  optionsSnapshot?: ResolvedOptions;
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
  private enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  start(stage: PipelineStage): void {
    if (!this.enabled) return;
    this.marks.set(stage, Date.now());
  }

  end(stage: PipelineStage): void {
    if (!this.enabled) return;
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
  private readonly options: ResolvedOptions;

  constructor(opts?: {
    parserRegistry?: ParserRegistry;
    formatRegistry?: FormatRegistry;
    validator?: ComplianceValidator;
    options?: Partial<PlanOptions>;
  }) {
    // Resolve options with defaults first
    this.options = resolveOptions(opts?.options);

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
        new RegexGenerator(),
      ]);
    }

    this.formatRegistry = new FormatRegistryWithMetrics(innerRegistry);
    this.validator =
      opts?.validator ??
      new ComplianceValidator({
        // Map ResolvedOptions to ComplianceValidator options
        strictSchema: this.options.failFast.externalRefStrict === 'error',
        validateFormats: true, // Always validate formats for compliance
      });
  }

  parseSchema(input: unknown): Result<NormalizeResult, ParseError> {
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
    // Only flag features that we do not fully plan/generate in strict mode.
    // Composition keywords (allOf/anyOf/oneOf/not) and object keywords
    // (patternProperties/propertyNames/dependentSchemas) are supported now.
    const KEYS = new Set(['if', 'then', 'else']);
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

      // Schema that will be handed to the selected generator
      let effectiveSchema: Schema = schema;

      if (typeof schema === 'boolean') {
        // true schema → any value allowed, use object for deterministic output
        generator = new ObjectGenerator();
      } else {
        // Handle composition in planning
        effectiveSchema = this.resolveComposition(schema);
        // Apply conditional heuristics to bias generation
        effectiveSchema = this.applyConditionalHeuristics(effectiveSchema);

        // Special-case: official Draft meta-schemas → generate minimal object schema
        if (this.isOfficialMetaSchema(schema)) {
          effectiveSchema = { type: 'object' } as Schema;
        }

        const typeField = (effectiveSchema as { type?: string | string[] })
          .type;
        const pickUnion = (arr: string[]): string => {
          // Heuristic: for official meta-schemas, prefer 'object' first, then 'boolean'
          const s = effectiveSchema as Record<string, unknown>;
          const meta = String(s.$schema || s.$id || '').toLowerCase();
          const isMeta = meta.includes('json-schema.org');
          if (isMeta) {
            if (arr.includes('object')) return 'object';
            if (arr.includes('boolean')) return 'boolean';
          }
          const pref = [
            'object',
            'array',
            'string',
            'number',
            'integer',
            'boolean',
            'null',
          ];
          for (const p of pref) if (arr.includes(p)) return p;
          return arr[0] ?? 'object';
        };
        const base = Array.isArray(typeField)
          ? pickUnion(typeField)
          : (typeField ?? 'object');
        const t = base as string;

        // If union type (array), narrow to the first type for generation while
        // preserving other constraints. Validation still happens against the
        // original, potentially-union schema later.
        if (Array.isArray(schema.type)) {
          effectiveSchema = {
            ...(schema as Record<string, unknown>),
            type: t,
          } as Schema;
        }

        // Ensure effectiveSchema carries a concrete type for downstream generators
        if (typeof (effectiveSchema as { type?: string }).type !== 'string') {
          effectiveSchema = {
            ...(effectiveSchema as Record<string, unknown>),
            type: t,
          } as Schema;
        }

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

      return ok({
        generator,
        schema: effectiveSchema,
        formatRegistry: this.formatRegistry,
      });
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

  /**
   * Resolve composition keywords into an effective schema for generation.
   * Validation still runs against the original schema.
   */
  private resolveComposition(schema: Schema): Schema {
    if (typeof schema !== 'object' || schema === null) return schema;
    const s = schema as Record<string, unknown>;

    if (Array.isArray(s.allOf) && s.allOf.length > 0) {
      return this.mergeAllOf(s.allOf as Schema[]);
    }
    if (Array.isArray(s.anyOf) && s.anyOf.length > 0) {
      return this.selectBestBranch(s.anyOf as Schema[]);
    }
    if (Array.isArray(s.oneOf) && s.oneOf.length > 0) {
      return this.selectBestBranch(s.oneOf as Schema[]);
    }
    if (s.not) {
      return this.invertNot(s.not as Schema);
    }
    return schema;
  }

  /**
   * Detect when the schema itself IS an official JSON Schema meta-schema.
   * Important: many normal user schemas include "$schema" pointing to the
   * official meta-schema URL. That alone must NOT trigger this condition.
   * We only consider it an official meta-schema when $id matches one.
   */
  private isOfficialMetaSchema(schema: Schema): boolean {
    if (typeof schema !== 'object' || schema === null) return false;
    const s = schema as Record<string, unknown>;
    const id = String(s.$id || '').toLowerCase();
    const hints = [
      'json-schema.org/draft-07/schema',
      'json-schema.org/draft/2019-09/schema',
      'json-schema.org/draft/2020-12/schema',
    ];
    // Only check $id. $schema merely declares the draft and is common in user schemas.
    return hints.some((h) => id.includes(h));
  }

  /** Merge a list of schemas from allOf into a simplified single schema */
  private mergeAllOf(schemas: Schema[]): Schema {
    const out: Record<string, unknown> = {};
    const types: string[] = [];

    for (const sch of schemas) {
      if (typeof sch !== 'object' || sch === null) continue;
      const so = sch as Record<string, unknown>;
      const t = so.type;
      if (typeof t === 'string') types.push(t);

      // Strings
      if (t === 'string') {
        out.type = 'string';
        if (typeof so.minLength === 'number') {
          out.minLength = Math.max(
            (out.minLength as number) ?? 0,
            so.minLength
          );
        }
        if (typeof so.maxLength === 'number') {
          const curr = (out.maxLength as number) ?? Number.POSITIVE_INFINITY;
          out.maxLength = Math.min(curr, so.maxLength);
        }
        if (typeof so.pattern === 'string' && out.pattern === undefined) {
          out.pattern = so.pattern;
        }
        if (typeof so.format === 'string' && out.format === undefined) {
          out.format = so.format;
        }
      }

      // Numbers/integers
      if (t === 'number' || t === 'integer') {
        out.type = t;
        if (typeof so.minimum === 'number') {
          out.minimum = Math.max(
            (out.minimum as number) ?? -Infinity,
            so.minimum
          );
        }
        if (typeof so.maximum === 'number') {
          const curr = (out.maximum as number) ?? Infinity;
          out.maximum = Math.min(curr, so.maximum);
        }
        if (typeof so.exclusiveMinimum === 'number') {
          out.exclusiveMinimum = Math.max(
            (out.exclusiveMinimum as number) ?? -Infinity,
            so.exclusiveMinimum
          );
        }
        if (typeof so.exclusiveMaximum === 'number') {
          out.exclusiveMaximum = Math.min(
            (out.exclusiveMaximum as number) ?? Infinity,
            so.exclusiveMaximum
          );
        }
        if (typeof so.multipleOf === 'number' && out.multipleOf === undefined) {
          out.multipleOf = so.multipleOf;
        }
      }

      // Objects
      if (t === 'object') {
        out.type = 'object';
        const props = (out.properties as Record<string, Schema>) ?? {};
        const req = new Set<string>(
          Array.isArray(out.required) ? (out.required as string[]) : []
        );
        if (so.properties && typeof so.properties === 'object') {
          for (const [k, v] of Object.entries(
            so.properties as Record<string, Schema>
          )) {
            if (!(k in props)) props[k] = v;
          }
        }
        if (Array.isArray(so.required)) {
          (so.required as string[]).forEach((r) => req.add(r));
        }
        if (req.size > 0) out.required = Array.from(req);
        if (
          so.additionalProperties !== undefined &&
          out.additionalProperties === undefined
        ) {
          out.additionalProperties = so.additionalProperties;
        }
        out.properties = props;
      }

      // Arrays
      if (t === 'array') {
        out.type = 'array';
        if (typeof so.minItems === 'number') {
          out.minItems = Math.max((out.minItems as number) ?? 0, so.minItems);
        }
        if (typeof so.maxItems === 'number') {
          const curr = (out.maxItems as number) ?? Infinity;
          out.maxItems = Math.min(curr, so.maxItems);
        }
        if (so.items !== undefined && out.items === undefined)
          out.items = so.items;
        if (so.prefixItems !== undefined && out.prefixItems === undefined)
          out.prefixItems = so.prefixItems;
      }
    }

    // If multiple distinct types encountered, fall back to first
    if (types.length > 1) out.type = types[0];
    return out as Schema;
  }

  /** Deterministically select a branch for anyOf/oneOf */
  private selectBestBranch(branches: Schema[]): Schema {
    // Prefer typed branches; then prefer object, array, string, number, integer, boolean, null order
    const order = new Map<string, number>([
      ['object', 1],
      ['array', 2],
      ['string', 3],
      ['number', 4],
      ['integer', 5],
      ['boolean', 6],
      ['null', 7],
    ]);
    const scored = branches.map((b, i) => {
      if (typeof b !== 'object' || b === null) return { i, score: 99, b };
      const t = (b as Record<string, unknown>).type;
      const s = typeof t === 'string' ? (order.get(t) ?? 50) : 80;
      return { i, score: s, b };
    });
    scored.sort((a, b) => a.score - b.score || a.i - b.i);
    const selected = (scored[0]?.b ??
      branches[0] ??
      ({ type: 'object' } as Schema)) as Schema;
    return selected;
  }

  /** Produce a simple schema that does not match the given "not" schema */
  private invertNot(notSchema: Schema): Schema {
    if (typeof notSchema !== 'object' || notSchema === null) {
      return { type: 'object' } as Schema; // default different type
    }
    const t = (notSchema as Record<string, unknown>).type;
    if (typeof t === 'string') {
      const alt = [
        'object',
        'array',
        'string',
        'number',
        'integer',
        'boolean',
        'null',
      ].find((x) => x !== t);
      return alt ? ({ type: alt } as Schema) : ({ type: 'object' } as Schema);
    }
    if ('const' in (notSchema as Record<string, unknown>)) {
      const c = (notSchema as Record<string, unknown>).const;
      // choose a value of a different type to avoid equality
      if (typeof c === 'string')
        return { type: 'number', minimum: 0, maximum: 10 } as Schema;
      if (typeof c === 'number')
        return { type: 'string', minLength: 1, maxLength: 5 } as Schema;
      if (typeof c === 'boolean')
        return { type: 'string', minLength: 1 } as Schema;
      return { type: 'string', minLength: 1 } as Schema;
    }
    if ('enum' in (notSchema as Record<string, unknown>)) {
      // pick a type outside common enum types
      return { type: 'object', properties: {} } as Schema;
    }
    return { type: 'object' } as Schema;
  }

  /**
   * Heuristically apply top-level and one-level nested if/then/else by merging
   * the likely branch (prefer satisfying "if" → "then"). Returns a cloned schema.
   */
  private applyConditionalHeuristics(schema: Schema): Schema {
    if (typeof schema !== 'object' || schema === null) return schema;
    const s = this.clone(schema as Record<string, unknown>);

    const mergeObjectSchema = (
      base: Record<string, unknown>,
      add: Record<string, unknown>
    ): void => {
      if (Array.isArray(add.required)) {
        const req = new Set<string>(
          Array.isArray(base.required) ? (base.required as string[]) : []
        );
        for (const r of add.required as string[]) req.add(r);
        if (req.size > 0) base.required = Array.from(req);
      }
      if (add.properties && typeof add.properties === 'object') {
        const baseProps = (base.properties as Record<string, unknown>) || {};
        for (const [k, v] of Object.entries(
          add.properties as Record<string, unknown>
        )) {
          if (!(k in baseProps)) baseProps[k] = this.clone(v);
        }
        base.properties = baseProps;
      }
      if (
        add.additionalProperties !== undefined &&
        base.additionalProperties === undefined
      ) {
        base.additionalProperties = add.additionalProperties;
      }
    };

    const tryApplyOnObject = (obj: Record<string, unknown>): void => {
      const ifSch = obj['if'];
      const thenSch = obj['then'];
      const elseSch = obj['else'];
      if (!ifSch || typeof ifSch !== 'object') return;

      const ifProps = (ifSch as Record<string, unknown>).properties as
        | Record<string, unknown>
        | undefined;
      const req = (ifSch as Record<string, unknown>).required as
        | string[]
        | undefined;
      let predKey: string | undefined;
      let predSchema: Record<string, unknown> | undefined;
      if (ifProps && typeof ifProps === 'object') {
        const keys = Object.keys(ifProps);
        if (keys.length === 1) {
          const k = keys[0]!;
          const v = ifProps[k];
          if (
            v &&
            typeof v === 'object' &&
            ('const' in (v as object) || 'enum' in (v as object))
          ) {
            predKey = k;
            predSchema = v as Record<string, unknown>;
          }
        }
      }
      if (!predKey && Array.isArray(req) && req.length === 1) {
        predKey = req[0]!;
        predSchema = undefined;
      }
      if (!predKey) return;

      if (obj.type === undefined) obj.type = 'object';
      if (obj.properties === undefined) obj.properties = {};
      if (!Array.isArray(obj.required)) obj.required = [];

      const props = obj.properties as Record<string, unknown>;
      const baseKeySchema = ((props[predKey] as Record<string, unknown>) ??
        {}) as Record<string, unknown>;
      const mergedKeySchema: Record<string, unknown> =
        this.clone(baseKeySchema);
      if (predSchema) {
        if ('const' in predSchema) {
          // Prefer const; drop enum to avoid generator choosing enum path first
          delete (mergedKeySchema as Record<string, unknown>).enum;
          mergedKeySchema.const = predSchema.const;
        } else if (Array.isArray(predSchema.enum)) {
          const predEnum = predSchema.enum as unknown[];
          if (Array.isArray(mergedKeySchema.enum)) {
            const baseEnum = mergedKeySchema.enum as unknown[];
            const inter = baseEnum.filter((x) =>
              predEnum.some((y) => JSON.stringify(y) === JSON.stringify(x))
            );
            mergedKeySchema.enum =
              inter.length > 0 ? inter : this.clone(predEnum);
          } else {
            mergedKeySchema.enum = this.clone(predEnum);
          }
        }
      }
      props[predKey] = mergedKeySchema;
      if (!(obj.required as string[]).includes(predKey))
        (obj.required as string[]).push(predKey);

      if (thenSch && typeof thenSch === 'object') {
        mergeObjectSchema(obj, thenSch as Record<string, unknown>);
      } else if (elseSch && typeof elseSch === 'object') {
        mergeObjectSchema(obj, elseSch as Record<string, unknown>);
      }
    };

    const topType = s.type as string | string[] | undefined;
    const topIsObject =
      (typeof topType === 'string' && topType === 'object') ||
      (Array.isArray(topType) && topType.includes('object')) ||
      topType === undefined;
    if (topIsObject) tryApplyOnObject(s);

    if (s.properties && typeof s.properties === 'object') {
      const props = s.properties as Record<string, unknown>;
      for (const [k, v] of Object.entries(props)) {
        if (v && typeof v === 'object') {
          const vObj = this.clone(v as Record<string, unknown>);
          const vType = vObj.type as string | string[] | undefined;
          const vIsObject =
            (typeof vType === 'string' && vType === 'object') ||
            (Array.isArray(vType) && vType.includes('object')) ||
            vType === undefined;
          if (vIsObject) {
            tryApplyOnObject(vObj);
            props[k] = vObj;
          }
        }
      }
    }

    return s as Schema;
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
        resolvedOptions: this.options,
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
          // Try conditional fixups (if/then/else) once per attempt when applicable
          const adjusted = this.tryConditionalAdjust(
            genRes.isOk() ? genRes.value : undefined,
            originalSchema,
            context,
            i,
            attempt
          );
          if (adjusted !== undefined) {
            const v2 = this.validator.validateSingle(adjusted, originalSchema);
            if (v2.isOk() && v2.value.valid) {
              accepted = adjusted;
              itemsRepaired++;
              attemptsUsed += attempt + 1;
              break;
            }
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

  /**
   * Attempt to repair a generated root value to satisfy simple top-level if/then/else.
   * Heuristic: if root is an object and schema has top-level { if, then, else },
   * - If value matches "if", ensure required from "then" are present (generate if needed)
   * - Otherwise, if "else" exists, ensure required from "else" are present
   */
  private tryConditionalAdjust(
    value: unknown,
    schemaInput: object,
    baseContext: GeneratorContext,
    index: number,
    attempt: number
  ): unknown | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return undefined;
    const root = schemaInput as Record<string, unknown>;
    const ifSch = root['if'];
    const thenSch = root['then'];
    const elseSch = root['else'];
    if (!ifSch || typeof ifSch !== 'object') return undefined;

    // Determine which branch applies
    const ifMatch = this.validator.validateSingle(value, ifSch as object);
    let isIf = ifMatch.isOk() && ifMatch.value.valid;
    // Prefer THEN by constructing predicate when simple (const/enum on one key)
    const ifProps = (ifSch as Record<string, unknown>).properties as
      | Record<string, unknown>
      | undefined;
    const reqIf = (ifSch as Record<string, unknown>).required as
      | string[]
      | undefined;
    let predKey: string | undefined;
    let candidate: unknown | undefined;
    if (ifProps && typeof ifProps === 'object') {
      const keys = Object.keys(ifProps);
      if (keys.length === 1) {
        const k = keys[0]!;
        const v = ifProps[k] as Record<string, unknown>;
        if (v && typeof v === 'object') {
          const vObj = v as { const?: unknown; enum?: unknown[] };
          if ('const' in vObj) candidate = vObj.const;
          else if (Array.isArray(vObj.enum) && vObj.enum.length > 0)
            candidate = vObj.enum[0];
          predKey = k;
        }
      }
    }
    if (!predKey && Array.isArray(reqIf) && reqIf.length === 1) {
      predKey = reqIf[0]!;
      candidate = candidate ?? `val-${(baseContext.seed ?? 0) ^ index}`;
    }
    let branch: Record<string, unknown> | undefined = isIf
      ? (thenSch as Record<string, unknown> | undefined)
      : (elseSch as Record<string, unknown> | undefined);
    // If we can satisfy IF by construction, switch to THEN path
    if (predKey) {
      const forced = JSON.parse(JSON.stringify(value)) as Record<
        string,
        unknown
      >;
      forced[predKey] = candidate;
      value = forced;
      isIf = true;
      branch = thenSch as Record<string, unknown> | undefined;
    }
    if (!branch || typeof branch !== 'object') return undefined;

    // Collect required keys from branch
    const reqBranch = Array.isArray(branch.required)
      ? (branch.required as string[])
      : [];
    if (reqBranch.length === 0) return undefined;

    const props =
      (branch.properties as Record<string, unknown> | undefined) ||
      (root.properties as Record<string, unknown> | undefined) ||
      undefined;

    const out = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    let changed = false;
    for (const k of reqBranch) {
      if (!(k in out)) {
        const propSchema = props && (props[k] as Schema | undefined);
        const propVal = this.generateForSchemaOrDefault(
          propSchema,
          baseContext,
          `${baseContext.path}.${k}`,
          index,
          attempt
        );
        out[k] = propVal;
        changed = true;
      }
    }
    // Debug logging removed after verification
    return changed ? out : undefined;
  }

  /** Generate a value for a property schema; fall back to sensible defaults */
  private generateForSchemaOrDefault(
    schema: Schema | undefined,
    baseContext: GeneratorContext,
    path: string,
    index: number,
    attempt: number
  ): unknown {
    const seed =
      (baseContext.seed ?? 0) ^
      Math.imul(index + 1, 0x9e3779b9) ^
      Math.imul(attempt + 17, 0x85ebca6b);
    if (!schema || typeof schema === 'boolean') {
      // Default simple string
      return `val-${(seed >>> 0).toString(36)}`;
    }

    // Handle const/enum without invoking generators
    const sObj = schema as Record<string, unknown>;
    if ('const' in sObj) return sObj.const as unknown;
    if (Array.isArray(sObj.enum) && (sObj.enum as unknown[]).length > 0) {
      return (sObj.enum as unknown[])[0];
    }

    const type = sObj.type as string | string[] | undefined;
    const pickType = Array.isArray(type) ? type[0] : type;

    const nested = createGeneratorContext(schema, baseContext.formatRegistry, {
      seed,
      locale: baseContext.locale,
      path,
      scenario: baseContext.scenario,
      maxDepth: baseContext.maxDepth,
      resolvedOptions: baseContext.options,
    });

    try {
      switch (pickType) {
        case 'string': {
          const r = new StringGenerator().generate(schema, nested);
          return r.isOk() ? r.value : 'x';
        }
        case 'number': {
          const r = new NumberGenerator().generate(schema, nested);
          return r.isOk() ? r.value : 0;
        }
        case 'integer': {
          const r = new IntegerGenerator().generate(schema, nested);
          return r.isOk() ? r.value : 0;
        }
        case 'boolean': {
          const r = new BooleanGenerator().generate(schema, nested);
          return r.isOk() ? r.value : true;
        }
        case 'array': {
          const r = new ArrayGenerator().generate(schema, nested);
          return r.isOk() ? r.value : [];
        }
        case 'object': {
          const r = new ObjectGenerator().generate(schema, nested);
          return r.isOk() ? r.value : {};
        }
        default:
          // Best-effort fallbacks
          if ('properties' in sObj || 'required' in sObj) {
            const r = new ObjectGenerator().generate(
              { ...(sObj as object), type: 'object' } as Schema,
              nested
            );
            return r.isOk() ? r.value : {};
          }
          if ('items' in sObj || 'prefixItems' in sObj) {
            const r = new ArrayGenerator().generate(
              { ...(sObj as object), type: 'array' } as Schema,
              nested
            );
            return r.isOk() ? r.value : [];
          }
          return `val-${(seed >>> 0).toString(36)}`;
      }
    } catch {
      return `val-${(seed >>> 0).toString(36)}`;
    }
  }

  validateOutput(
    items: unknown[],
    originalSchema: object
  ): Result<ComplianceReport, ValidationError> {
    try {
      const schemaForValidation = this.sanitizeExternalRefs(originalSchema);
      const reportResult = this.validator.validate(items, schemaForValidation);
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

  /**
   * Replace external $ref/$dynamicRef/$recursiveRef with permissive true-schemas
   * to allow local AJV validation of meta-schemas without fetching.
   */
  private sanitizeExternalRefs(input: object): object {
    const clone = (v: unknown): unknown =>
      v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    const root = clone(input) as Record<string, unknown>;

    const isExternalRef = (ref: unknown): boolean => {
      if (typeof ref !== 'string') return false;
      if (ref.startsWith('#')) return false;
      // Keep embedded meta fragments intact; they are handled by ComplianceValidator
      if (ref.startsWith('meta/')) return false;
      return true;
    };

    const visit = (node: unknown): unknown => {
      if (!node || typeof node !== 'object') return node;
      if (Array.isArray(node)) return node.map(visit);
      const obj = node as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (
          (k === '$ref' || k === '$dynamicRef' || k === '$recursiveRef') &&
          isExternalRef(v)
        ) {
          out[k] = true;
          continue;
        }
        out[k] = visit(v);
      }
      return out;
    };

    return visit(root) as object;
  }

  run(
    schemaInput: object,
    options: GenerationOptions & { count?: number }
  ): Result<GenerationOutput, FoundryError> {
    const metrics = new MetricsCollector(this.options.metrics);

    // Parse original (early feature checks / errors)
    metrics.start(PipelineStage.Parse);
    const parsedOriginal = this.parseSchema(schemaInput);
    metrics.end(PipelineStage.Parse);
    const compat = options.compat ?? 'strict';
    if (parsedOriginal.isErr() && compat !== 'lax') return parsedOriginal;

    // In strict mode, fail fast on conditional keywords for modern drafts (2019-09/2020-12).
    // For draft-07, conditionals are handled heuristically and allowed in strict.
    if (compat === 'strict') {
      const unsupported = this.scanUnsupportedFeatures(schemaInput);
      const hasConditionals = unsupported.some(
        (k) => k === 'if' || k === 'then' || k === 'else'
      );
      const schStr =
        schemaInput &&
        typeof (schemaInput as Record<string, unknown>)['$schema'] === 'string'
          ? String(
              (schemaInput as Record<string, unknown>)['$schema']
            ).toLowerCase()
          : '';
      const isModernDraft =
        schStr.includes('2020-12') || schStr.includes('2019-09');
      if (hasConditionals && isModernDraft) {
        return err(
          new ConfigError({
            message: `Unsupported features in strict mode: ${unsupported.join(', ')}`,
            context: { stage: PipelineStage.Parse, unsupported },
          })
        );
      }
    }

    // Resolve in-document references for planning/generation
    metrics.start(PipelineStage.Resolve);
    const resolvedInput = this.resolveLocalRefs(schemaInput);
    metrics.end(PipelineStage.Resolve);

    // Parse resolved schema for generation
    const parsed = this.parseSchema(resolvedInput);
    let genSchema: Schema;
    if (parsed.isOk()) {
      const normalization = parsed.value;
      genSchema = normalization.schema as Schema;
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
      optionsSnapshot: this.options,
    };

    return ok({
      items: gen.value.items,
      report: validation.value,
      metrics: pipelineMetrics,
      seed,
    });
  }
}
