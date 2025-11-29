/* eslint-disable max-params */
/* eslint-disable max-depth */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
import {
  DIAGNOSTIC_CODES,
  DIAGNOSTIC_PHASES,
  type DiagnosticCode,
} from '../diag/codes.js';
import type {
  ComposeResult,
  CoverageEntry,
  NodeDiagnostics,
} from '../transform/composition-engine.js';
import type { CoverageMode, UnsatisfiedHint } from '@foundrydata/shared';
import {
  computeEffectiveMaxItems,
  type ContainsNeed,
} from '../transform/arrays/contains-bag.js';
import type { NormalizerNote } from '../transform/schema-normalizer.js';
import type { MetricsCollector } from '../util/metrics.js';
import {
  resolveOptions,
  type PlanOptions,
  type ResolvedOptions,
} from '../types/options.js';
import type { Schema } from '../types/schema.js';
import { structuralHash } from '../util/struct-hash.js';
import {
  createFormatRegistry,
  type FormatRegistry,
} from './format-registry.js';
import { XorShift32, normalizeSeed } from '../util/rng.js';
import {
  createSourceAjv,
  detectDialectFromSchema,
  type JsonSchemaDialect,
} from '../util/ajv-source.js';
import { resolveDynamicRefBinding } from '../util/draft.js';
import { synthesizePatternExample } from '../util/pattern-literals.js';
import {
  hydrateSourceAjvFromRegistry,
  type RegistryDoc,
} from '../resolver/hydrateSourceAjvFromRegistry.js';
import type { ResolverDiagnosticNote } from '../resolver/options.js';
import type Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';
import type { CoverageEvent, CoverageHint } from '../coverage/index.js';
import { resolveCoverageHintConflicts } from '../coverage/index.js';

type JsonPointer = string;

const INTERNAL_SOURCE_SCHEMA_KEY = '__foundry_source_schema__';

type EvaluationFamily =
  | 'properties'
  | 'patternProperties'
  | 'additionalProperties'
  | '$ref'
  | 'allOf'
  | 'oneOf'
  | 'anyOf'
  | 'then'
  | 'else';

interface EvaluationProof {
  via: EvaluationFamily[];
  pointer: JsonPointer;
}

interface EvaluationNode {
  schema: Record<string, unknown>;
  pointer: JsonPointer;
  via: EvaluationFamily[];
}

interface InstanceTweakTarget {
  pointer: JsonPointer;
  kind: 'string' | 'number';
  integer?: boolean;
  schema?: Record<string, unknown>;
  get(): string | number;
  set(value: string | number): void;
}

type ResolvedCoverageHintsForPath = ReturnType<
  typeof resolveCoverageHintConflicts
>;

export interface GeneratorDiagnostic {
  code: DiagnosticCode;
  phase: typeof DIAGNOSTIC_PHASES.GENERATE;
  canonPath: JsonPointer;
  details?: unknown;
  budget?: {
    tried: number;
    limit: number;
    skipped?: boolean;
    // Align with diagnosticsEnvelope.schema.json budget.reason enum
    // Use generic cap reasons here; keep specific pattern reasons in details.reason
    reason?:
      | 'skipTrialsFlag'
      | 'largeOneOf'
      | 'largeAnyOf'
      | 'complexityCap'
      // Internal specific reasons may appear in details.reason
      | 'candidateBudget'
      | 'witnessDomainExhausted';
  };
  scoreDetails?: {
    // Optional to allow exclusivity-only diagnostics to omit tie-break value per SPEC
    tiebreakRand?: number;
    exclusivityRand?: number;
    [key: string]: number | undefined;
  };
}

export interface GeneratorStageOutput {
  items: unknown[];
  diagnostics: GeneratorDiagnostic[];
  metrics: {
    patternWitnessTried?: number;
  };
  seed: number;
}

interface GeneratorCoverageOptions {
  mode: CoverageMode;
  emit: (event: CoverageEvent) => void;
  emitForItem?: (itemIndex: number, event: CoverageEvent) => void;
  /**
   * Optional coverage hints attached to the current TestUnit when
   * running in coverage=guided mode. When provided, the generator
   * may use these hints to steer branch selection, property presence
   * and enum values without violating AJV validity.
   */
  hints?: CoverageHint[];
  /**
   * Optional callback for recording unsatisfied hints in guided mode.
   * When provided, the generator may report hints that could not be
   * honored under the current constraints or were otherwise invalid.
   */
  recordUnsatisfiedHint?: (hint: UnsatisfiedHint) => void;
}

export interface FoundryGeneratorOptions {
  count?: number;
  seed?: number;
  planOptions?: Partial<PlanOptions>;
  metrics?: MetricsCollector;
  /** Original source schema (for E-Trace anyOf dynamic validation) */
  sourceSchema?: unknown;
  /** Mirror planning AJV flags to maintain parity per SPEC §§12–13 */
  validateFormats?: boolean;
  discriminator?: boolean;
  /** Resolver registry documents for Source AJV hydration (Extension R1) */
  registryDocs?: RegistryDoc[];
  resolverHydrateFinalAjv?: boolean;
  resolverNotes?: ResolverDiagnosticNote[];
  resolverSeenSchemaIds?: Map<string, string>;
  sourceDialect?: JsonSchemaDialect;
  /**
   * When true, prefer using schema-level examples (example/examples)
   * for the root instance when available, falling back to generation
   * when no example is present.
   */
  preferExamples?: boolean;
  /**
   * Optional passive coverage hook for generator instrumentation.
   * When provided with mode 'measure' or 'guided', the generator
   * will emit CoverageEvent entries for branches and enums.
   */
  coverage?: GeneratorCoverageOptions;
}

export function generateFromCompose(
  effective: ComposeResult,
  options: FoundryGeneratorOptions = {}
): GeneratorStageOutput {
  const engine = new GeneratorEngine(effective, options);
  return engine.run();
}

class GeneratorEngine {
  private readonly resolved: ResolvedOptions;

  private readonly options: FoundryGeneratorOptions;

  private readonly metrics?: MetricsCollector;

  private readonly pointerIndex: WeakMap<object, JsonPointer>;

  private readonly diagnostics: GeneratorDiagnostic[] = [];

  private patternWitnessTrials = 0;

  private readonly normalizedAlphabet: string[];

  private readonly coverageIndex: ComposeResult['coverageIndex'];

  private readonly containsBag: ComposeResult['containsBag'];

  private readonly pnamesRewrite: Set<string>;

  private readonly diagNodes: Record<string, NodeDiagnostics> | undefined;

  private readonly baseSeed: number;
  private readonly ptrMap: ComposeResult['canonical']['ptrMap'];
  private readonly sourceSchema?: unknown;
  private sourceSchemaKey?: string;
  private sourceAjvCache?: Ajv;
  private branchValidatorCache: Map<string, ValidateFunction> = new Map();
  private readonly conditionalBlocklist: Map<string, Set<string>> = new Map();
  private readonly shouldRecordEvalTrace: boolean;
  private readonly formatRegistry?: FormatRegistry;
  private readonly pendingExclusivityRand = new Map<JsonPointer, number>();
  private readonly stringTweakOrder: ReadonlyArray<'\u0000' | 'a'>;
  private readonly multipleOfEpsilon: number;
  private readonly preferExamples: boolean;
  private readonly coverage?: GeneratorCoverageOptions;
  private readonly coverageHintsByPath?:
    | Map<JsonPointer, ResolvedCoverageHintsForPath>
    | undefined;
  private currentItemIndex: number | null = null;
  // E-Trace cache: per-candidate object instance → per-name proof (or null for negative).
  // Ephemeral per GeneratorEngine; keys are not retained strongly (WeakMap).
  private eTraceCache: WeakMap<
    Record<string, unknown>,
    Map<string, EvaluationProof | null>
  > = new WeakMap();

  private recordUnsatisfiedHint(hint: UnsatisfiedHint): void {
    if (
      !this.coverage ||
      this.coverage.mode !== 'guided' ||
      typeof this.coverage.recordUnsatisfiedHint !== 'function'
    ) {
      return;
    }
    try {
      this.coverage.recordUnsatisfiedHint(hint);
    } catch {
      // Unsatisfied hint reporting must not affect generation behavior.
    }
  }

  private buildCoverageHintsIndex(
    hints: CoverageHint[]
  ): Map<JsonPointer, ResolvedCoverageHintsForPath> {
    const byPath = new Map<JsonPointer, CoverageHint[]>();
    for (const hint of hints) {
      if (!hint || typeof hint.canonPath !== 'string') continue;
      const path = canonicalizeCoveragePath(hint.canonPath as JsonPointer);
      const existing = byPath.get(path);
      if (existing) {
        existing.push(hint);
      } else {
        byPath.set(path, [hint]);
      }
    }
    const resolved = new Map<JsonPointer, ResolvedCoverageHintsForPath>();
    for (const [path, bucket] of byPath) {
      resolved.set(path, resolveCoverageHintConflicts(bucket));
    }
    return resolved;
  }

  constructor(effective: ComposeResult, options: FoundryGeneratorOptions) {
    this.options = options;
    this.resolved = resolveOptions(options.planOptions ?? {});
    this.metrics = options.metrics;
    this.coverageIndex = effective.coverageIndex;
    this.containsBag = effective.containsBag;
    this.diagNodes = effective.diag?.nodes;
    this.pointerIndex = buildPointerIndex(effective.canonical.schema);
    this.normalizedAlphabet = normalizeAlphabet(
      this.resolved.patternWitness.alphabet
    );
    this.baseSeed = normalizeSeed(options.seed);
    if (options.validateFormats === true) {
      this.formatRegistry = createFormatRegistry({
        seed: this.baseSeed,
      });
    }
    this.rootSchema = effective.canonical.schema;
    this.ptrMap = effective.canonical.ptrMap;
    this.sourceSchema = options.sourceSchema;
    const notes: NormalizerNote[] = effective.canonical.notes ?? [];
    this.pnamesRewrite = new Set(
      notes
        .filter((note) => note.code === DIAGNOSTIC_CODES.PNAMES_REWRITE_APPLIED)
        .map((note) => note.canonPath)
    );
    this.shouldRecordEvalTrace = this.resolved.metrics === true;
    this.stringTweakOrder =
      this.resolved.conditionals.exclusivityStringTweak === 'preferAscii'
        ? (['a', '\u0000'] as const)
        : (['\u0000', 'a'] as const);
    this.multipleOfEpsilon = Number.parseFloat(
      `1e-${this.resolved.rational.decimalPrecision}`
    );
    this.preferExamples = options.preferExamples === true;
    this.coverage = options.coverage;
    this.coverageHintsByPath =
      this.coverage &&
      this.coverage.mode === 'guided' &&
      Array.isArray(this.coverage.hints) &&
      this.coverage.hints.length > 0
        ? this.buildCoverageHintsIndex(this.coverage.hints)
        : undefined;
  }

  private readonly rootSchema: Schema | unknown;

  run(): GeneratorStageOutput {
    const count = Math.max(1, Math.floor(this.options.count ?? 1));
    // Pre-warm Source AJV when original schema is provided so dialect is resolved eagerly.
    if (this.sourceSchema !== undefined) {
      this.getOrCreateSourceAjv();
    }
    const items: unknown[] = [];
    for (let index = 0; index < count; index += 1) {
      this.currentItemIndex = index;
      items.push(this.generateValue(this.rootSchema, '', index));
    }

    const metrics: GeneratorStageOutput['metrics'] = {};
    if (this.patternWitnessTrials > 0) {
      metrics.patternWitnessTried = this.patternWitnessTrials;
    }

    return {
      items,
      diagnostics: this.diagnostics,
      metrics,
      seed: this.baseSeed,
    };
  }

  private getEnumHintIndex(
    canonPath: JsonPointer,
    values: unknown[]
  ): number | undefined {
    if (!this.coverage || this.coverage.mode !== 'guided') return undefined;
    if (!this.coverageHintsByPath || !Array.isArray(values)) {
      return undefined;
    }
    const key = canonicalizeCoveragePath(canonPath);
    const resolved = this.coverageHintsByPath.get(key);
    if (!resolved) return undefined;
    const enumHint = resolved.effective.find(
      (hint) => hint.kind === 'coverEnumValue'
    ) as CoverageHint | undefined;
    if (!enumHint || enumHint.kind !== 'coverEnumValue') return undefined;
    const index = enumHint.params.valueIndex;
    if (
      typeof index === 'number' &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < values.length
    ) {
      return index;
    }
    // Index outside enum bounds or invalid type: record as internal error.
    this.recordUnsatisfiedHint({
      kind: 'coverEnumValue',
      canonPath: key,
      params: { valueIndex: index },
      reasonCode: 'INTERNAL_ERROR',
      reasonDetail: 'coverEnumValue index out of range for enum',
    });
    return undefined;
  }

  private generateValue(
    schema: unknown,
    canonPath: JsonPointer,
    itemIndex: number
  ): unknown {
    if (schema === false) {
      return null;
    }
    if (schema === true || schema === undefined) {
      return {};
    }
    if (!schema || typeof schema !== 'object') {
      return {};
    }
    const { schema: resolvedSchema, pointer: resolvedPointer } =
      this.resolveSchemaRef(schema as Record<string, unknown>, canonPath);
    const obj = resolvedSchema;
    const effectiveCanonPath = resolvedPointer;

    this.recordSchemaNodeHit(effectiveCanonPath);

    // CLI/JSG-P1: when preferExamples is enabled, honor root-level
    // schema examples when present, falling back to generation when not.
    if (this.preferExamples && canonPath === '') {
      const example = extractPreferredExample(obj);
      if (example !== undefined) {
        return example;
      }
    }

    if (Object.prototype.hasOwnProperty.call(obj, 'const')) {
      return obj.const;
    }
    if (Array.isArray(obj.enum) && obj.enum.length > 0) {
      const enumValues = obj.enum as unknown[];
      const hintedIndex = this.getEnumHintIndex(effectiveCanonPath, enumValues);
      const chosen =
        hintedIndex !== undefined && enumValues[hintedIndex] !== undefined
          ? enumValues[hintedIndex]
          : enumValues[0];
      this.recordEnumValueHit(obj, effectiveCanonPath, chosen);
      return chosen;
    }

    const type = determineType(obj);
    switch (type) {
      case 'object':
        return this.generateObject(obj, effectiveCanonPath, itemIndex);
      case 'array':
        return this.generateArray(obj, effectiveCanonPath, itemIndex);
      case 'string':
        return this.generateString(obj);
      case 'integer':
        return this.generateInteger(obj);
      case 'number':
        return this.generateNumber(obj);
      case 'boolean':
        return this.generateBoolean(obj);
      case 'null':
        return null;
      default:
        if (Array.isArray(obj.allOf)) {
          return this.generateAllOf(obj, effectiveCanonPath, itemIndex);
        }
        if (Array.isArray(obj.oneOf)) {
          return this.generateOneOf(obj, effectiveCanonPath, itemIndex);
        }
        if (Array.isArray(obj.anyOf)) {
          return this.generateAnyOf(obj, effectiveCanonPath, itemIndex);
        }
        return {};
    }
  }

