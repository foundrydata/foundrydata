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
  NodeDiagnostics,
} from '../transform/composition-engine.js';
import type { ContainsNeed } from '../transform/composition-engine.js';
import type { MetricsCollector } from '../util/metrics.js';
import {
  resolveOptions,
  type PlanOptions,
  type ResolvedOptions,
} from '../types/options.js';
import type { Schema } from '../types/schema.js';
import { FormatRegistry } from '../registry/format-registry.js';
import { registerBuiltInFormats } from './formats/index.js';
import { structuralHash } from '../util/struct-hash.js';
import { XorShift32 } from '../util/rng.js';
import { createSourceAjv, type JsonSchemaDialect } from '../util/ajv-source.js';
import type Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';

type JsonPointer = string;

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
    tiebreakRand: number;
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

export interface FoundryGeneratorOptions {
  count?: number;
  seed?: number;
  planOptions?: Partial<PlanOptions>;
  metrics?: MetricsCollector;
  /** Original source schema (for E-Trace anyOf dynamic validation) */
  sourceSchema?: unknown;
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

  private readonly diagNodes: Record<string, NodeDiagnostics> | undefined;

  private readonly baseSeed: number;
  private readonly formatRegistry: FormatRegistry;

  private readonly ptrMap: ComposeResult['canonical']['ptrMap'];
  private readonly sourceSchema?: unknown;
  private sourceAjvCache?: Ajv;
  private branchValidatorCache: Map<string, ValidateFunction> = new Map();

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
    this.rootSchema = effective.canonical.schema;
    this.formatRegistry = new FormatRegistry();
    registerBuiltInFormats(this.formatRegistry);
    this.ptrMap = effective.canonical.ptrMap;
    this.sourceSchema = options.sourceSchema;
  }

  private readonly rootSchema: Schema | unknown;

  run(): GeneratorStageOutput {
    const count = Math.max(1, Math.floor(this.options.count ?? 1));
    const items: unknown[] = [];
    for (let index = 0; index < count; index += 1) {
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
    const obj = schema as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(obj, 'const')) {
      return obj.const;
    }
    if (Array.isArray(obj.enum) && obj.enum.length > 0) {
      return obj.enum[0];
    }

    const type = determineType(obj);
    switch (type) {
      case 'object':
        return this.generateObject(obj, canonPath, itemIndex);
      case 'array':
        return this.generateArray(obj, canonPath, itemIndex);
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
          return this.generateAllOf(obj, canonPath, itemIndex);
        }
        if (Array.isArray(obj.oneOf)) {
          return this.generateOneOf(obj, canonPath, itemIndex);
        }
        if (Array.isArray(obj.anyOf)) {
          return this.generateAnyOf(obj, canonPath, itemIndex);
        }
        return {};
    }
  }

  private generateObject(
    schema: Record<string, unknown>,
    canonPath: JsonPointer,
    itemIndex: number
  ): Record<string, unknown> {
    const required = new Set(
      Array.isArray(schema.required)
        ? (schema.required as string[]).filter((v) => typeof v === 'string')
        : []
    );
    const properties = isRecord(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
    const patternProperties = isRecord(schema.patternProperties)
      ? (schema.patternProperties as Record<string, unknown>)
      : {};
    const additionalProperties = schema.additionalProperties;

    const coverage = this.coverageIndex.get(canonPath);
    const result: Record<string, unknown> = {};
    const usedNames = new Set<string>();

    const requiredNames = Array.from(required.values()).sort();
    for (const name of requiredNames) {
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
    }

    this.applyDependentRequired(
      schema,
      result,
      canonPath,
      itemIndex,
      usedNames
    );

    const minProperties =
      typeof schema.minProperties === 'number'
        ? Math.max(0, Math.floor(schema.minProperties))
        : 0;

    const eTraceGuard = schema.unevaluatedProperties === false;

    // Add optional properties from explicit definitions first
    if (usedNames.size < minProperties) {
      const candidates = Object.keys(properties)
        .filter((name) => !usedNames.has(name))
        .sort();
      for (const name of candidates) {
        if (usedNames.size >= minProperties) break;
        if (coverage && !coverage.has(name)) continue;
        if (eTraceGuard && !this.isEvaluatedAt(schema, canonPath, result, name))
          continue;
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
      }
    }

    if (usedNames.size < minProperties) {
      const patternIterator = this.createPatternIterators(
        patternProperties,
        canonPath
      );
      while (usedNames.size < minProperties && patternIterator.length > 0) {
        let satisfied = false;
        for (const iterator of patternIterator) {
          const candidate = iterator.next((value) => {
            if (usedNames.has(value)) return false;
            if (coverage && !coverage.has(value)) return false;
            if (
              eTraceGuard &&
              !this.isEvaluatedAt(schema, canonPath, result, value)
            )
              return false;
            return true;
          });
          if (!candidate) continue;
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
          satisfied = true;
          break;
        }
        if (!satisfied) break;
      }
    }

    return result;
  }

  private isEvaluatedAt(
    objectSchema: Record<string, unknown>,
    canonPath: JsonPointer,
    currentObject: Record<string, unknown>,
    name: string
  ): boolean {
    const properties = isRecord(objectSchema.properties)
      ? (objectSchema.properties as Record<string, unknown>)
      : {};
    if (Object.prototype.hasOwnProperty.call(properties, name)) return true;

    const patternProperties = isRecord(objectSchema.patternProperties)
      ? (objectSchema.patternProperties as Record<string, unknown>)
      : {};
    for (const pattern of Object.keys(patternProperties)) {
      if (typeof pattern !== 'string') continue;
      try {
        const regex = new RegExp(pattern, 'u');
        if (regex.test(name)) return true;
      } catch {
        // ignore invalid pattern for E-Trace evidence
      }
    }

    // additionalProperties evaluates when it is not false
    if (objectSchema.additionalProperties !== false) return true;

    // anyOf dynamic: include branches that validate currentObject via Source AJV
    if (Array.isArray(objectSchema.anyOf) && objectSchema.anyOf.length > 0) {
      const branches = objectSchema.anyOf as unknown[];
      for (let idx = 0; idx < branches.length; idx += 1) {
        const branchCanonPtr = appendPointer(canonPath, `anyOf/${idx}`);
        const valid = this.validateAgainstOriginalAt(
          branchCanonPtr,
          currentObject
        );
        if (!valid) continue;
        const branch = branches[idx];
        if (!isRecord(branch)) continue;
        const bProps = isRecord(branch.properties)
          ? (branch.properties as Record<string, unknown>)
          : {};
        if (Object.prototype.hasOwnProperty.call(bProps, name)) return true;
        const bPatterns = isRecord(branch.patternProperties)
          ? (branch.patternProperties as Record<string, unknown>)
          : {};
        for (const pattern of Object.keys(bPatterns)) {
          if (typeof pattern !== 'string') continue;
          try {
            const regex = new RegExp(pattern, 'u');
            if (regex.test(name)) return true;
          } catch {
            // ignore invalid pattern
          }
        }
        if (branch.additionalProperties !== false) return true;
      }
    }

    return false;
  }

  private validateAgainstOriginalAt(
    canonPtr: JsonPointer,
    data: unknown
  ): boolean {
    try {
      const originalPtr = this.ptrMap.get(canonPtr);
      const sub = this.getOriginalSubschema(originalPtr);
      if (!sub) return false;
      const key = originalPtr ?? `#canon:${canonPtr}`;
      let validate: ValidateFunction | undefined =
        this.branchValidatorCache.get(key);
      if (!validate) {
        const ajv = this.getOrCreateSourceAjv();
        validate = ajv.compile(sub as object);
        this.branchValidatorCache.set(key, validate);
      }
      const v = validate!;
      return !!v(data);
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
    const dialect: JsonSchemaDialect = ((): JsonSchemaDialect => {
      const s = this.sourceSchema as Record<string, unknown> | undefined;
      const sch =
        typeof s?.['$schema'] === 'string'
          ? (s!['$schema'] as string).toLowerCase()
          : '';
      if (sch.includes('2020-12')) return '2020-12';
      if (sch.includes('2019-09') || sch.includes('draft-2019'))
        return '2019-09';
      if (sch.includes('draft-07') || sch.includes('draft-06'))
        return 'draft-07';
      if (sch.includes('draft-04') || sch.endsWith('/schema#'))
        return 'draft-04';
      return '2020-12';
    })();
    this.sourceAjvCache = createSourceAjv(
      { dialect, validateFormats: false, discriminator: false },
      this.options.planOptions
    );
    return this.sourceAjvCache;
  }

  private applyDependentRequired(
    schema: Record<string, unknown>,
    target: Record<string, unknown>,
    canonPath: JsonPointer,
    itemIndex: number,
    used: Set<string>
  ): void {
    const dependentRequired = isRecord(schema.dependentRequired)
      ? (schema.dependentRequired as Record<string, unknown>)
      : undefined;
    if (!dependentRequired) return;
    const properties = isRecord(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
    const patternProperties = isRecord(schema.patternProperties)
      ? (schema.patternProperties as Record<string, unknown>)
      : {};
    for (const [name, requirements] of Object.entries(dependentRequired)) {
      if (!Object.prototype.hasOwnProperty.call(target, name)) continue;
      if (!Array.isArray(requirements)) continue;
      for (const dep of requirements) {
        if (typeof dep !== 'string' || used.has(dep)) continue;
        const coverage = this.coverageIndex.get(canonPath);
        if (coverage && !coverage.has(dep)) {
          continue;
        }
        const resolved = this.resolveSchemaForKey(
          dep,
          canonPath,
          properties,
          patternProperties,
          schema.additionalProperties
        );
        const value = this.generateValue(
          resolved.schema,
          resolved.pointer,
          itemIndex
        );
        target[dep] = value;
        used.add(dep);
      }
    }
  }

  private createPatternIterators(
    patternProperties: Record<string, unknown>,
    canonPath: JsonPointer
  ): PatternEnumerator[] {
    const entries = Object.keys(patternProperties)
      .filter((pattern) => typeof pattern === 'string')
      .sort();
    const basePointer = appendPointer(canonPath, 'patternProperties');
    return entries.map((pattern) => {
      const schema = patternProperties[pattern];
      const pointer =
        getPointerFromIndex(this.pointerIndex, schema) ??
        appendPointer(basePointer, pattern);
      return new PatternEnumerator(
        pattern,
        this.resolved.patternWitness,
        this.normalizedAlphabet,
        {
          recordCap: (reason, tried) =>
            this.recordPatternCap(pointer, reason, tried),
          recordTrial: () => this.recordPatternWitnessTrial(),
        }
      );
    });
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
    const containsContributions = this.satisfyContainsNeeds(
      containsNeeds,
      result,
      canonPath,
      itemIndex
    );

    const baseline = Math.max(
      minItems,
      prefixItems.length,
      containsContributions
    );

    while (result.length < baseline) {
      const itemsSchema = schema.items;
      const childCanon = appendPointer(canonPath, 'items');
      const value = this.generateValue(itemsSchema, childCanon, itemIndex);
      result.push(value);
    }

    if (schema.uniqueItems === true) {
      enforceUniqueItems(result);
      // After de-duplication, re-satisfy contains deterministically
      // and then enforce uniqueness again.
      const afterDedup = this.satisfyContainsNeeds(
        this.containsBag.get(canonPath) ?? [],
        result,
        canonPath,
        itemIndex
      );
      void afterDedup;
      enforceUniqueItems(result);
      // Ensure minimal length after uniqueness enforcement
      const finalBaseline = Math.max(minItems, prefixItems.length);
      while (result.length < finalBaseline) {
        const itemsSchema = schema.items;
        const childCanon = appendPointer(canonPath, 'items');
        // try up to a few times to keep uniqueness
        let placed = false;
        for (let tries = 0; tries < 4 && !placed; tries += 1) {
          const candidate = this.generateValue(
            itemsSchema,
            childCanon,
            itemIndex
          );
          if (isUniqueAppend(result, candidate)) {
            result.push(candidate);
            placed = true;
            break;
          }
        }
        if (!placed) {
          // fallback unique filler
          result.push({ __fd_unique_filler: result.length });
        }
      }
    }

    return result;
  }

  private satisfyContainsNeeds(
    needs: ContainsNeed[],
    result: unknown[],
    canonPath: JsonPointer,
    itemIndex: number
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
      const childCanon =
        getPointerFromIndex(this.pointerIndex, need.schema) ??
        appendPointer(baseContains, String(index));
      let satisfied = 0;
      for (let c = 0; c < min; c += 1) {
        const value = this.generateValue(need.schema, childCanon, itemIndex);
        result.push(value);
        satisfied += 1;
      }
      if (satisfied > 0) {
        maxContribution = Math.max(maxContribution, result.length);
      }
    }
    return maxContribution;
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

    // format-aware generation (best-effort)
    if (typeof schema.format === 'string') {
      const res = this.formatRegistry.generate(schema.format);
      if (res.isOk && res.isOk()) {
        let v = res.value;
        // Apply length bounds if present (Unicode length approximation)
        const minLength =
          typeof schema.minLength === 'number'
            ? Math.max(0, Math.floor(schema.minLength))
            : 0;
        const maxLength =
          typeof schema.maxLength === 'number'
            ? Math.max(minLength, Math.floor(schema.maxLength))
            : undefined;
        if (v.length < minLength) {
          const base = v || (this.normalizedAlphabet[0] ?? 'a');
          v = base.repeat(minLength);
        }
        if (maxLength !== undefined && v.length > maxLength) {
          v = v.slice(0, maxLength);
        }
        return v;
      }
    }

    const minLength =
      typeof schema.minLength === 'number'
        ? Math.max(0, Math.floor(schema.minLength))
        : 0;
    const maxLength =
      typeof schema.maxLength === 'number'
        ? Math.max(minLength, Math.floor(schema.maxLength))
        : undefined;
    const baseChar = this.normalizedAlphabet[0] ?? 'a';
    let candidate = baseChar.repeat(minLength);
    if (candidate.length === 0) {
      candidate = '';
    }
    if (maxLength !== undefined && candidate.length > maxLength) {
      candidate = candidate.slice(0, maxLength);
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
      value = Math.max(value, Math.ceil(schema.exclusiveMinimum + 1));
    }
    if (typeof schema.maximum === 'number') {
      value = Math.min(value, Math.floor(schema.maximum));
    }
    if (typeof schema.multipleOf === 'number' && schema.multipleOf !== 0) {
      value = alignToMultiple(value, schema.multipleOf);
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
    let value = 0;
    if (typeof schema.minimum === 'number') {
      value = Math.max(value, schema.minimum);
    }
    if (typeof schema.exclusiveMinimum === 'number') {
      value = Math.max(value, schema.exclusiveMinimum + Number.EPSILON);
    }
    if (typeof schema.maximum === 'number') {
      value = Math.min(value, schema.maximum);
    }
    if (typeof schema.multipleOf === 'number' && schema.multipleOf !== 0) {
      value = alignToMultiple(value, schema.multipleOf);
    }
    return value;
  }

  private generateBoolean(schema: Record<string, unknown>): boolean {
    if (schema.default === false) return false;
    if (schema.const === false) return false;
    return true;
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
    const record = this.diagNodes?.[canonPath];
    const branches = Array.isArray(schema.oneOf)
      ? (schema.oneOf as unknown[])
      : [];
    const selectedIndex =
      typeof record?.chosenBranch?.index === 'number'
        ? record.chosenBranch.index
        : 0;
    const chosen =
      selectedIndex >= 0 && selectedIndex < branches.length ? selectedIndex : 0;
    if (branches.length > 1) {
      const exclusivityRand = this.computeExclusivityRand(canonPath, itemIndex);
      const tiebreakRand = this.computeTiebreakRand(canonPath, itemIndex);
      this.diagnostics.push({
        code: DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING,
        phase: DIAGNOSTIC_PHASES.GENERATE,
        canonPath,
        scoreDetails: { tiebreakRand, exclusivityRand },
      });
    }
    const branchPath = appendPointer(canonPath, `oneOf/${chosen}`);
    return this.generateValue(branches[chosen], branchPath, itemIndex);
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
    const branchPath = appendPointer(canonPath, 'anyOf/0');
    return this.generateValue(branches[0], branchPath, itemIndex);
  }

  recordPatternWitnessTrial(): void {
    this.patternWitnessTrials += 1;
    this.metrics?.addPatternWitnessTrial();
  }

  recordPatternCap(
    canonPath: JsonPointer,
    reason: 'witnessDomainExhausted' | 'candidateBudget',
    tried: number
  ): void {
    this.diagnostics.push({
      code: DIAGNOSTIC_CODES.COMPLEXITY_CAP_PATTERNS,
      phase: DIAGNOSTIC_PHASES.GENERATE,
      canonPath,
      details: {
        reason,
        alphabet: this.resolved.patternWitness.alphabet,
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

  private computeExclusivityRand(
    canonPath: JsonPointer,
    _itemIndex: number
  ): number {
    // SPEC §15 RNG — fresh xorshift32 instance per oneOf location (canonPath), no global state
    const rng = new XorShift32(this.baseSeed, canonPath);
    return rng.nextFloat01();
  }

  private computeTiebreakRand(
    canonPath: JsonPointer,
    _itemIndex: number
  ): number {
    // SPEC §15 RNG — record tiebreakRand always, even when |T|=1
    const rng = new XorShift32(this.baseSeed, `${canonPath}|tb`);
    return rng.nextFloat01();
  }
}

class PatternEnumerator {
  private readonly regex: RegExp | null;

  private readonly config: ResolvedOptions['patternWitness'];

  private readonly alphabet: string[];

  private readonly recordCap: (
    reason: 'witnessDomainExhausted' | 'candidateBudget',
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
        reason: 'witnessDomainExhausted' | 'candidateBudget',
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

    if (candidate.length !== this.currentLength) {
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

function determineType(schema: Record<string, unknown>): string | undefined {
  if (typeof schema.type === 'string') return schema.type;
  if (Array.isArray(schema.type)) {
    return schema.type[0];
  }
  if (schema.properties || schema.patternProperties) return 'object';
  if (schema.items || schema.prefixItems) return 'array';
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAlphabet(input: string): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const char of input ?? '') {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    if (code >= 0xd800 && code <= 0xdfff) {
      continue;
    }
    const normalizedChar = String.fromCodePoint(code);
    if (seen.has(normalizedChar)) continue;
    seen.add(normalizedChar);
    normalized.push(normalizedChar);
  }
  normalized.sort();
  return normalized;
}

function normalizeSeed(seed?: number): number {
  if (!Number.isFinite(seed)) {
    return 123456789;
  }
  return Math.floor(seed as number) >>> 0;
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