  private generateObject(
    schema: Record<string, unknown>,
    canonPath: JsonPointer,
    itemIndex: number
  ): Record<string, unknown> {
    const coverage = this.coverageIndex.get(canonPath);
    const result: Record<string, unknown> = {};
    const usedNames = new Set<string>();
    this.conditionalBlocklist.delete(canonPath);
    const eTraceGuard = schema.unevaluatedProperties === false;

    if (
      Array.isArray(schema.oneOf) &&
      this.shouldDelegateObjectToOneOf(schema)
    ) {
      const delegated = this.generateOneOf(schema, canonPath, itemIndex);
      if (
        delegated &&
        typeof delegated === 'object' &&
        !Array.isArray(delegated)
      ) {
        return delegated as Record<string, unknown>;
      }
      return result;
    }

    const properties: Record<string, unknown> = {};
    const patternProperties: Record<string, unknown> = {};
    let additionalProperties: unknown = schema.additionalProperties;
    const required = new Set<string>();
    const dependentRequirementsMap = new Map<string, Set<string>>();

    const addDependencies = (key: string, deps: unknown): void => {
      if (!Array.isArray(deps)) return;
      let entry = dependentRequirementsMap.get(key);
      if (!entry) {
        entry = new Set<string>();
        dependentRequirementsMap.set(key, entry);
      }
      for (const dep of deps) {
        if (typeof dep === 'string') {
          entry.add(dep);
        }
      }
    };

    const visitedPointers = new Set<string>();

    const mergeSchema = (
      source: Record<string, unknown>,
      pointer: JsonPointer
    ): void => {
      const visitKey = pointer ?? '';
      if (visitedPointers.has(visitKey)) {
        return;
      }
      visitedPointers.add(visitKey);

      if (Array.isArray(source.required)) {
        for (const name of source.required as unknown[]) {
          if (typeof name === 'string') {
            required.add(name);
          }
        }
      }
      if (isRecord(source.properties)) {
        for (const [key, value] of Object.entries(
          source.properties as Record<string, unknown>
        )) {
          properties[key] = value;
        }
      }
      if (isRecord(source.patternProperties)) {
        for (const [key, value] of Object.entries(
          source.patternProperties as Record<string, unknown>
        )) {
          patternProperties[key] = value;
        }
      }
      if (
        Object.prototype.hasOwnProperty.call(source, 'additionalProperties')
      ) {
        additionalProperties = (source as Record<string, unknown>)[
          'additionalProperties'
        ];
      }
      if (isRecord(source.dependentRequired)) {
        for (const [key, value] of Object.entries(
          source.dependentRequired as Record<string, unknown>
        )) {
          addDependencies(key, value);
        }
      }
      if (isRecord(source.dependentSchemas)) {
        for (const [key, value] of Object.entries(
          source.dependentSchemas as Record<string, unknown>
        )) {
          const schemaValue = value as Record<string, unknown>;
          if (Array.isArray(schemaValue?.required)) {
            addDependencies(key, schemaValue.required);
          }
        }
      }
      const refValue = source['$ref'];
      if (typeof refValue === 'string') {
        const target = this.resolveRefTarget(refValue);
        if (target) {
          mergeSchema(target.schema, target.pointer);
        }
      }
      const dynamicRefValue = source['$dynamicRef'];
      if (typeof dynamicRefValue === 'string') {
        const dynamicTarget = this.resolveDynamicRefTarget(
          pointer,
          dynamicRefValue
        );
        if (dynamicTarget) {
          mergeSchema(dynamicTarget.schema, dynamicTarget.pointer);
        }
      }
      if (Array.isArray(source.allOf)) {
        const branches = source.allOf as unknown[];
        for (let idx = 0; idx < branches.length; idx += 1) {
          const branch = branches[idx];
          if (!isRecord(branch)) continue;
          const allOfPointer = appendPointer(pointer, 'allOf');
          const childPointer = appendPointer(allOfPointer, String(idx));
          mergeSchema(branch as Record<string, unknown>, childPointer);
        }
      }
      if (Array.isArray(source.oneOf)) {
        const oneOfPointer = appendPointer(pointer, 'oneOf');
        const chosen = this.getChosenBranchIndex(oneOfPointer);
        if (chosen !== undefined) {
          const branch = source.oneOf[chosen];
          if (isRecord(branch)) {
            const childPointer = appendPointer(oneOfPointer, String(chosen));
            mergeSchema(branch as Record<string, unknown>, childPointer);
          }
        }
      }
      if (Array.isArray(source.anyOf)) {
        const anyOfPointer = appendPointer(pointer, 'anyOf');
        const chosen = this.getChosenBranchIndex(anyOfPointer);
        if (chosen !== undefined) {
          const branch = source.anyOf[chosen];
          if (isRecord(branch)) {
            const childPointer = appendPointer(anyOfPointer, String(chosen));
            mergeSchema(branch as Record<string, unknown>, childPointer);
          }
        }
      }
    };

    mergeSchema(schema, canonPath);
    const dependencyMap: Record<string, string[]> = {};
    for (const [key, set] of dependentRequirementsMap.entries()) {
      dependencyMap[key] = Array.from(set.values());
    }

    const compareUtf16 = (a: string, b: string): number =>
      a < b ? -1 : a > b ? 1 : 0;
    const requiredNames = Array.from(required.values()).sort(compareUtf16);
    for (const name of requiredNames) {
      const evaluationProof = eTraceGuard
        ? this.findEvaluationProof(schema, canonPath, result, name)
        : undefined;
      if (
        !this.isNameWithinCoverage(name, canonPath, coverage, evaluationProof)
      ) {
        continue;
      }
      if (eTraceGuard && !evaluationProof) {
        continue;
      }
      const resolved = this.resolveSchemaForKey(
        name,
        canonPath,
        properties,
        patternProperties,
        additionalProperties
      );
      const value = this.generateValue(
        resolved.schema,
        resolved.pointer,
        itemIndex
      );
      result[name] = value;
      usedNames.add(name);
      this.recordPropertyPresent(resolved.pointer, name);
      this.recordEvaluationTrace(canonPath, name, evaluationProof);
      if (eTraceGuard) {
        this.invalidateEvaluationCacheForObject(result);
      }
    }

    this.applyDependentRequired(
      schema,
      result,
      canonPath,
      itemIndex,
      usedNames,
      properties,
      patternProperties,
      additionalProperties,
      dependencyMap,
      eTraceGuard
    );
    this.applyConditionalHints(schema, canonPath, result, itemIndex, usedNames);

    const minProperties =
      typeof schema.minProperties === 'number'
        ? Math.max(0, Math.floor(schema.minProperties))
        : 0;

    // Add optional properties from explicit definitions first
    if (usedNames.size < minProperties) {
      const baseCandidates = Object.keys(properties).filter(
        (name) => !usedNames.has(name)
      );
      const candidates = this.orderOptionalPropertyCandidates(
        canonPath,
        baseCandidates.sort()
      );
      for (const name of candidates) {
        if (usedNames.size >= minProperties) break;
        if (this.isConditionallyBlocked(canonPath, name)) continue;
        const evaluationProof = eTraceGuard
          ? this.findEvaluationProof(schema, canonPath, result, name)
          : undefined;
        if (
          !this.isNameWithinCoverage(name, canonPath, coverage, evaluationProof)
        ) {
          continue;
        }
        if (eTraceGuard && !evaluationProof) continue;
        const resolved = this.resolveSchemaForKey(
          name,
          canonPath,
          properties,
          patternProperties,
          additionalProperties
        );
        const value = this.generateValue(
          resolved.schema,
          resolved.pointer,
          itemIndex
        );
        result[name] = value;
        usedNames.add(name);
        this.recordPropertyPresent(resolved.pointer, name);
        this.recordEvaluationTrace(canonPath, name, evaluationProof);
        if (eTraceGuard) {
          this.invalidateEvaluationCacheForObject(result);
        }
      }
    }

    if (usedNames.size < minProperties) {
      const patternIterator = this.createPatternIterators(
        patternProperties,
        canonPath
      );
      const patternsHit = new Set<JsonPointer>();
      const namesFromPatterns = new Set<string>();
      while (usedNames.size < minProperties && patternIterator.length > 0) {
        let satisfied = false;
        for (const iterator of patternIterator) {
          let evaluationProofForCandidate: EvaluationProof | undefined;
          const candidate = iterator.enumerator.next((value) => {
            if (usedNames.has(value)) return false;
            if (this.isConditionallyBlocked(canonPath, value)) return false;
            const proof = eTraceGuard
              ? this.findEvaluationProof(schema, canonPath, result, value)
              : undefined;
            if (!this.isNameWithinCoverage(value, canonPath, coverage, proof)) {
              return false;
            }
            if (eTraceGuard && !proof) return false;
            evaluationProofForCandidate = proof;
            return true;
          });
          if (!candidate) continue;
          patternsHit.add(iterator.pointer);
          const resolved = this.resolveSchemaForKey(
            candidate,
            canonPath,
            properties,
            patternProperties,
            additionalProperties
          );
          const value = this.generateValue(
            resolved.schema,
            resolved.pointer,
            itemIndex
          );
          result[candidate] = value;
          usedNames.add(candidate);
          namesFromPatterns.add(candidate);
          this.recordPropertyPresent(resolved.pointer, candidate);
          this.recordEvaluationTrace(
            canonPath,
            candidate,
            evaluationProofForCandidate
          );
          if (eTraceGuard) {
            this.invalidateEvaluationCacheForObject(result);
          }
          satisfied = true;
          break;
        }
        if (!satisfied) break;
      }
      if (patternsHit.size > 0 && namesFromPatterns.size > 0) {
        this.diagnostics.push({
          code: DIAGNOSTIC_CODES.TARGET_ENUM_ROUNDROBIN_PATTERNPROPS,
          phase: DIAGNOSTIC_PHASES.GENERATE,
          canonPath,
          details: {
            patternsHit: patternsHit.size,
            distinctNames: namesFromPatterns.size,
          },
        });
      }
    }

    if (usedNames.size < minProperties) {
      const propertyNamesSchema = isRecord(schema.propertyNames)
        ? (schema.propertyNames as Record<string, unknown>)
        : undefined;
      const propertyNamesEnum = Array.isArray(propertyNamesSchema?.enum)
        ? (propertyNamesSchema.enum as unknown[]).filter(
            (value): value is string => typeof value === 'string'
          )
        : undefined;
      const rewriteApplied = this.hasPnamesRewrite(canonPath);
      const apFalse = schema.additionalProperties === false;
      if (
        propertyNamesEnum &&
        propertyNamesEnum.length > 0 &&
        (!apFalse || rewriteApplied)
      ) {
        const seen = new Set<string>();
        const sortedCandidates = this.orderOptionalPropertyCandidates(
          canonPath,
          propertyNamesEnum
            .filter((value) => {
              if (seen.has(value)) return false;
              seen.add(value);
              return true;
            })
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        );
        for (const candidate of sortedCandidates) {
          if (usedNames.size >= minProperties) break;
          if (usedNames.has(candidate)) continue;
          if (this.isConditionallyBlocked(canonPath, candidate)) continue;
          const evaluationProof = eTraceGuard
            ? this.findEvaluationProof(schema, canonPath, result, candidate)
            : undefined;
          if (
            !this.isNameWithinCoverage(
              candidate,
              canonPath,
              coverage,
              evaluationProof
            )
          ) {
            continue;
          }
          if (eTraceGuard && !evaluationProof) {
            continue;
          }
          const resolved = this.resolveSchemaForKey(
            candidate,
            canonPath,
            properties,
            patternProperties,
            additionalProperties
          );
          const value = this.generateValue(
            resolved.schema,
            resolved.pointer,
            itemIndex
          );
          result[candidate] = value;
          usedNames.add(candidate);
          this.recordPropertyPresent(resolved.pointer, candidate);
          this.recordEvaluationTrace(canonPath, candidate, evaluationProof);
          if (eTraceGuard) {
            this.invalidateEvaluationCacheForObject(result);
          }
        }
      }
    }

    const orderedResult: Record<string, unknown> = {};
    for (const name of requiredNames) {
      if (!Object.prototype.hasOwnProperty.call(result, name)) continue;
      orderedResult[name] = result[name];
    }
    const optionalNames = Object.keys(result)
      .filter((name) => !required.has(name))
      .sort(compareUtf16);
    for (const name of optionalNames) {
      orderedResult[name] = result[name];
    }

    this.recordUnsatisfiedPropertyHints(canonPath, orderedResult);

    return orderedResult;
  }

  private findEvaluationProof(
    objectSchema: Record<string, unknown>,
    canonPath: JsonPointer,
    currentObject: Record<string, unknown>,
    name: string
  ): EvaluationProof | undefined {
    // E-Trace cache: reuse proofs per (object instance, name) for the current candidate.
    const cacheForObject =
      this.eTraceCache.get(currentObject) ??
      (() => {
        const fresh = new Map<string, EvaluationProof | null>();
        this.eTraceCache.set(currentObject, fresh);
        return fresh;
      })();
    if (cacheForObject.has(name)) {
      const cached = cacheForObject.get(name) ?? undefined;
      return cached;
    }

    const processed = new Set<string>();
    const queue: EvaluationNode[] = this.expandObjectApplicators(
      { schema: objectSchema, pointer: canonPath, via: [] },
      currentObject
    );
    let fallbackProof: EvaluationProof | undefined;
    while (queue.length > 0) {
      const entry = queue.shift()!;
      const key = `${entry.pointer}|${entry.via.join('>')}`;
      if (processed.has(key)) continue;
      processed.add(key);
      const evaluation = this.schemaEvaluatesName(entry.schema, name);
      if (evaluation) {
        const proof: EvaluationProof = {
          via: [...entry.via, evaluation],
          pointer: entry.pointer,
        };
        if (evaluation === 'additionalProperties') {
          if (!fallbackProof) fallbackProof = proof;
        } else {
          return proof;
        }
      }
      const extras = this.collectActiveApplicators(
        entry.schema,
        entry.pointer,
        currentObject,
        entry.via
      );
      for (const extra of extras) {
        queue.push(extra);
      }
    }
    const result = fallbackProof;
    cacheForObject.set(name, result ?? null);
    return result;
  }

  private orderOptionalPropertyCandidates(
    canonPath: JsonPointer,
    candidates: string[]
  ): string[] {
    if (
      !this.coverage ||
      this.coverage.mode !== 'guided' ||
      !this.coverageHintsByPath ||
      candidates.length === 0
    ) {
      return candidates;
    }
    const key = canonicalizeCoveragePath(canonPath);
    const resolved = this.coverageHintsByPath.get(key);
    if (!resolved || resolved.effective.length === 0) {
      return candidates;
    }
    const preferredNames = new Set<string>();
    for (const hint of resolved.effective) {
      if (
        hint.kind === 'ensurePropertyPresence' &&
        hint.params.present === true
      ) {
        preferredNames.add(hint.params.propertyName);
      }
    }
    if (preferredNames.size === 0) return candidates;
    const hinted: string[] = [];
    const others: string[] = [];
    for (const name of candidates) {
      if (preferredNames.has(name)) {
        hinted.push(name);
      } else {
        others.push(name);
      }
    }
    if (hinted.length === 0) return candidates;
    return [...hinted, ...others];
  }

  private recordUnsatisfiedPropertyHints(
    canonPath: JsonPointer,
    objectValue: Record<string, unknown>
  ): void {
    if (
      !this.coverage ||
      this.coverage.mode !== 'guided' ||
      !this.coverageHintsByPath
    ) {
      return;
    }
    const key = canonicalizeCoveragePath(canonPath);
    const resolved = this.coverageHintsByPath.get(key);
    if (!resolved) return;
    for (const hint of resolved.effective) {
      if (
        hint.kind === 'ensurePropertyPresence' &&
        hint.params.present === true
      ) {
        const name = hint.params.propertyName;
        if (!Object.prototype.hasOwnProperty.call(objectValue, name)) {
          this.recordUnsatisfiedHint({
            kind: hint.kind,
            canonPath: key,
            params: { propertyName: name, present: true },
            reasonCode: 'CONFLICTING_CONSTRAINTS',
            reasonDetail: 'property not present in generated instance',
          });
        }
      }
    }
  }

  private isNameWithinCoverage(
    name: string,
    _canonPath: JsonPointer,
    baseCoverage: CoverageEntry | undefined,
    _evaluationProof?: EvaluationProof
  ): boolean {
    if (!baseCoverage) return true;
    return baseCoverage.has(name);
  }

  private schemaEvaluatesName(
    schema: Record<string, unknown>,
    name: string
  ): EvaluationFamily | undefined {
    const properties = isRecord(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
    if (Object.prototype.hasOwnProperty.call(properties, name)) {
      return 'properties';
    }
    const patternProperties = isRecord(schema.patternProperties)
      ? (schema.patternProperties as Record<string, unknown>)
      : {};
    for (const pattern of Object.keys(patternProperties)) {
      if (typeof pattern !== 'string') continue;
      try {
        const regex = new RegExp(pattern, 'u');
        if (regex.test(name)) {
          return 'patternProperties';
        }
      } catch {
        continue;
      }
    }
    const additional = schema.additionalProperties;
    if (additional !== false) {
      return 'additionalProperties';
    }
    return undefined;
  }

  private expandObjectApplicators(
    root: EvaluationNode,
    currentObject: Record<string, unknown>
  ): EvaluationNode[] {
    const stack = [root];
    const seen = new Set<string>();
    const collected: EvaluationNode[] = [];
    while (stack.length > 0) {
      const entry = stack.pop()!;
      const key = `${entry.pointer}|${entry.via.join('>')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(entry);
      const extras = this.collectActiveApplicators(
        entry.schema,
        entry.pointer,
        currentObject,
        entry.via
      );
      for (const extra of extras) {
        stack.push(extra);
      }
    }
    return collected;
  }

  private collectActiveApplicators(
    schema: Record<string, unknown>,
    pointer: JsonPointer,
    currentObject: Record<string, unknown>,
    viaBase: EvaluationFamily[]
  ): EvaluationNode[] {
    const extras: EvaluationNode[] = [];

    if (Array.isArray(schema.allOf)) {
      const branches = schema.allOf as unknown[];
      for (let idx = 0; idx < branches.length; idx += 1) {
        const branch = branches[idx];
        if (!isRecord(branch)) continue;
        const branchPointer =
          getPointerFromIndex(this.pointerIndex, branch) ??
          appendPointer(pointer, `allOf/${idx}`);
        extras.push({
          schema: branch,
          pointer: branchPointer,
          via: [...viaBase, 'allOf'],
        });
      }
    }

    if (Array.isArray(schema.oneOf)) {
      const oneOfPointer = appendPointer(pointer, 'oneOf');
      const chosen = this.getChosenBranchIndex(oneOfPointer);
      if (chosen !== undefined) {
        const branch = schema.oneOf[chosen];
        if (isRecord(branch)) {
          const branchPointer =
            getPointerFromIndex(this.pointerIndex, branch) ??
            appendPointer(oneOfPointer, String(chosen));
          extras.push({
            schema: branch,
            pointer: branchPointer,
            via: [...viaBase, 'oneOf'],
          });
        }
      }
    }

    if (Array.isArray(schema.anyOf)) {
      const branches = schema.anyOf as unknown[];
      for (let idx = 0; idx < branches.length; idx += 1) {
        const branch = branches[idx];
        if (!isRecord(branch)) continue;
        const branchPointer =
          getPointerFromIndex(this.pointerIndex, branch) ??
          appendPointer(pointer, `anyOf/${idx}`);
        if (this.validateAgainstOriginalAt(branchPointer, currentObject)) {
          extras.push({
            schema: branch,
            pointer: branchPointer,
            via: [...viaBase, 'anyOf'],
          });
        }
      }
    }

    if (isRecord(schema.if)) {
      const outcome = this.evaluateConditionalOutcome(
        schema.if as Record<string, unknown>,
        currentObject
      );
      if (outcome.status === 'satisfied' && isRecord(schema.then)) {
        const thenSchema = schema.then as Record<string, unknown>;
        const thenPointer =
          getPointerFromIndex(this.pointerIndex, thenSchema) ??
          appendPointer(pointer, 'then');
        extras.push({
          schema: thenSchema,
          pointer: thenPointer,
          via: [...viaBase, 'then'],
        });
      } else if (outcome.status === 'unsatisfied' && isRecord(schema.else)) {
        const elseSchema = schema.else as Record<string, unknown>;
        const elsePointer =
          getPointerFromIndex(this.pointerIndex, elseSchema) ??
          appendPointer(pointer, 'else');
        extras.push({
          schema: elseSchema,
          pointer: elsePointer,
          via: [...viaBase, 'else'],
        });
      }
    }

    const refValue = schema['$ref'];
    if (typeof refValue === 'string') {
      const target = this.resolveRefTarget(refValue);
      if (target) {
        extras.push({
          schema: target.schema,
          pointer: target.pointer,
          via: [...viaBase, '$ref'],
        });
      }
    }

    const dynamicRefValue = schema['$dynamicRef'];
    if (typeof dynamicRefValue === 'string') {
      const target = this.resolveDynamicRefTarget(pointer, dynamicRefValue);
      if (target) {
        extras.push({
          schema: target.schema,
          pointer: target.pointer,
          via: [...viaBase, '$ref'],
        });
      }
    }

    const dependentSchemas = isRecord(schema.dependentSchemas)
      ? (schema.dependentSchemas as Record<string, unknown>)
      : {};
    for (const [key, depSchema] of Object.entries(dependentSchemas)) {
      if (!Object.prototype.hasOwnProperty.call(currentObject, key)) continue;
      if (!isRecord(depSchema)) continue;
      const depPointer =
        getPointerFromIndex(this.pointerIndex, depSchema) ??
        appendPointer(pointer, `dependentSchemas/${key}`);
      if (!this.validateAgainstOriginalAt(depPointer, currentObject)) {
        continue;
      }
      extras.push({
        schema: depSchema,
        pointer: depPointer,
        via: [...viaBase, 'allOf'],
      });
    }

    return extras;
  }

  private recordEvaluationTrace(
    canonPath: JsonPointer,
    name: string,
    proof: EvaluationProof | undefined
  ): void {
    if (!this.shouldRecordEvalTrace) return;
    if (!proof || proof.via.length === 0) return;
    this.diagnostics.push({
      code: DIAGNOSTIC_CODES.EVALTRACE_PROP_SOURCE,
      phase: DIAGNOSTIC_PHASES.GENERATE,
      canonPath,
      details: {
        name,
        via: proof.via,
      },
    });
  }

  private invalidateEvaluationCacheForObject(
    currentObject: Record<string, unknown>
  ): void {
    // Clear any memoized E-Trace proofs for this candidate object.
    this.eTraceCache.delete(currentObject);
  }

  private getChosenBranchIndex(canonPath: JsonPointer): number | undefined {
    const node = this.diagNodes?.[canonPath];
    const idx = node?.chosenBranch?.index;
    return typeof idx === 'number' ? idx : undefined;
  }

  private getPreferredBranchIndex(
    canonPath: JsonPointer,
    branchCount: number
  ): number | undefined {
    if (
      !this.coverage ||
      this.coverage.mode !== 'guided' ||
      !this.coverageHintsByPath
    ) {
      return undefined;
    }
    const key = canonicalizeCoveragePath(canonPath);
    const resolved = this.coverageHintsByPath.get(key);
    if (!resolved) return undefined;
    const hint = resolved.effective.find(
      (entry) => entry.kind === 'preferBranch'
    ) as CoverageHint | undefined;
    if (!hint || hint.kind !== 'preferBranch') return undefined;
    const index = hint.params.branchIndex;
    if (
      typeof index === 'number' &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < branchCount
    ) {
      return index;
    }
    this.recordUnsatisfiedHint({
      kind: 'preferBranch',
      canonPath: key,
      params: { branchIndex: index },
      reasonCode: 'INTERNAL_ERROR',
      reasonDetail: 'preferBranch index out of range for branch count',
    });
    return undefined;
  }

  private hasPnamesRewrite(canonPath: JsonPointer): boolean {
    return this.pnamesRewrite.has(canonPath);
  }

  private shouldDelegateObjectToOneOf(
    schema: Record<string, unknown>
  ): boolean {
    const hasProperties =
      isRecord(schema.properties) &&
      Object.keys(schema.properties as Record<string, unknown>).length > 0;
    const hasRequired =
      Array.isArray(schema.required) && schema.required.length > 0;
    const hasPatternProperties =
      isRecord(schema.patternProperties) &&
      Object.keys(schema.patternProperties as Record<string, unknown>).length >
        0;
    return !hasProperties && !hasRequired && !hasPatternProperties;
  }

  private validateAgainstOriginalAt(
    canonPtr: JsonPointer,
    data: unknown
  ): boolean {
    const originalPtr = this.ptrMap.get(canonPtr);
    const sub = this.getOriginalSubschema(originalPtr);
    if (!sub) return false;

    const refInfo = this.buildSourceRef(originalPtr);
    const cacheKey = refInfo?.cacheKey ?? originalPtr ?? `#canon:${canonPtr}`;
    let validate: ValidateFunction | undefined =
      this.branchValidatorCache.get(cacheKey);

    if (!validate) {
      try {
        const ajv = this.getOrCreateSourceAjv();
        if (refInfo) {
          validate =
            (ajv.getSchema(refInfo.ref) as ValidateFunction | undefined) ??
            ajv.compile({ $ref: refInfo.ref });
        } else {
          validate = ajv.compile(sub as object);
        }
        this.branchValidatorCache.set(cacheKey, validate);
      } catch {
        return false;
      }
    }

    try {
      return !!validate(data);
    } catch {
      return false;
    }
  }

  private getOriginalSubschema(originalPtr?: string): unknown | undefined {
    const root = this.sourceSchema;
    if (!root || !originalPtr) return undefined;
    if (originalPtr === '' || originalPtr === '#') return root as object;
    const ptr = originalPtr.startsWith('#')
      ? originalPtr.slice(1)
      : originalPtr;
    const tokens = ptr
      .split('/')
      .filter((t) => t.length > 0)
      .map(unescapePointerToken);
    let node: unknown = root;
    for (const tok of tokens) {
      if (
        node !== null &&
        typeof node === 'object' &&
        Object.prototype.hasOwnProperty.call(
          node as Record<string, unknown>,
          tok
        )
      ) {
        node = (node as Record<string, unknown>)[tok];
      } else {
        return undefined;
      }
    }
    return node;
  }

  private getOrCreateSourceAjv(): Ajv {
    if (this.sourceAjvCache) return this.sourceAjvCache;
    const dialect: JsonSchemaDialect = detectDialectFromSchema(
      this.sourceSchema
    );
    const ajv = createSourceAjv(
      {
        dialect,
        validateFormats: Boolean(this.options.validateFormats),
        discriminator: Boolean(this.options.discriminator),
        multipleOfPrecision:
          this.resolved.rational.fallback === 'decimal' ||
          this.resolved.rational.fallback === 'float'
            ? this.resolved.rational.decimalPrecision
            : undefined,
      },
      this.options.planOptions
    );
    if (
      Array.isArray(this.options.registryDocs) &&
      this.options.registryDocs.length > 0 &&
      this.options.resolverHydrateFinalAjv !== false
    ) {
      hydrateSourceAjvFromRegistry(ajv, this.options.registryDocs, {
        ignoreIncompatible: true,
        notes: this.options.resolverNotes,
        seenSchemaIds:
          this.options.resolverSeenSchemaIds ?? new Map<string, string>(),
        targetDialect: this.options.sourceDialect ?? dialect,
      });
    }
    this.sourceAjvCache = ajv;
    return this.sourceAjvCache;
  }

  private registerSourceSchema(): string | undefined {
    if (this.sourceSchemaKey) return this.sourceSchemaKey;
    const root = this.sourceSchema ?? this.rootSchema;
    if (!root || typeof root !== 'object') return undefined;
    const ajv = this.getOrCreateSourceAjv();
    const candidateId =
      isRecord(root) && typeof root.$id === 'string' && root.$id.length > 0
        ? root.$id
        : INTERNAL_SOURCE_SCHEMA_KEY;
    const baseId = candidateId.includes('#')
      ? candidateId.slice(0, candidateId.indexOf('#'))
      : candidateId;
    const existing = ajv.getSchema(baseId);
    if (!existing) {
      try {
        ajv.addSchema(root as object, baseId);
      } catch {
        // Best-effort; fall back to direct compilation when registration fails.
      }
    }
    this.sourceSchemaKey = baseId;
    return this.sourceSchemaKey;
  }

  private buildSourceRef(
    originalPtr?: string
  ): { ref: string; cacheKey: string } | undefined {
    const rootId = this.registerSourceSchema();
    if (!rootId) return undefined;
    const suffix = this.normalizeOriginalPointer(originalPtr);
    const ref = `${rootId}${suffix}`;
    return { ref, cacheKey: ref };
  }

  private normalizeOriginalPointer(pointer?: string): string {
    if (!pointer || pointer === '#') {
      return '#';
    }
    if (pointer.startsWith('#')) {
      return pointer;
    }
    return `#${pointer}`;
  }

  private resolveRefTarget(
    ref: string
  ): { schema: Record<string, unknown>; pointer: JsonPointer } | undefined {
    const pointer = normalizeFragmentRef(ref);
    if (pointer === undefined) {
      return undefined;
    }
    const target = resolvePointerInSchema(this.rootSchema, pointer);
    if (!isRecord(target)) {
      return undefined;
    }
    const canonicalPointer =
      getPointerFromIndex(this.pointerIndex, target as object) ?? pointer;
    return {
      schema: target as Record<string, unknown>,
      pointer: canonicalPointer,
    };
  }

  private resolveDynamicRefTarget(
    currentPointer: JsonPointer,
    dynamicRef: string
  ): { schema: Record<string, unknown>; pointer: JsonPointer } | undefined {
    const configured = this.resolved.guards?.maxDynamicScopeHops;
    const maxHops =
      typeof configured === 'number' && configured > 0 ? configured : 2;
    const binding = resolveDynamicRefBinding(
      this.rootSchema,
      currentPointer,
      dynamicRef,
      {
        maxHops,
      }
    );
    if (
      binding.code !== 'DYNAMIC_SCOPE_BOUNDED' ||
      typeof binding.ref !== 'string'
    ) {
      return undefined;
    }
    return this.resolveRefTarget(binding.ref);
  }

  private resolveSchemaRef(
    schema: Record<string, unknown>,
    pointer: JsonPointer
  ): { schema: Record<string, unknown>; pointer: JsonPointer } {
    let currentSchema: Record<string, unknown> = schema;
    let currentPointer: JsonPointer = pointer;
    const seen = new Set<string>();
    while (true) {
      const hasStructuralSiblings = hasRefSiblings(currentSchema);
      let next:
        | { schema: Record<string, unknown>; pointer: JsonPointer }
        | undefined;
      const refValue = currentSchema['$ref'];
      if (!hasStructuralSiblings && typeof refValue === 'string') {
        next = this.resolveRefTarget(refValue);
      } else {
        const dynamicRefValue = currentSchema['$dynamicRef'];
        if (!hasStructuralSiblings && typeof dynamicRefValue === 'string') {
          next = this.resolveDynamicRefTarget(currentPointer, dynamicRefValue);
        }
      }
      if (!next) {
        break;
      }
      if (seen.has(next.pointer)) {
        break;
      }
      seen.add(next.pointer);
      currentSchema = next.schema;
      currentPointer = next.pointer;
    }
    return { schema: currentSchema, pointer: currentPointer };
  }

  private applyDependentRequired(
    objectSchema: Record<string, unknown>,
    target: Record<string, unknown>,
    canonPath: JsonPointer,
    itemIndex: number,
    used: Set<string>,
    properties: Record<string, unknown>,
    patternProperties: Record<string, unknown>,
    additionalProperties: unknown,
    dependencyMap: Record<string, string[]>,
    eTraceGuard: boolean
  ): void {
    if (!dependencyMap) return;
    const coverage = this.coverageIndex.get(canonPath);
    for (const [name, requirements] of Object.entries(dependencyMap)) {
      if (!Object.prototype.hasOwnProperty.call(target, name)) continue;
      if (!Array.isArray(requirements)) continue;
      for (const dep of requirements) {
        if (typeof dep !== 'string' || used.has(dep)) continue;
        const evaluationProof = eTraceGuard
          ? this.findEvaluationProof(objectSchema, canonPath, target, dep)
          : undefined;
        if (
          !this.isNameWithinCoverage(dep, canonPath, coverage, evaluationProof)
        ) {
          continue;
        }
        if (eTraceGuard && !evaluationProof) {
          continue;
        }
        const resolved = this.resolveSchemaForKey(
          dep,
          canonPath,
          properties,
          patternProperties,
          additionalProperties
        );
        const value = this.generateValue(
          resolved.schema,
          resolved.pointer,
          itemIndex
        );
        target[dep] = value;
        used.add(dep);
        this.recordPropertyPresent(resolved.pointer, dep);
        this.recordEvaluationTrace(canonPath, dep, evaluationProof);
        if (eTraceGuard) {
          this.invalidateEvaluationCacheForObject(target);
        }
      }
    }
  }

  private applyConditionalHints(
    schema: Record<string, unknown>,
    canonPath: JsonPointer,
    target: Record<string, unknown>,
    itemIndex: number,
    used: Set<string>
  ): void {
    if (this.resolved.conditionals.strategy !== 'if-aware-lite') return;
    const ifSchema = isRecord(schema.if)
      ? (schema.if as Record<string, unknown>)
      : undefined;
    if (!ifSchema) return;

    const evaluation = this.evaluateConditionalOutcome(ifSchema, target);
    if (evaluation.status === 'unknown') {
      const reason = evaluation.reason ?? 'noObservedKeys';
      this.diagnostics.push({
        code: DIAGNOSTIC_CODES.IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO,
        phase: DIAGNOSTIC_PHASES.GENERATE,
        canonPath,
        details: { reason },
      });
      return;
    }

    if (evaluation.status === 'satisfied') {
      const minThen = this.resolved.conditionals.minThenSatisfaction;
      this.ensureThenSatisfaction(
        schema,
        canonPath,
        target,
        itemIndex,
        used,
        evaluation.discriminants
      );
      this.recordConditionalPathHit(canonPath, 'if+then');
      this.diagnostics.push({
        code: DIAGNOSTIC_CODES.IF_AWARE_HINT_APPLIED,
        phase: DIAGNOSTIC_PHASES.GENERATE,
        canonPath,
        details: {
          strategy: 'if-aware-lite',
          minThenSatisfaction: minThen,
        },
      });
      this.conditionalBlocklist.delete(canonPath);
      return;
    }

    if (evaluation.discriminants.size > 0) {
      this.blockConditionalNames(canonPath, evaluation.discriminants);
    }
    if (schema.else && typeof schema.else === 'object') {
      this.recordConditionalPathHit(canonPath, 'if+else');
    }
    this.diagnostics.push({
      code: DIAGNOSTIC_CODES.IF_AWARE_HINT_APPLIED,
      phase: DIAGNOSTIC_PHASES.GENERATE,
      canonPath,
      details: {
        strategy: 'if-aware-lite',
        minThenSatisfaction: this.resolved.conditionals.minThenSatisfaction,
      },
    });
  }

  private createPatternIterators(
    patternProperties: Record<string, unknown>,
    canonPath: JsonPointer
  ): Array<{
    enumerator: PatternEnumerator;
    pointer: JsonPointer;
    pattern: string;
  }> {
    const entries = Object.keys(patternProperties)
      .filter((pattern) => typeof pattern === 'string')
      .sort();
    const basePointer = appendPointer(canonPath, 'patternProperties');
    const enumerators: Array<{
      enumerator: PatternEnumerator;
      pointer: JsonPointer;
      pattern: string;
    }> = [];
    for (const pattern of entries) {
      const schema = patternProperties[pattern];
      const pointer =
        getPointerFromIndex(this.pointerIndex, schema) ??
        appendPointer(basePointer, pattern);
      const analysis = analyzePatternForWitness(pattern);
      const negativePrefixes = extractNegativeLookaheadPrefixes(pattern);
      const anchored = analysis.anchoredStart && analysis.anchoredEnd;
      const anchoredSafe =
        anchored && !analysis.hasBackReference && !analysis.hasLookAround;
      if (!anchored && !anchoredSafe) {
        // Unanchored patterns are not suitable for name enumeration.
        continue;
      }
      if (analysis.complexityCapped) {
        this.recordPatternCap(pointer, 'candidateBudget', 0);
        continue;
      }
      if (negativePrefixes && negativePrefixes.length > 0) {
        this.diagnostics.push({
          code: DIAGNOSTIC_CODES.TARGET_ENUM_NEGATIVE_LOOKAHEADS,
          phase: DIAGNOSTIC_PHASES.GENERATE,
          canonPath: pointer,
          details: {
            disallowPrefixes: negativePrefixes,
          },
        });
      }
      enumerators.push({
        enumerator: new PatternEnumerator(
          pattern,
          this.resolved.patternWitness,
          this.normalizedAlphabet,
          {
            recordCap: (reason, tried) =>
              this.recordPatternCap(pointer, reason, tried),
            recordTrial: () => this.recordPatternWitnessTrial(),
          }
        ),
        pointer,
        pattern,
      });
    }
    return enumerators;
  }

  private resolveSchemaForKey(
    name: string,
    objectCanonPath: JsonPointer,
    properties: Record<string, unknown>,
    patternProperties: Record<string, unknown>,
    additionalProperties: unknown
  ): { schema: unknown; pointer: JsonPointer } {
    if (Object.prototype.hasOwnProperty.call(properties, name)) {
      const schema = properties[name];
      const pointer =
        getPointerFromIndex(this.pointerIndex, schema) ??
        appendPointer(appendPointer(objectCanonPath, 'properties'), name);
      return { schema, pointer };
    }

    for (const [pattern, schema] of Object.entries(patternProperties)) {
      if (typeof pattern !== 'string') continue;
      try {
        const regex = new RegExp(pattern, 'u');
        if (!regex.test(name)) continue;
      } catch {
        continue;
      }
      const pointer =
        getPointerFromIndex(this.pointerIndex, schema) ??
        appendPointer(
          appendPointer(objectCanonPath, 'patternProperties'),
          pattern
        );
      return { schema, pointer };
    }

    if (additionalProperties !== undefined) {
      const pointer =
        getPointerFromIndex(this.pointerIndex, additionalProperties) ??
        appendPointer(objectCanonPath, 'additionalProperties');
      return { schema: additionalProperties, pointer };
    }

    return {
      schema: undefined,
      pointer: appendPointer(objectCanonPath, 'additionalProperties'),
    };
  }

  private generateArray(
    schema: Record<string, unknown>,
    canonPath: JsonPointer,
    itemIndex: number
  ): unknown[] {
    const result: unknown[] = [];
    const prefixItems = Array.isArray(schema.prefixItems)
      ? (schema.prefixItems as unknown[])
      : [];

    for (let idx = 0; idx < prefixItems.length; idx += 1) {
      const childCanon = appendPointer(canonPath, `prefixItems/${idx}`);
      result.push(this.generateValue(prefixItems[idx], childCanon, itemIndex));
    }

    const minItems =
      typeof schema.minItems === 'number'
        ? Math.max(0, Math.floor(schema.minItems))
        : 0;
    const containsNeeds = this.containsBag.get(canonPath) ?? [];
    const aggregateMin = containsNeeds.reduce(
      (total, need) => total + Math.max(1, Math.floor(need?.min ?? 1)),
      0
    );
    const effectiveMaxItems = computeEffectiveMaxItems(schema);
    const hardCap =
      effectiveMaxItems !== undefined
        ? Math.max(0, Math.floor(effectiveMaxItems))
        : undefined;
    if (hardCap !== undefined && aggregateMin + result.length > hardCap) {
      this.diagnostics.push({
        code: DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM,
        phase: DIAGNOSTIC_PHASES.GENERATE,
        canonPath,
        details: {
          sumMin: aggregateMin,
          maxItems: hardCap,
          disjointness: 'provable',
        },
      });
    }
    const itemsSchema = schema.items;
    const shouldPreSatisfyContains = true;
    const containsContributions = shouldPreSatisfyContains
      ? this.satisfyContainsNeeds(
          containsNeeds,
          result,
          canonPath,
          itemIndex,
          hardCap
        )
      : computeContainsBaseline(containsNeeds, result.length, hardCap);

    const uncappedBaseline = Math.max(
      minItems,
      prefixItems.length,
      containsContributions
    );
    const baseline =
      hardCap !== undefined
        ? Math.min(uncappedBaseline, hardCap)
        : uncappedBaseline;

    if (schema.uniqueItems !== true) {
      while (
        result.length < baseline &&
        (hardCap === undefined || result.length < hardCap)
      ) {
        const childCanon = appendPointer(canonPath, 'items');
        const value = this.generateValue(itemsSchema, childCanon, itemIndex);
        result.push(value);
      }
    }

    if (schema.uniqueItems === true) {
      enforceUniqueItems(result);
      // After de-duplication, re-satisfy contains deterministically
      // and then enforce uniqueness again.
      const afterDedup = this.satisfyContainsNeeds(
        containsNeeds,
        result,
        canonPath,
        itemIndex,
        hardCap
      );
      void afterDedup;
      enforceUniqueItems(result);
      const desiredLength =
        hardCap !== undefined
          ? Math.min(Math.max(result.length, baseline), hardCap)
          : Math.max(result.length, baseline);
      let attempts = 0;
      while (
        result.length < desiredLength &&
        (hardCap === undefined || result.length < hardCap)
      ) {
        const candidate = this.produceUniqueFillerCandidate(
          itemsSchema,
          attempts
        );
        attempts += 1;
        if (candidate === undefined) break;
        if (!isUniqueAppend(result, candidate)) {
          continue;
        }
        result.push(candidate);
      }
    }

    return result;
  }

  private satisfyContainsNeeds(
    needs: ContainsNeed[],
    result: unknown[],
    canonPath: JsonPointer,
    itemIndex: number,
    maxLength?: number
  ): number {
    let maxContribution = result.length;
    if (!needs || needs.length === 0) {
      return maxContribution;
    }
    const baseContains = appendPointer(canonPath, 'contains');
    for (let index = 0; index < needs.length; index += 1) {
      const need = needs[index];
      if (!need) continue;
      const min = Math.max(1, Math.floor(need.min ?? 1));
      const maxAllowed =
        need.max !== undefined && Number.isFinite(need.max)
          ? Math.max(0, Math.floor(need.max))
          : undefined;
      const childCanon =
        getPointerFromIndex(this.pointerIndex, need.schema) ??
        appendPointer(baseContains, String(index));
      let satisfied = 0;
      const targetMin =
        maxAllowed !== undefined && maxAllowed < min ? maxAllowed : min;
      for (let c = 0; c < targetMin; c += 1) {
        if (maxAllowed !== undefined && satisfied >= maxAllowed) {
          break;
        }
        if (maxLength !== undefined && result.length >= maxLength) {
          break;
        }
        const value = this.generateValue(need.schema, childCanon, itemIndex);
        result.push(value);
        satisfied += 1;
      }
      if (satisfied > 0) {
        maxContribution = Math.max(maxContribution, result.length);
      }
      if (satisfied < targetMin) {
        this.diagnostics.push({
          code: DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM,
          phase: DIAGNOSTIC_PHASES.GENERATE,
          canonPath,
          details: {
            sumMin: min,
            maxItems:
              maxAllowed !== undefined
                ? maxAllowed
                : maxLength !== undefined
                  ? maxLength
                  : null,
            disjointness: 'provable',
          },
        });
      }
    }
    return maxContribution;
  }

  private produceUniqueFillerCandidate(
    schema: unknown,
    attempt: number
  ): unknown | undefined {
    if (schema === false) return undefined;
    if (schema === true) {
      // Earliest stable generator for unconstrained items is the minimal object.
      return attempt === 0 ? {} : undefined;
    }
    if (!schema || typeof schema !== 'object') return undefined;
    const node = schema as Record<string, unknown>;

    if (Array.isArray(node.enum) && node.enum.length > attempt) {
      return node.enum[attempt];
    }
    if (Object.prototype.hasOwnProperty.call(node, 'const')) {
      return attempt === 0 ? node.const : undefined;
    }

    const type = determineType(node);
    switch (type) {
      case 'string':
        return this.buildUniqueStringCandidate(node, attempt);
      case 'integer':
        return this.buildUniqueIntegerCandidate(node, attempt);
      case 'number':
        return this.buildUniqueNumberCandidate(node, attempt);
      case 'array':
        // Earliest stable generator for arrays is the empty array; rely on Repair
        // to satisfy additional bounds when needed.
        return attempt === 0 ? [] : undefined;
      case 'object':
        // Earliest stable generator for objects is the empty object; additional
        // bounds are handled by downstream Repair when necessary.
        return attempt === 0 ? {} : undefined;
      case 'boolean':
        if (attempt === 0) return false;
        if (attempt === 1) return true;
        return undefined;
      case 'null':
        return attempt === 0 ? null : undefined;
      default:
        return undefined;
    }
  }

  private buildUniqueStringCandidate(
    schema: Record<string, unknown>,
    attempt: number
  ): string | undefined {
    const alphabet =
      this.normalizedAlphabet.length > 0
        ? this.normalizedAlphabet
        : ['a', 'b', 'c'];
    if (alphabet.length === 0) return undefined;
    const minLength =
      typeof schema.minLength === 'number'
        ? Math.max(0, Math.floor(schema.minLength))
        : 0;
    const maxLength =
      typeof schema.maxLength === 'number'
        ? Math.max(minLength, Math.floor(schema.maxLength))
        : undefined;

    if (minLength === 0 && attempt === 0) {
      return '';
    }

    const alphabetIndex =
      attempt < alphabet.length
        ? attempt
        : Math.min(attempt % alphabet.length, alphabet.length - 1);
    const char = alphabet[alphabetIndex] ?? alphabet[0] ?? 'a';
    const targetLength =
      maxLength !== undefined
        ? Math.min(Math.max(minLength, 1), maxLength)
        : Math.max(minLength, 1);
    let candidate = repeatCodePoint(char, targetLength);
    if (maxLength !== undefined && codePointLength(candidate) > maxLength) {
      candidate = truncateToCodePoints(candidate, maxLength);
    }
    return candidate;
  }

  private buildUniqueIntegerCandidate(
    schema: Record<string, unknown>,
    attempt: number
  ): number | undefined {
    const base = this.generateInteger(schema);
    if (!Number.isFinite(base)) return undefined;
    if (attempt === 0) return base;
    const stepCandidate = Math.floor(
      Math.max(
        1,
        Math.abs(
          typeof schema.multipleOf === 'number' && schema.multipleOf !== 0
            ? Math.trunc(schema.multipleOf)
            : 1
        )
      )
    );
    const step = stepCandidate === 0 ? 1 : stepCandidate;
    const offsets = [attempt * step, -attempt * step];
    for (const offset of offsets) {
      const candidate = base + offset;
      if (this.isNumberWithinBounds(candidate, schema, true)) {
        return candidate;
      }
    }
    return undefined;
  }

  private buildUniqueNumberCandidate(
    schema: Record<string, unknown>,
    attempt: number
  ): number | undefined {
    const base = this.generateNumber(schema);
    if (!Number.isFinite(base)) return undefined;
    if (attempt === 0) return base;
    const step = this.computeNumericStep(schema);
    const offsets = [attempt * step, -attempt * step];
    for (const offset of offsets) {
      const candidate = base + offset;
      if (this.isNumberWithinBounds(candidate, schema, false)) {
        return candidate;
      }
    }
    return undefined;
  }

  private computeNumericStep(schema: Record<string, unknown>): number {
    if (typeof schema.multipleOf === 'number' && schema.multipleOf !== 0) {
      return Math.abs(schema.multipleOf);
    }
    const precision = Math.max(
      1,
      Math.min(20, Math.floor(this.resolved.rational.decimalPrecision))
    );
    return Number.parseFloat(`1e-${precision}`);
  }

  private isNumberWithinBounds(
    value: number,
    schema: Record<string, unknown>,
    integer: boolean
  ): boolean {
    if (!Number.isFinite(value)) return false;
    if (typeof schema.minimum === 'number' && value < schema.minimum)
      return false;
    if (typeof schema.maximum === 'number' && value > schema.maximum)
      return false;
    if (typeof schema.exclusiveMinimum === 'number') {
      if (value <= schema.exclusiveMinimum) return false;
    }
    if (typeof schema.exclusiveMaximum === 'number') {
      if (value >= schema.exclusiveMaximum) return false;
    }
    if (typeof schema.multipleOf === 'number' && schema.multipleOf !== 0) {
      const base = schema.multipleOf;
      const ratio = value / base;
      if (integer) {
        if (!Number.isInteger(ratio)) return false;
      } else {
        const nearest = Math.round(ratio);
        const snapped = nearest * base;
        const tolerance = this.computeMultipleOfTolerance(snapped);
        if (Math.abs(value - snapped) > tolerance) {
          return false;
        }
      }
    }
    if (integer && !Number.isInteger(value)) return false;
    return true;
  }

  private blockConditionalNames(
    canonPath: JsonPointer,
    names: Iterable<string>
  ): void {
    if (!this.conditionalBlocklist.has(canonPath)) {
      this.conditionalBlocklist.set(canonPath, new Set());
    }
    const entry = this.conditionalBlocklist.get(canonPath)!;
    for (const name of names) {
      entry.add(name);
    }
  }

  private isConditionallyBlocked(
    canonPath: JsonPointer,
    name: string
  ): boolean {
    const entry = this.conditionalBlocklist.get(canonPath);
    if (!entry) return false;
    return entry.has(name);
  }

  private evaluateConditionalOutcome(
    ifSchema: Record<string, unknown>,
    currentObject: Record<string, unknown>
  ): {
    status: 'satisfied' | 'unsatisfied' | 'unknown';
    discriminants: Set<string>;
    reason?: 'noDiscriminant' | 'noObservedKeys';
  } {
    const discriminants = new Set<string>();
    const properties = isRecord(ifSchema.properties)
      ? (ifSchema.properties as Record<string, unknown>)
      : {};
    let observed = false;
    for (const [name, subschema] of Object.entries(properties)) {
      if (!isRecord(subschema)) continue;
      const hasConst = subschema.const !== undefined;
      const enumValues = Array.isArray(subschema.enum)
        ? (subschema.enum as unknown[])
        : undefined;
      if (!hasConst && (!enumValues || enumValues.length === 0)) continue;
      discriminants.add(name);
      if (!Object.prototype.hasOwnProperty.call(currentObject, name)) {
        return {
          status: 'unknown',
          discriminants,
          reason: 'noObservedKeys',
        };
      }
      observed = true;
      const value = (currentObject as Record<string, unknown>)[name];
      if (hasConst && value !== subschema.const) {
        return { status: 'unsatisfied', discriminants };
      }
      if (enumValues && !enumValues.includes(value)) {
        return { status: 'unsatisfied', discriminants };
      }
    }
    if (discriminants.size === 0) {
      return { status: 'unknown', discriminants, reason: 'noDiscriminant' };
    }
    if (!observed) {
      return {
        status: 'unknown',
        discriminants,
        reason: 'noObservedKeys',
      };
    }
    return { status: 'satisfied', discriminants };
  }

  private ensureThenSatisfaction(
    schema: Record<string, unknown>,
    canonPath: JsonPointer,
    target: Record<string, unknown>,
    itemIndex: number,
    used: Set<string>,
    discriminants: Set<string>
  ): void {
    const thenSchema = isRecord(schema.then)
      ? (schema.then as Record<string, unknown>)
      : undefined;
    if (!thenSchema) return;
    const minStrategy = this.resolved.conditionals.minThenSatisfaction;
    if (minStrategy === 'discriminants-only') return;

    const coverage = this.coverageIndex.get(canonPath);
    const eTraceGuard = schema.unevaluatedProperties === false;

    const baseProps = isRecord(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
    const thenProps = isRecord(thenSchema.properties)
      ? (thenSchema.properties as Record<string, unknown>)
      : {};
    const mergedProps: Record<string, unknown> = { ...baseProps };
    for (const [name, value] of Object.entries(thenProps)) {
      if (!(name in mergedProps)) {
        mergedProps[name] = value;
      }
    }

    const basePatterns = isRecord(schema.patternProperties)
      ? (schema.patternProperties as Record<string, unknown>)
      : {};
    const thenPatterns = isRecord(thenSchema.patternProperties)
      ? (thenSchema.patternProperties as Record<string, unknown>)
      : {};
    const mergedPatterns: Record<string, unknown> = { ...basePatterns };
    for (const [name, value] of Object.entries(thenPatterns)) {
      if (!(name in mergedPatterns)) {
        mergedPatterns[name] = value;
      }
    }

    const requiredNames = new Set<string>();
    if (Array.isArray(thenSchema.required)) {
      for (const name of thenSchema.required) {
        if (typeof name === 'string') {
          requiredNames.add(name);
        }
      }
    }
    if (minStrategy === 'required+bounds') {
      for (const name of discriminants) {
        requiredNames.add(name);
      }
    }

    for (const name of requiredNames) {
      if (used.has(name)) continue;
      if (this.isConditionallyBlocked(canonPath, name)) continue;
      const evaluationProof = eTraceGuard
        ? this.findEvaluationProof(schema, canonPath, target, name)
        : undefined;
      if (
        !this.isNameWithinCoverage(name, canonPath, coverage, evaluationProof)
      ) {
        continue;
      }
      if (eTraceGuard && !evaluationProof) continue;
      const resolved = this.resolveSchemaForKey(
        name,
        canonPath,
        mergedProps,
        mergedPatterns,
        schema.additionalProperties
      );
      const value = this.generateValue(
        resolved.schema,
        resolved.pointer,
        itemIndex
      );
      target[name] = value;
      used.add(name);
      this.recordPropertyPresent(resolved.pointer, name);
      this.recordEvaluationTrace(canonPath, name, evaluationProof);
      if (eTraceGuard) {
        this.invalidateEvaluationCacheForObject(target);
      }
    }
  }

  private generateString(schema: Record<string, unknown>): string {
    // const/enum outrank type
    if (schema.const !== undefined && typeof schema.const === 'string') {
      return schema.const as string;
    }
    if (Array.isArray(schema.enum)) {
      const first = (schema.enum as unknown[]).find(
        (v) => typeof v === 'string'
      );
      if (typeof first === 'string') return first;
    }

    const minLength =
      typeof schema.minLength === 'number'
        ? Math.max(0, Math.floor(schema.minLength))
        : 0;
    const maxLength =
      typeof schema.maxLength === 'number'
        ? Math.max(minLength, Math.floor(schema.maxLength))
        : undefined;
    const padChar = this.normalizedAlphabet[0] ?? 'a';

    if (typeof schema.pattern === 'string') {
      const patternValue = synthesizePatternExample(schema.pattern);
      if (patternValue !== undefined) {
        const patternLength = codePointLength(patternValue);
        if (
          patternLength >= minLength &&
          (maxLength === undefined || patternLength <= maxLength)
        ) {
          return patternValue;
        }
      }
    }

    // format-aware generation (best-effort when formats are validated)
    if (this.formatRegistry && typeof schema.format === 'string') {
      const res = this.formatRegistry.generate(schema.format);
      if (res.isOk()) {
        let value = res.value;
        if (codePointLength(value) < minLength) {
          value = ensureMinCodePoints(value, minLength, padChar);
        }
        if (maxLength !== undefined && codePointLength(value) > maxLength) {
          value = truncateToCodePoints(value, maxLength);
        }
        return value;
      }
    }

    let candidate = minLength === 0 ? '' : repeatCodePoint(padChar, minLength);
    if (maxLength !== undefined && codePointLength(candidate) > maxLength) {
      candidate = truncateToCodePoints(candidate, maxLength);
    }
    return candidate;
  }

  private generateInteger(schema: Record<string, unknown>): number {
    if (
      schema.const !== undefined &&
      (typeof schema.const === 'number' || typeof schema.const === 'bigint')
    ) {
      return Number(schema.const);
    }
    if (Array.isArray(schema.enum)) {
      const first = (schema.enum as unknown[]).find((v) => Number.isInteger(v));
      if (typeof first === 'number') return first;
    }
    let value = 0;
    if (typeof schema.minimum === 'number') {
      value = Math.max(value, Math.ceil(schema.minimum));
    }
    if (typeof schema.exclusiveMinimum === 'number') {
      value = Math.max(value, Math.floor(schema.exclusiveMinimum) + 1);
    }
    if (typeof schema.maximum === 'number') {
      value = Math.min(value, Math.floor(schema.maximum));
    }
    if (typeof schema.exclusiveMaximum === 'number') {
      value = Math.min(value, Math.ceil(schema.exclusiveMaximum) - 1);
    }
    if (typeof schema.multipleOf === 'number' && schema.multipleOf !== 0) {
      value = alignToMultiple(value, schema.multipleOf);
      if (typeof schema.exclusiveMinimum === 'number') {
        value = Math.max(value, Math.floor(schema.exclusiveMinimum) + 1);
      } else if (typeof schema.minimum === 'number') {
        value = Math.max(value, Math.ceil(schema.minimum));
      }
      if (typeof schema.exclusiveMaximum === 'number') {
        value = Math.min(value, Math.ceil(schema.exclusiveMaximum) - 1);
      } else if (typeof schema.maximum === 'number') {
        value = Math.min(value, Math.floor(schema.maximum));
      }
    }
    return value;
  }

  private generateNumber(schema: Record<string, unknown>): number {
    if (typeof schema.const === 'number') {
      return schema.const as number;
    }
    if (Array.isArray(schema.enum)) {
      const first = (schema.enum as unknown[]).find(
        (v) => typeof v === 'number'
      );
      if (typeof first === 'number') return first;
    }
    const multiple =
      typeof schema.multipleOf === 'number' && schema.multipleOf !== 0
        ? (schema.multipleOf as number)
        : undefined;
    if (multiple) {
      const aligned = this.generateMultipleAlignedNumber(schema, multiple);
      if (typeof aligned === 'number' && Number.isFinite(aligned)) {
        return aligned;
      }
    }
    let value = 0;
    if (typeof schema.minimum === 'number') {
      value = Math.max(value, schema.minimum);
    }
    if (typeof schema.exclusiveMinimum === 'number') {
      value = Math.max(value, schema.exclusiveMinimum + this.multipleOfEpsilon);
    }
    if (typeof schema.maximum === 'number') {
      value = Math.min(value, schema.maximum);
    }
    if (typeof schema.exclusiveMaximum === 'number') {
      value = Math.min(value, schema.exclusiveMaximum - this.multipleOfEpsilon);
    }
    if (multiple) {
      value = alignToMultiple(value, multiple);
      if (typeof schema.exclusiveMinimum === 'number') {
        value = Math.max(
          value,
          schema.exclusiveMinimum + this.multipleOfEpsilon
        );
      } else if (typeof schema.minimum === 'number') {
        value = Math.max(value, schema.minimum);
      }
      if (typeof schema.exclusiveMaximum === 'number') {
        value = Math.min(
          value,
          schema.exclusiveMaximum - this.multipleOfEpsilon
        );
      } else if (typeof schema.maximum === 'number') {
        value = Math.min(value, schema.maximum);
      }
      const preferredIndex =
        Number.isFinite(value) && multiple !== 0
          ? Math.round(value / multiple)
          : undefined;
      const rescue = this.generateMultipleAlignedNumber(
        schema,
        multiple,
        preferredIndex
      );
      if (typeof rescue === 'number' && Number.isFinite(rescue)) {
        value = rescue;
      }
    }
    return value;
  }

  private generateMultipleAlignedNumber(
    schema: Record<string, unknown>,
    multipleOf: number,
    preferredIndex?: number
  ): number | undefined {
    const step = Math.abs(multipleOf);
    if (!Number.isFinite(step) || step === 0) return undefined;
    const lower = this.resolveLowerNumericBound(schema);
    const upper = this.resolveUpperNumericBound(schema);
    const epsilon = Math.min(this.multipleOfEpsilon / 2, step / 2);
    const lowerConstraint =
      lower === undefined
        ? undefined
        : lower.exclusive
          ? lower.value + this.multipleOfEpsilon
          : lower.value;
    const upperConstraint =
      upper === undefined
        ? undefined
        : upper.exclusive
          ? upper.value - this.multipleOfEpsilon
          : upper.value;
    const minIndex =
      lowerConstraint === undefined
        ? undefined
        : Math.ceil((lowerConstraint - epsilon) / step);
    const maxIndex =
      upperConstraint === undefined
        ? undefined
        : Math.floor((upperConstraint + epsilon) / step);
    const lowerIndex =
      minIndex !== undefined ? minIndex : Number.NEGATIVE_INFINITY;
    const upperIndex =
      maxIndex !== undefined ? maxIndex : Number.POSITIVE_INFINITY;
    if (lowerIndex > upperIndex) {
      return undefined;
    }
    let selectedIndex: number;
    if (preferredIndex !== undefined && Number.isFinite(preferredIndex)) {
      const truncated = Math.trunc(preferredIndex);
      const clamped = Math.max(lowerIndex, Math.min(upperIndex, truncated));
      selectedIndex = clamped;
    } else if (lowerIndex <= 0 && upperIndex >= 0) {
      selectedIndex = 0;
    } else if (lowerIndex > 0 && Number.isFinite(lowerIndex)) {
      selectedIndex = lowerIndex;
    } else if (Number.isFinite(upperIndex)) {
      selectedIndex = upperIndex;
    } else {
      selectedIndex = 0;
    }
    if (!Number.isFinite(selectedIndex)) {
      return undefined;
    }
    return this.roundToRationalPrecision(selectedIndex * step);
  }

  private resolveLowerNumericBound(
    schema: Record<string, unknown>
  ): { value: number; exclusive: boolean } | undefined {
    const inclusive =
      typeof schema.minimum === 'number'
        ? { value: schema.minimum, exclusive: false }
        : undefined;
    const exclusive =
      typeof schema.exclusiveMinimum === 'number'
        ? { value: schema.exclusiveMinimum, exclusive: true }
        : undefined;
    if (!inclusive) return exclusive;
    if (!exclusive) return inclusive;
    if (exclusive.value > inclusive.value) return exclusive;
    if (exclusive.value < inclusive.value) return inclusive;
    return exclusive;
  }

  private resolveUpperNumericBound(
    schema: Record<string, unknown>
  ): { value: number; exclusive: boolean } | undefined {
    const inclusive =
      typeof schema.maximum === 'number'
        ? { value: schema.maximum, exclusive: false }
        : undefined;
    const exclusive =
      typeof schema.exclusiveMaximum === 'number'
        ? { value: schema.exclusiveMaximum, exclusive: true }
        : undefined;
    if (!inclusive) return exclusive;
    if (!exclusive) return inclusive;
    if (exclusive.value < inclusive.value) return exclusive;
    if (exclusive.value > inclusive.value) return inclusive;
    return exclusive;
  }

  private roundToRationalPrecision(value: number): number {
    if (!Number.isFinite(value)) {
      return value;
    }
    const precision = Math.max(
      0,
      Math.min(20, Math.floor(this.resolved.rational.decimalPrecision))
    );
    return Number.parseFloat(value.toFixed(precision));
  }

  private computeMultipleOfTolerance(candidate: number): number {
    const absTol = this.multipleOfEpsilon;
    const relTol = Math.abs(candidate) * Number.EPSILON * 16;
    return Math.max(absTol, relTol);
  }

  private snapshotCompositeState(value: unknown): string | undefined {
    const hash = structuralHash(value);
    if (hash?.digest) return hash.digest;
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  private resolveNumericTweakStep(
    initial: number,
    branch?: Record<string, unknown>
  ): number {
    if (
      branch &&
      typeof branch.multipleOf === 'number' &&
      branch.multipleOf !== 0
    ) {
      const magnitude = Math.abs(branch.multipleOf);
      if (magnitude > 0) {
        return magnitude;
      }
    }
    return Number.isInteger(initial) ? 1 : this.multipleOfEpsilon;
  }

  private generateBoolean(schema: Record<string, unknown>): boolean {
    if (schema.const === true) return true;
    if (schema.const === false) return false;
    if (Array.isArray(schema.enum)) {
      const firstBool = (schema.enum as unknown[]).find(
        (value) => typeof value === 'boolean'
      );
      if (typeof firstBool === 'boolean') {
        this.recordEnumValueHit(schema, undefined, firstBool);
        return firstBool;
      }
    }
    if (schema.default === false) return false;
    return false;
  }

  private generateAllOf(
    schema: Record<string, unknown>,
    canonPath: JsonPointer,
    itemIndex: number
  ): unknown {
    const branches = Array.isArray(schema.allOf)
      ? (schema.allOf as unknown[])
      : [];
    if (branches.length === 0) return {};
    const merged = mergeAllOfBranches(branches);
    return this.generateValue(merged, canonPath, itemIndex);
  }

  private generateOneOf(
    schema: Record<string, unknown>,
    canonPath: JsonPointer,
    itemIndex: number
  ): unknown {
    const branches = Array.isArray(schema.oneOf)
      ? (schema.oneOf as unknown[])
      : [];
    const fallbackIndex = 0;
    const unionPointer = appendPointer(canonPath, 'oneOf');
    const hintedIndex = this.getPreferredBranchIndex(
      unionPointer,
      branches.length
    );
    let chosen =
      hintedIndex !== undefined && branches[hintedIndex] !== undefined
        ? hintedIndex
        : fallbackIndex;
    if (hintedIndex === undefined) {
      const record = this.diagNodes?.[canonPath];
      const selectedIndex =
        typeof record?.chosenBranch?.index === 'number'
          ? record.chosenBranch.index
          : fallbackIndex;
      if (
        selectedIndex >= 0 &&
        selectedIndex < branches.length &&
        branches[selectedIndex] !== undefined
      ) {
        chosen = selectedIndex;
      }
    }
    const branchPath = this.buildOneOfBranchPointer(canonPath, chosen);
    this.recordBranchSelection(
      'ONEOF_BRANCH',
      branches[chosen],
      branchPath,
      chosen
    );
    const generated = this.generateValue(
      branches[chosen],
      branchPath,
      itemIndex
    );
    return this.enforceOneOfExclusivity(
      generated,
      branches,
      canonPath,
      chosen,
      branchPath,
      2
    );
  }

  private enforceOneOfExclusivity(
    value: unknown,
    branches: unknown[],
    canonPath: JsonPointer,
    chosenIndex: number,
    chosenBranchPath: JsonPointer,
    reselectionsRemaining = 1
  ): unknown {
    if (branches.length <= 1) return value;
    const passing = this.evaluateOneOfBranches(canonPath, branches, value);
    if (!passing.includes(chosenIndex)) {
      if (reselectionsRemaining <= 0) return value;
      return this.reselectOneOfBranch(
        value,
        branches,
        canonPath,
        chosenIndex,
        reselectionsRemaining - 1
      );
    }
    if (passing.length <= 1) return value;

    if (typeof value === 'string') {
      const tweaked = this.tryStringExclusivity(
        value,
        canonPath,
        branches,
        chosenIndex,
        chosenBranchPath,
        passing
      );
      if (tweaked !== undefined) {
        return tweaked;
      }
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const tweaked = this.tryNumericExclusivity(
        value,
        canonPath,
        branches,
        chosenIndex,
        chosenBranchPath,
        passing
      );
      if (tweaked !== undefined) {
        return tweaked;
      }
    }

    if (Array.isArray(value) || isRecord(value)) {
      const modified = this.tryCompositeExclusivity(
        value,
        canonPath,
        branches,
        chosenIndex,
        passing
      );
      if (modified) {
        return value;
      }
    }

    const finalPassing = this.evaluateOneOfBranches(canonPath, branches, value);
    if (reselectionsRemaining > 0 && finalPassing.length > 1) {
      return this.reselectOneOfBranch(
        value,
        branches,
        canonPath,
        chosenIndex,
        reselectionsRemaining - 1
      );
    }

    return value;
  }

  private reselectOneOfBranch(
    value: unknown,
    branches: unknown[],
    canonPath: JsonPointer,
    currentChosen: number,
    reselectionsRemaining: number
  ): unknown {
    const passing = this.evaluateOneOfBranches(canonPath, branches, value);
    if (passing.length === 0) {
      return value;
    }
    const exclusivityRand = this.drawExclusivityRand(canonPath);
    this.pendingExclusivityRand.set(canonPath, exclusivityRand);
    this.recordNodeExclusivityRand(canonPath, exclusivityRand);
    const candidates =
      passing.length > 1
        ? passing.filter((idx) => idx !== currentChosen)
        : passing.slice();
    const pool = candidates.length > 0 ? candidates : passing;
    const pickOffset = Math.min(
      pool.length - 1,
      Math.floor(exclusivityRand * pool.length)
    );
    const pick = pool[pickOffset] ?? pool[0]!;
    const fallbackPath = this.buildOneOfBranchPointer(canonPath, pick);
    const updated = this.enforceOneOfExclusivity(
      value,
      branches,
      canonPath,
      pick,
      fallbackPath,
      reselectionsRemaining
    );
    this.pendingExclusivityRand.delete(canonPath);
    return updated;
  }

  private evaluateOneOfBranches(
    canonPath: JsonPointer,
    branches: unknown[],
    data: unknown
  ): number[] {
    const passing: number[] = [];
    for (let idx = 0; idx < branches.length; idx += 1) {
      const branch = branches[idx];
      const branchPtr = isRecord(branch)
        ? (getPointerFromIndex(this.pointerIndex, branch) ??
          this.buildOneOfBranchPointer(canonPath, idx))
        : this.buildOneOfBranchPointer(canonPath, idx);
      if (this.validateAgainstOriginalAt(branchPtr, data)) {
        passing.push(idx);
      }
    }
    return passing;
  }

  private tryStringExclusivity(
    initial: string,
    canonPath: JsonPointer,
    branches: unknown[],
    chosenIndex: number,
    chosenBranchPath: JsonPointer,
    initialPassing: number[]
  ): string | undefined {
    let value = initial;
    let passing = initialPassing.slice();

    while (true) {
      const conflicts = passing
        .filter((idx) => idx !== chosenIndex)
        .sort((a, b) => a - b);
      if (conflicts.length === 0) break;

      let updated = false;
      for (const conflict of conflicts) {
        for (const char of this.stringTweakOrder) {
          const candidate = `${value}${char}`;
          if (!this.validateAgainstOriginalAt(chosenBranchPath, candidate)) {
            continue;
          }
          const candidatePassing = this.evaluateOneOfBranches(
            canonPath,
            branches,
            candidate
          );
          if (!candidatePassing.includes(chosenIndex)) {
            continue;
          }
          if (candidatePassing.includes(conflict)) {
            continue;
          }
          this.recordExclusivityStringTweak(canonPath, char);
          value = candidate;
          passing = candidatePassing;
          updated = true;
          break;
        }
        if (updated) break;
      }

      if (!updated) {
        break;
      }
    }

    return value !== initial ? value : undefined;
  }

  private tryNumericExclusivity(
    initial: number,
    canonPath: JsonPointer,
    branches: unknown[],
    chosenIndex: number,
    chosenBranchPath: JsonPointer,
    initialPassing: number[]
  ): number | undefined {
    const branchSchema = isRecord(branches[chosenIndex])
      ? (branches[chosenIndex] as Record<string, unknown>)
      : undefined;
    const step = this.resolveNumericTweakStep(initial, branchSchema);
    if (step === 0) return undefined;
    const deltas: number[] = [step, -step];
    let value = initial;
    let passing = initialPassing.slice();
    const visitedValues = new Set<string>();
    const maxIterations = 64;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations += 1;
      const stateKey = Number.isFinite(value)
        ? value.toPrecision(15)
        : String(value);
      if (visitedValues.has(stateKey)) break;
      visitedValues.add(stateKey);

      const conflicts = passing
        .filter((idx) => idx !== chosenIndex)
        .sort((a, b) => a - b);
      if (conflicts.length === 0) break;

      let updated = false;
      for (const conflict of conflicts) {
        for (const delta of deltas) {
          const candidate = value + delta;
          if (!Number.isFinite(candidate)) {
            continue;
          }
          if (!this.validateAgainstOriginalAt(chosenBranchPath, candidate)) {
            continue;
          }
          const candidatePassing = this.evaluateOneOfBranches(
            canonPath,
            branches,
            candidate
          );
          if (!candidatePassing.includes(chosenIndex)) {
            continue;
          }
          if (candidatePassing.includes(conflict)) {
            continue;
          }
          value = candidate;
          passing = candidatePassing;
          updated = true;
          break;
        }
        if (updated) break;
      }
      if (!updated) {
        break;
      }
    }

    return value !== initial ? value : undefined;
  }

  private tryCompositeExclusivity(
    root: Record<string, unknown> | unknown[],
    canonPath: JsonPointer,
    branches: unknown[],
    chosenIndex: number,
    initialPassing: number[]
  ): boolean {
    const branchSchema = isRecord(branches[chosenIndex])
      ? (branches[chosenIndex] as Record<string, unknown>)
      : undefined;
    const targets = this.collectInstanceTweakTargets(root, branchSchema);
    if (targets.length === 0) return false;
    targets.sort((a, b) => a.pointer.localeCompare(b.pointer));
    let passing = initialPassing.slice();
    let modified = false;
    const visitedStates = new Set<string>();
    const maxIterations = 128;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations += 1;
      const snapshot = this.snapshotCompositeState(root);
      if (snapshot) {
        if (visitedStates.has(snapshot)) break;
        visitedStates.add(snapshot);
      }

      const conflicts = passing
        .filter((idx) => idx !== chosenIndex)
        .sort((a, b) => a - b);
      if (conflicts.length === 0) break;

      let updated = false;
      for (const conflict of conflicts) {
        for (const target of targets) {
          if (target.kind === 'string') {
            const candidatePassing = this.applyStringTweakToTarget(
              root,
              target,
              canonPath,
              branches,
              chosenIndex,
              conflict
            );
            if (candidatePassing) {
              passing = candidatePassing;
              modified = true;
              updated = true;
              break;
            }
          } else {
            const candidatePassing = this.applyNumericTweakToTarget(
              root,
              target,
              canonPath,
              branches,
              chosenIndex,
              conflict
            );
            if (candidatePassing) {
              passing = candidatePassing;
              modified = true;
              updated = true;
              break;
            }
          }
        }
        if (updated) break;
      }

      if (!updated) {
        break;
      }
    }

    return modified;
  }

  private applyStringTweakToTarget(
    root: Record<string, unknown> | unknown[],
    target: InstanceTweakTarget,
    canonPath: JsonPointer,
    branches: unknown[],
    chosenIndex: number,
    conflictIndex: number
  ): number[] | undefined {
    if (target.kind !== 'string') return undefined;
    const original = target.get() as string;
    for (const char of this.stringTweakOrder) {
      const candidate = `${original}${char}`;
      target.set(candidate);
      const candidatePassing = this.evaluateOneOfBranches(
        canonPath,
        branches,
        root
      );
      if (!candidatePassing.includes(chosenIndex)) {
        target.set(original);
        continue;
      }
      if (candidatePassing.includes(conflictIndex)) {
        target.set(original);
        continue;
      }
      this.recordExclusivityStringTweak(canonPath, char);
      return candidatePassing;
    }
    target.set(original);
    return undefined;
  }

  private applyNumericTweakToTarget(
    root: Record<string, unknown> | unknown[],
    target: InstanceTweakTarget,
    canonPath: JsonPointer,
    branches: unknown[],
    chosenIndex: number,
    conflictIndex: number
  ): number[] | undefined {
    if (target.kind !== 'number') return undefined;
    const original = target.get() as number;
    const step = this.resolveNumericTweakStep(original, target.schema);
    if (step === 0) return undefined;
    const deltas: number[] = [step, -step];
    for (const delta of deltas) {
      const candidate = original + delta;
      if (!Number.isFinite(candidate)) continue;
      target.set(candidate);
      const candidatePassing = this.evaluateOneOfBranches(
        canonPath,
        branches,
        root
      );
      if (!candidatePassing.includes(chosenIndex)) {
        target.set(original);
        continue;
      }
      if (candidatePassing.includes(conflictIndex)) {
        target.set(original);
        continue;
      }
      return candidatePassing;
    }
    target.set(original);
    return undefined;
  }

  private collectInstanceTweakTargets(
    value: unknown,
    schema?: Record<string, unknown>,
    basePointer: JsonPointer = ''
  ): InstanceTweakTarget[] {
    const targets: InstanceTweakTarget[] = [];
    if (Array.isArray(value)) {
      for (let idx = 0; idx < value.length; idx += 1) {
        const entry = value[idx];
        const pointer = appendPointer(basePointer, String(idx));
        const childSchema = this.resolveArrayItemSchema(schema, idx);
        if (typeof entry === 'string') {
          targets.push({
            pointer,
            kind: 'string',
            schema: childSchema,
            get: () => value[idx] as string,
            set: (next) => {
              value[idx] = next;
            },
          });
        } else if (typeof entry === 'number') {
          targets.push({
            pointer,
            kind: 'number',
            integer: Number.isInteger(entry),
            schema: childSchema,
            get: () => value[idx] as number,
            set: (next) => {
              value[idx] = next;
            },
          });
        } else if (isRecord(entry) || Array.isArray(entry)) {
          targets.push(
            ...this.collectInstanceTweakTargets(entry, childSchema, pointer)
          );
        }
      }
      return targets;
    }

    if (!isRecord(value)) {
      return targets;
    }

    const keys = Object.keys(value).sort();
    for (const key of keys) {
      const entry = value[key];
      const pointer = appendPointer(basePointer, key);
      const childSchema = this.resolveObjectPropertySchema(schema, key);
      if (typeof entry === 'string') {
        targets.push({
          pointer,
          kind: 'string',
          schema: childSchema,
          get: () => value[key] as string,
          set: (next) => {
            value[key] = next;
          },
        });
      } else if (typeof entry === 'number') {
        targets.push({
          pointer,
          kind: 'number',
          integer: Number.isInteger(entry),
          schema: childSchema,
          get: () => value[key] as number,
          set: (next) => {
            value[key] = next;
          },
        });
      } else if (isRecord(entry) || Array.isArray(entry)) {
        targets.push(
          ...this.collectInstanceTweakTargets(entry, childSchema, pointer)
        );
      }
    }

    return targets;
  }

  private resolveObjectPropertySchema(
    schema: Record<string, unknown> | undefined,
    key: string
  ): Record<string, unknown> | undefined {
    if (!schema) return undefined;
    const props = isRecord(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : undefined;
    if (props && isRecord(props[key])) {
      return props[key] as Record<string, unknown>;
    }
    const patternProps = isRecord(schema.patternProperties)
      ? (schema.patternProperties as Record<string, unknown>)
      : undefined;
    if (patternProps) {
      for (const [pattern, subschema] of Object.entries(patternProps)) {
        if (!isRecord(subschema)) continue;
        try {
          const regex = new RegExp(pattern);
          if (regex.test(key)) {
            return subschema as Record<string, unknown>;
          }
        } catch {
          continue;
        }
      }
    }
    if (isRecord(schema.additionalProperties)) {
      return schema.additionalProperties as Record<string, unknown>;
    }
    return undefined;
  }

  private resolveArrayItemSchema(
    schema: Record<string, unknown> | undefined,
    index: number
  ): Record<string, unknown> | undefined {
    if (!schema) return undefined;
    const prefixItems = Array.isArray(schema.prefixItems)
      ? (schema.prefixItems as unknown[])
      : undefined;
    if (prefixItems && index < prefixItems.length) {
      const entry = prefixItems[index];
      if (isRecord(entry)) {
        return entry as Record<string, unknown>;
      }
    }
    if (isRecord(schema.items)) {
      return schema.items as Record<string, unknown>;
    }
    return undefined;
  }

  private recordExclusivityStringTweak(
    canonPath: JsonPointer,
    char: '\u0000' | 'a',
    exclusivityRand?: number
  ): void {
    let effectiveRand = exclusivityRand;
    if (effectiveRand === undefined) {
      effectiveRand = this.pendingExclusivityRand.get(canonPath);
      if (effectiveRand !== undefined) {
        this.pendingExclusivityRand.delete(canonPath);
      }
    }
    if (typeof effectiveRand === 'number') {
      this.recordNodeExclusivityRand(canonPath, effectiveRand);
    }
    const composeNode = this.diagNodes?.[canonPath];
    const composeTiebreak = composeNode?.scoreDetails?.tiebreakRand;
    let scoreDetails: GeneratorDiagnostic['scoreDetails'] | undefined;
    if (typeof composeTiebreak === 'number') {
      scoreDetails = { tiebreakRand: composeTiebreak };
    }
    if (typeof effectiveRand === 'number') {
      scoreDetails = scoreDetails
        ? { ...scoreDetails, exclusivityRand: effectiveRand }
        : { exclusivityRand: effectiveRand };
    }
    this.diagnostics.push({
      code: DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING,
      phase: DIAGNOSTIC_PHASES.GENERATE,
      canonPath,
      details: { char },
      ...(scoreDetails ? { scoreDetails } : {}),
    });
  }

  private buildOneOfBranchPointer(
    canonPath: JsonPointer,
    branchIndex: number
  ): JsonPointer {
    return appendPointer(
      appendPointer(canonPath, 'oneOf'),
      String(branchIndex)
    );
  }

  private drawExclusivityRand(canonPath: JsonPointer): number {
    const rng = new XorShift32(this.baseSeed, canonPath);
    return rng.nextFloat01();
  }

  private recordNodeExclusivityRand(
    canonPath: JsonPointer,
    value: number
  ): void {
    if (!this.diagNodes) return;
    const node = (this.diagNodes[canonPath] ??= {} as NodeDiagnostics);
    const details =
      node.scoreDetails ??
      (node.scoreDetails = {
        orderedIndices: [],
        topScoreIndices: [],
        topKIndices: [],
        scoresByIndex: {},
      });
    details.exclusivityRand = value;
  }

  private generateAnyOf(
    schema: Record<string, unknown>,
    canonPath: JsonPointer,
    itemIndex: number
  ): unknown {
    const branches = Array.isArray(schema.anyOf)
      ? (schema.anyOf as unknown[])
      : [];
    if (branches.length === 0) return {};
    const unionPointer = appendPointer(canonPath, 'anyOf');
    const hintedIndex = this.getPreferredBranchIndex(
      unionPointer,
      branches.length
    );
    const chosenFromDiag = this.getChosenBranchIndex(unionPointer);
    const fallbackIndex = 0;
    const index =
      hintedIndex !== undefined && branches[hintedIndex] !== undefined
        ? hintedIndex
        : chosenFromDiag !== undefined && branches[chosenFromDiag] !== undefined
          ? chosenFromDiag
          : fallbackIndex;
    const branchPointer = appendPointer(unionPointer, String(index));
    this.recordBranchSelection(
      'ANYOF_BRANCH',
      branches[index],
      branchPointer,
      index
    );
    return this.generateValue(branches[index]!, branchPointer, itemIndex);
  }

  recordPatternWitnessTrial(): void {
    this.patternWitnessTrials += 1;
    this.metrics?.addPatternWitnessTrial();
  }

  recordPatternCap(
    canonPath: JsonPointer,
    reason: 'witnessDomainExhausted' | 'candidateBudget' | 'regexComplexity',
    tried: number
  ): void {
    this.diagnostics.push({
      code: DIAGNOSTIC_CODES.COMPLEXITY_CAP_PATTERNS,
      phase: DIAGNOSTIC_PHASES.GENERATE,
      canonPath,
      details: {
        reason,
        alphabet: this.normalizedAlphabet.join(''),
        maxLength: this.resolved.patternWitness.maxLength,
        tried,
      },
      budget: {
        tried,
        limit: this.resolved.patternWitness.maxCandidates,
        skipped: true,
        // Align with diagnosticsEnvelope.schema.json: use generic cap reason
        // Specific cap reason is carried in details.reason
        reason: 'complexityCap',
      },
      scoreDetails: {
        tiebreakRand: 0,
      },
    });
  }

  private emitCoverageEvent(event: CoverageEvent): void {
    if (!this.coverage) return;
    const mode = this.coverage.mode;
    if (mode !== 'measure' && mode !== 'guided') return;
    try {
      if (typeof this.coverage.emitForItem === 'function') {
        const index = this.currentItemIndex ?? 0;
        this.coverage.emitForItem(index, event);
      } else {
        this.coverage.emit(event);
      }
    } catch {
      // Coverage hooks must never affect generation behavior.
    }
  }

  private recordSchemaNodeHit(canonPath: JsonPointer): void {
    const coveragePath = canonicalizeCoveragePath(canonPath);
    this.emitCoverageEvent({
      dimension: 'structure',
      kind: 'SCHEMA_NODE',
      canonPath: coveragePath,
    });
  }

  private recordBranchSelection(
    kind: 'ONEOF_BRANCH' | 'ANYOF_BRANCH',
    branchSchema: unknown,
    branchPointer: JsonPointer,
    index: number
  ): void {
    const pointerFromIndex =
      branchSchema && typeof branchSchema === 'object'
        ? getPointerFromIndex(this.pointerIndex, branchSchema)
        : undefined;
    const canonPtr = pointerFromIndex ?? branchPointer;
    const canonPath = canonicalizeCoveragePath(canonPtr);
    this.emitCoverageEvent({
      dimension: 'branches',
      kind,
      canonPath,
      params: { index },
    });
  }

  private recordConditionalPathHit(
    canonPath: JsonPointer,
    pathKind: 'if+then' | 'if+else'
  ): void {
    const coveragePath = canonicalizeCoveragePath(canonPath);
    this.emitCoverageEvent({
      dimension: 'branches',
      kind: 'CONDITIONAL_PATH',
      canonPath: coveragePath,
      params: { pathKind },
    });
  }

  private recordEnumValueHit(
    schema: Record<string, unknown>,
    fallbackPointer: JsonPointer | undefined,
    value: unknown
  ): void {
    const raw = (schema as { enum?: unknown[] }).enum;
    if (!Array.isArray(raw) || raw.length === 0) return;
    const idx = enumIndexOf(raw, value);
    if (idx < 0) return;
    const pointerFromIndex = getPointerFromIndex(this.pointerIndex, schema);
    const canonPtr = pointerFromIndex ?? fallbackPointer ?? '';
    const canonPath = canonicalizeCoveragePath(canonPtr);
    this.emitCoverageEvent({
      dimension: 'enum',
      kind: 'ENUM_VALUE_HIT',
      canonPath,
      params: { enumIndex: idx, value },
    });
  }

  private recordPropertyPresent(
    propertyPointer: JsonPointer,
    propertyName: string
  ): void {
    const canonPath = canonicalizeCoveragePath(propertyPointer);
    this.emitCoverageEvent({
      dimension: 'structure',
      kind: 'PROPERTY_PRESENT',
      canonPath,
      params: { propertyName },
    });
  }
}

function extractPreferredExample(
  schema: Record<string, unknown>
): unknown | undefined {
  if (Object.prototype.hasOwnProperty.call(schema, 'example')) {
    return (schema as { example?: unknown }).example;
  }
  const exs = (schema as { examples?: unknown }).examples;
  if (Array.isArray(exs) && exs.length > 0) {
    return exs[0];
  }
  return undefined;
}

class PatternEnumerator {
  private readonly regex: RegExp | null;

  private readonly config: ResolvedOptions['patternWitness'];

  private readonly alphabet: string[];

  private readonly recordCap: (
    reason: 'witnessDomainExhausted' | 'candidateBudget' | 'regexComplexity',
    tried: number
  ) => void;

  private readonly recordTrial: () => void;

  private currentLength = 0;

  private indices: number[] | null = null;

  private tried = 0;

  private exhausted = false;

  private capped = false;

  constructor(
    patternSource: string,
    config: ResolvedOptions['patternWitness'],
    alphabet: string[],
    hooks: {
      recordCap: (
        reason:
          | 'witnessDomainExhausted'
          | 'candidateBudget'
          | 'regexComplexity',
        tried: number
      ) => void;
      recordTrial: () => void;
    }
  ) {
    this.config = config;
    this.alphabet = alphabet;
    this.recordCap = hooks.recordCap;
    this.recordTrial = hooks.recordTrial;

    if (!isAnchoredPattern(patternSource)) {
      this.regex = null;
      this.exhausted = true;
      return;
    }

    try {
      this.regex = new RegExp(patternSource, 'u');
    } catch {
      this.regex = null;
      this.exhausted = true;
      return;
    }

    if (this.alphabet.length === 0) {
      this.exhausted = true;
      this.capped = true;
      this.recordCap('witnessDomainExhausted', 0);
    }
  }

  next(predicate: (candidate: string) => boolean): string | undefined {
    if (!this.regex || this.exhausted) {
      return undefined;
    }

    while (!this.exhausted) {
      const candidate = this.produceCandidate();
      if (candidate === undefined) break;

      this.tried += 1;
      this.recordTrial();

      if (this.tried > this.config.maxCandidates) {
        if (!this.capped) {
          this.capped = true;
          this.recordCap('candidateBudget', this.tried - 1);
        }
        this.exhausted = true;
        return undefined;
      }

      if (!predicate(candidate)) {
        continue;
      }
      if (this.regex.test(candidate)) {
        return candidate;
      }
    }

    if (!this.capped) {
      this.capped = true;
      this.recordCap('witnessDomainExhausted', this.tried);
    }
    return undefined;
  }

  private produceCandidate(): string | undefined {
    if (this.currentLength === 0) {
      this.currentLength = 1;
      this.indices = [0];
      return '';
    }

    if (!this.indices) {
      this.indices = new Array(this.currentLength).fill(0);
    }

    const candidate = this.indices
      .map((index) => this.alphabet[index] ?? '')
      .join('');

    if (codePointLength(candidate) !== this.currentLength) {
      this.exhausted = true;
      return undefined;
    }

    this.advance();
    return candidate;
  }

  private advance(): void {
    if (!this.indices) return;
    const arr = this.indices!;
    for (let idx = arr.length - 1; idx >= 0; idx -= 1) {
      const currentIndex = arr[idx] ?? 0;
      const nextIndex = currentIndex + 1;
      if (nextIndex < this.alphabet.length) {
        arr[idx] = nextIndex;
        this.indices = arr;
        return;
      }
      arr[idx] = 0;
    }
    this.currentLength += 1;
    if (this.currentLength > this.config.maxLength) {
      this.exhausted = true;
      return;
    }
    this.indices = new Array(this.currentLength).fill(0);
  }
}

function normalizeFragmentRef(ref: string): JsonPointer | undefined {
  if (typeof ref !== 'string' || !ref.startsWith('#')) {
    return undefined;
  }
  if (ref === '#') {
    return '';
  }
  const fragment = ref.slice(1);
  if (fragment === '') {
    return '';
  }
  if (!fragment.startsWith('/')) {
    return undefined;
  }
  return fragment;
}

function resolvePointerInSchema(root: unknown, pointer: JsonPointer): unknown {
  if (pointer === '') {
    return root;
  }
  if (!pointer.startsWith('/')) {
    return undefined;
  }
  const tokens = pointer.slice(1).split('/').map(unescapePointerToken);
  let node: unknown = root;
  for (const token of tokens) {
    if (Array.isArray(node)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= node.length) {
        return undefined;
      }
      node = node[index];
      continue;
    }
    if (
      node !== null &&
      typeof node === 'object' &&
      Object.prototype.hasOwnProperty.call(
        node as Record<string, unknown>,
        token
      )
    ) {
      node = (node as Record<string, unknown>)[token];
      continue;
    }
    return undefined;
  }
  return node;
}

const REF_METADATA_KEYS = new Set([
  '$id',
  '$schema',
  '$anchor',
  '$dynamicAnchor',
  '$comment',
  '$defs',
  'definitions',
  'description',
  'title',
  'default',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
  'format',
  'contentEncoding',
  'contentMediaType',
]);

function hasRefSiblings(schema: Record<string, unknown>): boolean {
  for (const key of Object.keys(schema)) {
    if (key === '$ref' || key === '$dynamicRef') {
      continue;
    }
    if (!REF_METADATA_KEYS.has(key)) {
      return true;
    }
  }
  return false;
}

function determineType(schema: Record<string, unknown>): string | undefined {
  if (typeof schema.type === 'string') return schema.type;
  if (Array.isArray(schema.type)) {
    const candidates = schema.type.filter(
      (value): value is string => typeof value === 'string'
    );
    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const rankDiff = typeRank(a) - typeRank(b);
        if (rankDiff !== 0) {
          return rankDiff;
        }
        return a < b ? -1 : a > b ? 1 : 0;
      });
      return candidates[0];
    }
  }
  if (schema.properties || schema.patternProperties) return 'object';
  if (schema.items || schema.prefixItems) return 'array';
  return undefined;
}

const TYPE_ORDER: Record<string, number> = {
  null: 0,
  boolean: 1,
  integer: 2,
  number: 3,
  string: 4,
  array: 5,
  object: 6,
};

function typeRank(value: string): number {
  const rank = TYPE_ORDER[value];
  return rank !== undefined ? rank : 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function truncateToCodePoints(value: string, max: number): string {
  if (max <= 0) return '';
  const arr = Array.from(value);
  if (arr.length <= max) return value;
  return arr.slice(0, max).join('');
}

function repeatCodePoint(char: string, count: number): string {
  if (count <= 0) return '';
  return Array(count).fill(char).join('');
}

function ensureMinCodePoints(
  value: string,
  min: number,
  padChar: string
): string {
  const current = codePointLength(value);
  if (current >= min) return value;
  const normalizedPad =
    padChar && padChar.length > 0 ? (Array.from(padChar)[0] ?? 'a') : 'a';
  const deficit = min - current;
  return value + repeatCodePoint(normalizedPad, deficit);
}

function normalizeAlphabet(input: string): string[] {
  const source = typeof input === 'string' ? input : '';
  if (source.length === 0) return [];
  const codePoints = new Set<number>();
  for (const chunk of Array.from(source)) {
    const codePoint = chunk.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      continue;
    }
    codePoints.add(codePoint);
  }
  if (codePoints.size === 0) {
    return [];
  }
  return Array.from(codePoints)
    .sort((a, b) => a - b)
    .map((codePoint) => String.fromCodePoint(codePoint));
}

function alignToMultiple(value: number, multiple: number): number {
  if (multiple === 0) return value;
  const remainder = value % multiple;
  if (remainder === 0) return value;
  return value + (multiple - remainder);
}

function enforceUniqueItems(items: unknown[]): void {
  const seen = new Set<string>();
  const deduped: unknown[] = [];
  for (let idx = 0; idx < items.length; idx += 1) {
    const h = structuralHash(items[idx]);
    const key = h?.digest ?? JSON.stringify(items[idx]);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(items[idx]);
  }
  // mutate in place
  items.length = 0;
  deduped.forEach((v) => items.push(v));
}

function isUniqueAppend(items: unknown[], candidate: unknown): boolean {
  const h = structuralHash(candidate);
  const key = h?.digest ?? JSON.stringify(candidate);
  const seen = new Set<string>();
  for (const it of items) {
    const hx = structuralHash(it);
    const kx = hx?.digest ?? JSON.stringify(it);
    seen.add(kx);
  }
  return !seen.has(key);
}

function mergeAllOfBranches(branches: unknown[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const branch of branches) {
    if (!isRecord(branch)) continue;
    mergeNumericConstraints(merged, branch);
    if (branch.type !== undefined && merged.type === undefined) {
      merged.type = branch.type;
    }
    if (isRecord(branch.properties)) {
      merged.properties = {
        ...(merged.properties as Record<string, unknown> | undefined),
        ...(branch.properties as Record<string, unknown>),
      };
    }
    for (const [key, value] of Object.entries(branch)) {
      if (NUMERIC_KEYWORDS.has(key) || key === 'properties') continue;
      if (!(key in merged)) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function computeContainsBaseline(
  needs: ContainsNeed[],
  initialLength: number,
  maxLength?: number
): number {
  let length = initialLength;
  let maxContribution = length;
  if (!needs || needs.length === 0) {
    return maxContribution;
  }
  for (let index = 0; index < needs.length; index += 1) {
    const need = needs[index];
    if (!need) continue;
    const min = Math.max(1, Math.floor(need.min ?? 1));
    for (let count = 0; count < min; count += 1) {
      if (maxLength !== undefined && length >= maxLength) {
        break;
      }
      length += 1;
    }
    if (length > maxContribution) {
      maxContribution = length;
    }
    if (maxLength !== undefined && length >= maxLength) {
      break;
    }
  }
  return maxContribution;
}

function analyzePatternForWitness(source: string): {
  anchoredStart: boolean;
  anchoredEnd: boolean;
  hasLookAround: boolean;
  hasBackReference: boolean;
  complexityCapped: boolean;
} {
  return scanRegexSourceForWitness(source);
}

function scanRegexSourceForWitness(source: string): {
  anchoredStart: boolean;
  anchoredEnd: boolean;
  hasLookAround: boolean;
  hasBackReference: boolean;
  complexityCapped: boolean;
} {
  if (source.length > 4096) {
    return {
      anchoredStart: source.startsWith('^'),
      anchoredEnd: source.endsWith('$'),
      hasLookAround: false,
      hasBackReference: false,
      complexityCapped: true,
    };
  }

  let anchoredStart = false;
  let anchoredEnd = false;
  let hasLookAround = false;
  let hasBackReference = false;
  let complexityCapped = false;

  const stack: number[] = [];
  let inClass = false;
  let escapeCount = 0;

  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    const unescaped = escapeCount % 2 === 0;

    if (unescaped && !inClass && index === 0 && ch === '^') {
      anchoredStart = true;
    }
    if (unescaped && !inClass && index === source.length - 1 && ch === '$') {
      anchoredEnd = true;
    }

    if (unescaped && !inClass && ch === '[') {
      inClass = true;
    } else if (unescaped && inClass && ch === ']') {
      inClass = false;
    }

    if (unescaped && !inClass && ch === '(') {
      const lookAhead2 = source.slice(index + 1, index + 3);
      const lookAhead4 = source.slice(index + 1, index + 5);
      if (
        lookAhead2 === '?=' ||
        lookAhead2 === '?!' ||
        lookAhead4 === '?<=' ||
        lookAhead4 === '?<!'
      ) {
        hasLookAround = true;
      }
      stack.push(index);
    } else if (unescaped && !inClass && ch === ')') {
      if (stack.length > 0) {
        stack.pop();
        if (!complexityCapped) {
          const nextIndex = index + 1;
          if (nextIndex < source.length) {
            const nextChar = source.charAt(nextIndex);
            if (nextChar === '*' || nextChar === '+' || nextChar === '?') {
              complexityCapped = true;
            } else if (nextChar === '{') {
              let cursor = nextIndex + 1;
              while (cursor < source.length) {
                const charAtCursor = source.charAt(cursor);
                if (!/[0-9,]/.test(charAtCursor)) {
                  break;
                }
                cursor += 1;
              }
              if (
                cursor > nextIndex + 1 &&
                cursor < source.length &&
                source.charAt(cursor) === '}'
              ) {
                complexityCapped = true;
              }
            }
          }
        }
      }
    }

    if (unescaped && !inClass && ch === '\\') {
      const nextChar = source[index + 1];
      if (nextChar !== undefined) {
        if (/[1-9]/.test(nextChar)) {
          hasBackReference = true;
        } else if (nextChar === 'k' && source[index + 2] === '<') {
          hasBackReference = true;
        }
      }
    }

    if (ch === '\\') {
      escapeCount += 1;
    } else {
      escapeCount = 0;
    }
  }

  return {
    anchoredStart,
    anchoredEnd,
    hasLookAround,
    hasBackReference,
    complexityCapped,
  };
}

function extractNegativeLookaheadPrefixes(
  source: string
): string[] | undefined {
  // Heuristic extraction for leading negative lookaheads such as
  // ^(?!CloudFormation)[A-Za-z0-9]{1,64}$ or (?!CloudFormation)^[A-Za-z0-9]+$.
  const patterns: RegExp[] = [/^\^\(\?!(.*?)\)/u, /^\(\?!(.*?)\)\^/u];
  for (const re of patterns) {
    const match = source.match(re);
    if (!match) continue;
    const prefix = match[1] ?? '';
    if (!prefix) continue;
    // Ignore complex prefixes with obvious meta-characters to keep
    // diagnostics conservative.
    if (/[()[\]|?*+{}\\]/u.test(prefix)) {
      continue;
    }
    return [prefix];
  }
  return undefined;
}

const NUMERIC_KEYWORDS = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
]);

function mergeNumericConstraints(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  if (typeof source.minimum === 'number') {
    const current = target['minimum'] as number | undefined;
    target['minimum'] =
      typeof current === 'number'
        ? Math.max(current, source.minimum)
        : source.minimum;
  }
  if (typeof source.maximum === 'number') {
    const current = target['maximum'] as number | undefined;
    target['maximum'] =
      typeof current === 'number'
        ? Math.min(current, source.maximum)
        : source.maximum;
  }
  if (typeof source.exclusiveMinimum === 'number') {
    const current = target['exclusiveMinimum'] as number | undefined;
    target['exclusiveMinimum'] =
      typeof current === 'number'
        ? Math.max(current, source.exclusiveMinimum)
        : source.exclusiveMinimum;
  }
  if (typeof source.exclusiveMaximum === 'number') {
    const current = target['exclusiveMaximum'] as number | undefined;
    target['exclusiveMaximum'] =
      typeof current === 'number'
        ? Math.min(current, source.exclusiveMaximum)
        : source.exclusiveMaximum;
  }
  if (typeof source.multipleOf === 'number') {
    const current = target['multipleOf'] as number | undefined;
    target['multipleOf'] =
      typeof current === 'number'
        ? lcmForRationals(current, source.multipleOf)
        : source.multipleOf;
  }
}

function lcmForRationals(a: number, b: number): number {
  const scaleA = decimalScale(a);
  const scaleB = decimalScale(b);
  const scale = lcmInteger(scaleA, scaleB);
  const scaledA = Math.round(a * scale);
  const scaledB = Math.round(b * scale);
  const lcmScaled = lcmInteger(Math.abs(scaledA), Math.abs(scaledB));
  return lcmScaled / scale;
}

function decimalScale(value: number): number {
  const text = value.toString();
  if (!text.includes('.')) return 1;
  const decimals = text.split('.')[1]?.length ?? 0;
  return 10 ** decimals;
}

function lcmInteger(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs((a * b) / gcdInteger(a, b));
}

function gcdInteger(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
}

function escapeJsonPointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

function appendPointer(base: string, segment: string): string {
  if (segment === '') return base;
  const encoded = escapeJsonPointerToken(segment);
  if (base === '') {
    return `/${encoded}`;
  }
  return `${base}/${encoded}`;
}

function canonicalizeCoveragePath(pointer: JsonPointer): string {
  if (!pointer) return '#';
  if (pointer.startsWith('#')) return pointer;
  if (pointer.startsWith('/')) return `#${pointer}`;
  return `#/${pointer}`;
}

function enumIndexOf(values: unknown[], needle: unknown): number {
  for (let index = 0; index < values.length; index += 1) {
    if (Object.is(values[index], needle)) {
      return index;
    }
  }
  return -1;
}

function buildPointerIndex(schema: unknown): WeakMap<object, JsonPointer> {
  const index = new WeakMap<object, JsonPointer>();
  const visit = (node: unknown, path: JsonPointer): void => {
    if (!node || typeof node !== 'object') return;
    index.set(node as object, path);
    if (Array.isArray(node)) {
      node.forEach((value, idx) => {
        visit(value, appendPointer(path, String(idx)));
      });
      return;
    }
    for (const [key, value] of Object.entries(
      node as Record<string, unknown>
    )) {
      visit(value, appendPointer(path, key));
    }
  };
  visit(schema, '');
  return index;
}

function getPointerFromIndex(
  index: WeakMap<object, JsonPointer>,
  value: unknown
): JsonPointer | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return index.get(value as object);
}

function isAnchoredPattern(pattern: string): boolean {
  return pattern.startsWith('^') && pattern.endsWith('$');
}

function unescapePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}
