/* eslint-disable max-depth */
/* eslint-disable max-params */
/* eslint-disable max-lines */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import { DIAGNOSTIC_CODES } from '../diag/codes.js';
import type { DiagnosticCode } from '../diag/codes.js';
import { analyzeRegex } from './name-automata/regex.js';
import { extractExactLiteralAlternatives } from '../util/pattern-literals.js';

type CanonNode = CanonObjectNode | CanonArrayNode | CanonValueNode;

type ObjectEntries = Array<CanonObjectEntry>;

type EntrySlot = { key: string; node: CanonNode };

const CONDITIONAL_BLOCKING_KEYWORDS = new Set([
  'unevaluatedProperties',
  'unevaluatedItems',
  'properties',
  'patternProperties',
  'additionalProperties',
  'items',
  'prefixItems',
  'contains',
  'propertyNames',
  'dependentSchemas',
  'dependentRequired',
]);

const DYNAMIC_KEYWORDS = new Set([
  '$dynamicRef',
  '$dynamicAnchor',
  '$recursiveRef',
]);

interface CanonNodeBase {
  origin: string;
}

interface CanonObjectNode extends CanonNodeBase {
  kind: 'object';
  entries: Array<CanonObjectEntry>;
}

interface CanonObjectEntry {
  key: string;
  node: CanonNode;
}

interface CanonArrayNode extends CanonNodeBase {
  kind: 'array';
  items: CanonNode[];
}

interface CanonValueNode extends CanonNodeBase {
  kind: 'value';
  value: unknown;
}

export interface NormalizerNote {
  canonPath: string;
  code: DiagnosticCode;
  details?: unknown;
}

export interface NormalizeResult {
  schema: unknown;
  ptrMap: Map<string, string>;
  revPtrMap: Map<string, string[]>;
  notes: NormalizerNote[];
}

export interface NormalizeOptions {
  rewriteConditionals?: 'never' | 'safe' | 'aggressive';
  guards?: {
    maxGeneratedNotNesting?: number;
  };
}

interface ResolvedNormalizeOptions {
  rewriteConditionals: 'never' | 'safe' | 'aggressive';
  guards: {
    maxGeneratedNotNesting: number;
  };
}

const DEFAULT_OPTIONS: ResolvedNormalizeOptions = {
  rewriteConditionals: 'never',
  guards: {
    maxGeneratedNotNesting: 2,
  },
};

export function normalize(
  schema: unknown,
  options?: NormalizeOptions
): NormalizeResult {
  const normalizer = new SchemaNormalizer(schema, options);
  return normalizer.run();
}

class SchemaNormalizer {
  private readonly options: ResolvedNormalizeOptions;
  private root: CanonNode;
  private notes: NormalizerNote[] = [];
  private readonly idIndex = new Map<
    string,
    { id: string; parentCanonPath: string }
  >();

  constructor(schema: unknown, options?: NormalizeOptions) {
    const guardsOption =
      options?.guards?.maxGeneratedNotNesting ??
      DEFAULT_OPTIONS.guards.maxGeneratedNotNesting;
    if (guardsOption < 0) {
      throw new Error('guards.maxGeneratedNotNesting must be non-negative');
    }
    this.options = {
      rewriteConditionals:
        options?.rewriteConditionals ?? DEFAULT_OPTIONS.rewriteConditionals,
      guards: {
        maxGeneratedNotNesting: guardsOption,
      },
    };
    this.root = this.cloneNode(schema, '');
  }

  run(): NormalizeResult {
    this.applyDraftUnification(this.root, '');
    this.buildIdIndex(this.root, '', '#');
    this.rewriteReferences(this.root, '');
    this.root = this.applyBooleanSimplifications(this.root, '', {
      unevaluatedProps: false,
      unevaluatedItems: false,
    });
    if (this.options.rewriteConditionals !== 'never') {
      this.root = this.applyConditionalRewrites(this.root, '', {
        unevaluatedProps: false,
        unevaluatedItems: false,
      });
    }
    this.root = this.applyDependencyGuards(this.root, '', {
      unevaluatedProps: false,
      unevaluatedItems: false,
    });
    this.root = this.applyPropertyNamesRewrite(this.root, '', {
      unevaluatedProps: false,
      unevaluatedItems: false,
    });
    this.annotateDynamicPresence(this.root, '');
    return this.finalize();
  }

  private finalize(): NormalizeResult {
    const ptrMap = new Map<string, string>();
    const revPtrMap = new Map<string, string[]>();
    const schema = this.materialize(this.root, '', ptrMap, revPtrMap);
    return {
      schema,
      ptrMap,
      revPtrMap,
      notes: this.notes.slice(),
    };
  }

  private addNote(
    canonPath: string,
    code: DiagnosticCode,
    details?: unknown
  ): void {
    this.notes.push({ canonPath, code, details });
  }

  private buildIdIndex(
    node: CanonNode,
    canonPointer: string,
    parentScopeCanonPath: string
  ): void {
    if (node.kind === 'object') {
      let currentScope = parentScopeCanonPath;

      const idEntryIndex = this.findEntryIndex(node, '$id');
      if (idEntryIndex !== -1) {
        const idEntry = node.entries[idEntryIndex];
        const idNode = idEntry?.node;
        if (idNode && idNode.kind === 'value') {
          const rawId = idNode.value;
          if (typeof rawId === 'string' && isAbsoluteUri(rawId)) {
            const canonPath = canonPointer === '' ? '#' : `#${canonPointer}`;
            currentScope = canonPath;
            this.idIndex.set(canonPath, {
              id: rawId,
              parentCanonPath: parentScopeCanonPath,
            });
          }
        }
      }

      for (const entry of node.entries) {
        const childPointer = buildPropertyPointer(canonPointer, entry.key);
        this.buildIdIndex(entry.node, childPointer, currentScope);
      }
      return;
    }

    if (node.kind === 'array') {
      node.items.forEach((item, index) =>
        this.buildIdIndex(
          item,
          buildIndexPointer(canonPointer, index),
          parentScopeCanonPath
        )
      );
    }
  }

  private nearestAbsIdAncestorCanonPath(
    canonPointer: string
  ): string | undefined {
    let current = canonPointer === '' ? '#' : `#${canonPointer}`;
    // Walk upwards including self
    // '#' denotes the document root and is the final fallback.
    while (true) {
      if (this.idIndex.has(current)) {
        return current;
      }
      if (current === '#') {
        break;
      }
      const withoutHash = current.slice(1); // "/a/b/c"
      const idx = withoutHash.lastIndexOf('/');
      if (idx <= 0) {
        current = '#';
      } else {
        current = `#${withoutHash.slice(0, idx)}`;
      }
    }
    return undefined;
  }

  private scopePointerSegments(canonPath: string): string[] {
    if (!canonPath || canonPath === '#') return [];
    const withoutHash = canonPath.startsWith('#')
      ? canonPath.slice(1)
      : canonPath;
    if (!withoutHash) return [];
    return withoutHash
      .split('/')
      .filter((segment) => segment.length > 0)
      .map(unescapeJsonPointerSegment);
  }

  private targetExistsWithinScope(
    scopeRootCanonPath: string,
    fragment: string
  ): boolean {
    if (!fragment.startsWith('#/')) return false;
    const scopedSegments = this.scopePointerSegments(scopeRootCanonPath);
    const targetSegments = fragment
      .slice(1)
      .split('/')
      .slice(1)
      .map(unescapeJsonPointerSegment);
    return (
      resolvePointer(this.root, scopedSegments.concat(targetSegments)) !==
      undefined
    );
  }

  private applyDraftUnification(node: CanonNode, pointer: string): void {
    if (node.kind === 'array') {
      node.items.forEach((item, index) =>
        this.applyDraftUnification(item, buildIndexPointer(pointer, index))
      );
      return;
    }

    if (node.kind !== 'object') return;

    this.unifyDraftKeywords(node, pointer);

    for (const entry of node.entries) {
      this.applyDraftUnification(
        entry.node,
        buildPropertyPointer(pointer, entry.key)
      );
    }
  }

  private rewriteReferences(node: CanonNode, pointer: string): void {
    if (node.kind === 'array') {
      node.items.forEach((item, index) =>
        this.rewriteReferences(item, buildIndexPointer(pointer, index))
      );
      return;
    }

    if (node.kind !== 'object') return;

    const refIndex = this.findEntryIndex(node, '$ref');
    if (refIndex !== -1) {
      const refEntry = node.entries[refIndex];
      if (refEntry && refEntry.node.kind === 'value') {
        const refValue = refEntry.node.value;
        if (
          typeof refValue === 'string' &&
          this.isLocalDefinitionsRef(refValue)
        ) {
          const rewritten = refValue.replace(/^#\/definitions\//, '#/$defs/');
          const scopeRoot = this.nearestAbsIdAncestorCanonPath(pointer) ?? '#';
          if (this.targetExistsWithinScope(scopeRoot, rewritten)) {
            refEntry.node = {
              kind: 'value',
              origin: refEntry.node.origin,
              value: rewritten,
            };
          } else {
            this.addNote(
              buildPropertyPointer(pointer, '$ref'),
              DIAGNOSTIC_CODES.DEFS_TARGET_MISSING,
              { target: rewritten }
            );
          }
        }
      }
    }

    for (const entry of node.entries) {
      this.rewriteReferences(
        entry.node,
        buildPropertyPointer(pointer, entry.key)
      );
    }
  }

  private applyBooleanSimplifications(
    node: CanonNode,
    pointer: string,
    ctx: GuardContext
  ): CanonNode {
    if (node.kind === 'array') {
      const items = node.items.map((item, index) =>
        this.applyBooleanSimplifications(
          item,
          buildIndexPointer(pointer, index),
          ctx
        )
      );
      return createArrayNode(items, node.origin);
    }

    if (node.kind !== 'object') {
      return node;
    }

    const guardFlags = this.gatherGuardFlags(node);
    const mergedCtx = this.mergeGuardContext(ctx, guardFlags);

    const processedEntries: ObjectEntries = [];
    let collapseNode: CanonValueNode | undefined;
    let inlineOneOf: { schema: CanonNode; origin: string } | undefined;

    for (const entry of node.entries) {
      const childPointer = buildPropertyPointer(pointer, entry.key);
      const processedChild = this.applyBooleanSimplifications(
        entry.node,
        childPointer,
        mergedCtx
      );

      let outcome: SimplifyOutcome;
      switch (entry.key) {
        case 'allOf':
          outcome = this.simplifyAllOf(processedChild, childPointer, mergedCtx);
          break;
        case 'anyOf':
          outcome = this.simplifyAnyOf(processedChild, childPointer, mergedCtx);
          break;
        case 'oneOf':
          outcome = this.simplifyOneOf(processedChild, childPointer, mergedCtx);
          break;
        default:
          outcome = { kind: 'replace', node: processedChild };
      }

      if (outcome.kind === 'collapse') {
        collapseNode = outcome.node;
        break;
      } else if (outcome.kind === 'inline') {
        inlineOneOf = {
          schema: outcome.schema,
          origin: outcome.origin,
        };
      } else if (outcome.kind === 'remove') {
        continue;
      } else {
        const nextNode =
          outcome.kind === 'replace' || outcome.kind === 'keep'
            ? outcome.node
            : processedChild;
        processedEntries.push({ key: entry.key, node: nextNode });
      }
    }

    if (collapseNode) {
      return collapseNode;
    }

    // Promote enum with single value to const (canonical view only)
    const enumIndex = processedEntries.findIndex(
      (entry) => entry.key === 'enum' && entry.node.kind === 'array'
    );
    if (
      enumIndex !== -1 &&
      !processedEntries.some((entry) => entry.key === 'const')
    ) {
      const enumSlot = processedEntries[enumIndex];
      if (!enumSlot) {
        return createObjectNode(processedEntries, node.origin);
      }
      const enumCandidate = enumSlot.node;
      if (isArrayNode(enumCandidate) && enumCandidate.items.length === 1) {
        const only = enumCandidate.items[0];
        if (isValueNode(only)) {
          const constNode = createValueNode(only.value, only.origin);
          processedEntries.splice(enumIndex, 1, {
            key: 'const',
            node: constNode,
          });
        }
      }
    }

    if (inlineOneOf) {
      // Prefer minimal shapes when possible:
      // - If no siblings: return S directly (already origin-adjusted by simplifyOneOf)
      // - If S is boolean true or empty object: drop it (no effect)
      // - If S is boolean false: collapse to false at operator locus
      // - Otherwise: conjoin via allOf to preserve semantics without merging
      const s = inlineOneOf.schema;
      if (processedEntries.length === 0) {
        return cloneCanonNode(s);
      }

      if (isValueNode(s) && s.value === true) {
        // oneOf [true] has no effect in presence of siblings
        return createObjectNode(processedEntries, node.origin);
      }

      if (isValueNode(s) && s.value === false) {
        // Collapse the whole object to false; origin at the operator path
        return createValueNode(false, inlineOneOf.origin);
      }

      if (isObjectNode(s) && s.entries.length === 0) {
        // Empty schema is a no-op
        return createObjectNode(processedEntries, node.origin);
      }

      const existingAllOfIndex = processedEntries.findIndex(
        (entry) => entry.key === 'allOf' && entry.node.kind === 'array'
      );
      const cloned = cloneCanonNode(s);
      if (existingAllOfIndex !== -1) {
        const existingSlot = processedEntries[existingAllOfIndex];
        if (existingSlot && isArrayNode(existingSlot.node)) {
          const updatedItems = existingSlot.node.items.concat(cloned);
          processedEntries[existingAllOfIndex] = {
            key: 'allOf',
            node: createArrayNode(updatedItems, existingSlot.node.origin),
          };
        }
      } else {
        processedEntries.push({
          key: 'allOf',
          node: createArrayNode([cloned], inlineOneOf.origin),
        });
      }
    }

    return createObjectNode(processedEntries, node.origin);
  }

  private applyConditionalRewrites(
    node: CanonNode,
    pointer: string,
    ctx: GuardContext
  ): CanonNode {
    if (node.kind === 'array') {
      const items = node.items.map((item, index) =>
        this.applyConditionalRewrites(
          item,
          buildIndexPointer(pointer, index),
          ctx
        )
      );
      return { ...node, items };
    }

    if (node.kind !== 'object') {
      return node;
    }

    const guardFlags = this.gatherGuardFlags(node);
    const mergedCtx = this.mergeGuardContext(ctx, guardFlags);

    type EntrySlot = { key: string; node: CanonNode };
    const entrySlots: EntrySlot[] = [];

    let ifNode: CanonNode | undefined;
    let thenNode: CanonNode | undefined;
    let elseNode: CanonNode | undefined;
    let ifIndex = -1;

    for (const entry of node.entries) {
      const childPointer = buildPropertyPointer(pointer, entry.key);
      const processedChild = this.applyConditionalRewrites(
        entry.node,
        childPointer,
        mergedCtx
      );
      entrySlots.push({ key: entry.key, node: processedChild });
      if (entry.key === 'if') {
        ifNode = processedChild;
        ifIndex = entrySlots.length - 1;
      } else if (entry.key === 'then') {
        thenNode = processedChild;
      } else if (entry.key === 'else') {
        elseNode = processedChild;
      }
    }

    const conditionalPointer = buildPropertyPointer(pointer, 'if');
    const canAttemptRewrite =
      this.options.rewriteConditionals !== 'never' &&
      ifNode &&
      thenNode &&
      elseNode;

    if (canAttemptRewrite && ifNode && thenNode && elseNode) {
      const guardActive = this.isGuardActive(mergedCtx);
      if (guardActive) {
        this.addNote(
          conditionalPointer,
          DIAGNOSTIC_CODES.IF_REWRITE_SKIPPED_UNEVALUATED
        );
      } else {
        const blockingAtNode = entrySlots.some(
          (slot) =>
            slot.key !== 'if' &&
            slot.key !== 'then' &&
            slot.key !== 'else' &&
            CONDITIONAL_BLOCKING_KEYWORDS.has(slot.key)
        );
        const blockingInBranches =
          this.nodeContainsKeywords(thenNode, CONDITIONAL_BLOCKING_KEYWORDS) ||
          this.nodeContainsKeywords(elseNode, CONDITIONAL_BLOCKING_KEYWORDS);

        if (blockingAtNode || blockingInBranches) {
          this.addNote(
            conditionalPointer,
            DIAGNOSTIC_CODES.IF_REWRITE_DISABLED_ANNOTATION_RISK
          );
        } else {
          const notDepthLimit = this.options.guards.maxGeneratedNotNesting;
          const requiredNotDepth = 2;
          if (notDepthLimit < requiredNotDepth) {
            this.addNote(conditionalPointer, DIAGNOSTIC_CODES.NOT_DEPTH_CAPPED);
            return createObjectNode(
              entrySlots.map((slot) => ({
                key: slot.key,
                node: slot.node,
              })),
              node.origin
            );
          }

          const ifOrigin = ifNode.origin;
          const thenClone = cloneCanonNode(thenNode);
          const elseClone = cloneCanonNode(elseNode);
          const sClone = cloneCanonNode(ifNode);
          const sCloneForNot = cloneCanonNode(ifNode);

          const innerNot = createObjectNode(
            [
              {
                key: 'not',
                node: sClone,
              },
            ],
            ifOrigin
          );

          const doubleNot = createObjectNode(
            [
              {
                key: 'not',
                node: innerNot,
              },
            ],
            ifOrigin
          );

          const firstAllOf = createObjectNode(
            [
              {
                key: 'allOf',
                node: createArrayNode([doubleNot, thenClone], ifOrigin),
              },
            ],
            ifOrigin
          );

          const notS = createObjectNode(
            [
              {
                key: 'not',
                node: sCloneForNot,
              },
            ],
            ifOrigin
          );

          const secondAllOf = createObjectNode(
            [
              {
                key: 'allOf',
                node: createArrayNode([notS, elseClone], ifOrigin),
              },
            ],
            ifOrigin
          );

          const anyOfNode = createArrayNode(
            [firstAllOf, secondAllOf],
            ifOrigin
          );

          const filtered = entrySlots.filter(
            (slot) =>
              slot.key !== 'if' && slot.key !== 'then' && slot.key !== 'else'
          );
          const insertionIndex =
            ifIndex >= 0 ? Math.min(ifIndex, filtered.length) : filtered.length;
          filtered.splice(insertionIndex, 0, {
            key: 'anyOf',
            node: anyOfNode,
          });

          this.addNote(
            conditionalPointer,
            DIAGNOSTIC_CODES.IF_REWRITE_DOUBLE_NOT
          );

          return createObjectNode(
            filtered.map((slot) => ({
              key: slot.key,
              node: slot.node,
            })),
            node.origin
          );
        }
      }
    }

    return createObjectNode(
      entrySlots.map((slot) => ({
        key: slot.key,
        node: slot.node,
      })),
      node.origin
    );
  }

  private tryPatternPropertyNamesRewrite(
    entrySlots: EntrySlot[],
    propertyNamesSlotIndex: number,
    patternPropertiesNodeIndex: number,
    additionalPropertiesIndex: number,
    propertyNamesPointer: string,
    objectPointer: string,
    propertiesNode: CanonNode | undefined,
    requiredNode: CanonNode | undefined,
    nodeOrigin: string
  ): CanonNode | null {
    const propertyNamesSlot = entrySlots[propertyNamesSlotIndex]!;
    if (propertyNamesSlot.node.kind !== 'object') {
      return null;
    }
    const propertyNamesNode = propertyNamesSlot.node;
    const patternIndex = this.findEntryIndex(propertyNamesNode, 'pattern');
    if (patternIndex === -1) {
      return null;
    }

    const patternEntry = propertyNamesNode.entries[patternIndex];
    const patternNode = patternEntry?.node;
    if (!patternNode || patternNode.kind !== 'value') {
      this.recordPnamesComplex(objectPointer, 'PATTERN_NOT_STRING');
      return null;
    }

    const patternValue = patternNode.value;
    if (typeof patternValue !== 'string') {
      this.recordPnamesComplex(objectPointer, 'PATTERN_NOT_STRING');
      return null;
    }

    const patternSource = patternValue;
    const policy = analyzeRegex(patternSource, { context: 'rewrite' });

    if (policy.compileError) {
      this.recordPnamesComplex(objectPointer, 'REGEX_COMPILE_ERROR');
      for (const diag of policy.diagnostics) {
        this.addNote(objectPointer, diag.code, diag.details);
      }
      return null;
    }

    if (!policy.anchored || policy.hasBackreference || policy.hasLookaround) {
      this.recordPnamesComplex(objectPointer, 'PATTERN_NOT_ANCHORED');
      return null;
    }

    if (policy.capped) {
      this.recordPnamesComplex(objectPointer, 'REGEX_COMPLEXITY_CAPPED');
      for (const diag of policy.diagnostics) {
        if (diag.code === DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED) {
          this.addNote(objectPointer, diag.code, diag.details);
        }
      }
      return null;
    }

    let compiled: RegExp;
    try {
      compiled = new RegExp(patternSource, 'u');
    } catch {
      this.recordPnamesComplex(objectPointer, 'REGEX_COMPILE_ERROR');
      this.addNote(objectPointer, DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR, {
        context: 'rewrite',
        patternSource,
      });
      return null;
    }

    const missing = new Set<string>();
    const propertyKeys = propertiesNode
      ? this.getObjectKeys(propertiesNode)
      : [];
    if (propertyKeys) {
      for (const key of propertyKeys) {
        if (!this.regexMatches(compiled, key)) {
          missing.add(key);
        }
      }
    }
    if (requiredNode) {
      const requiredKeys = this.getStringArray(requiredNode);
      if (!requiredKeys) {
        this.recordPnamesComplex(objectPointer, 'REQUIRED_KEYS_NOT_COVERED');
        return null;
      }
      for (const key of requiredKeys) {
        if (!this.regexMatches(compiled, key)) {
          missing.add(key);
        }
      }
    }

    if (missing.size > 0) {
      this.recordPnamesComplex(
        objectPointer,
        'REQUIRED_KEYS_NOT_COVERED',
        Array.from(missing)
      );
      return null;
    }

    if (patternPropertiesNodeIndex !== -1) {
      this.recordPnamesComplex(objectPointer, 'PATTERN_PROPERTIES_PRESENT');
      return null;
    }

    if (
      !this.isAdditionalPropertiesSafeForRewrite(
        entrySlots,
        additionalPropertiesIndex
      )
    ) {
      this.recordPnamesComplex(objectPointer, 'ADDITIONAL_PROPERTIES_SCHEMA');
      return null;
    }

    return this.applySyntheticPropertyNamesPattern(
      entrySlots,
      propertyNamesSlotIndex,
      patternPropertiesNodeIndex,
      additionalPropertiesIndex,
      propertyNamesPointer,
      objectPointer,
      nodeOrigin,
      patternSource,
      'pattern'
    );
  }

  private applySyntheticPropertyNamesPattern(
    entrySlots: EntrySlot[],
    propertyNamesSlotIndex: number,
    patternPropertiesNodeIndex: number,
    additionalPropertiesIndex: number,
    propertyNamesPointer: string,
    objectPointer: string,
    origin: string,
    patternSource: string,
    kind: 'enum' | 'pattern'
  ): CanonNode {
    const syntheticOrigin = propertyNamesPointer;
    const syntheticPatternEntry: CanonObjectEntry = {
      key: patternSource,
      node: createObjectNode([], syntheticOrigin),
    };

    if (patternPropertiesNodeIndex !== -1) {
      const existingPatternSlot = entrySlots[patternPropertiesNodeIndex];
      if (existingPatternSlot && isObjectNode(existingPatternSlot.node)) {
        const mergedEntries = existingPatternSlot.node.entries.concat(
          syntheticPatternEntry
        );
        entrySlots[patternPropertiesNodeIndex] = {
          key: 'patternProperties',
          node: createObjectNode(
            mergedEntries,
            existingPatternSlot.node.origin
          ),
        };
      }
    } else {
      const patternPropertiesObject = createObjectNode(
        [syntheticPatternEntry],
        syntheticOrigin
      );
      const insertionIndex = propertyNamesSlotIndex + 1;
      entrySlots.splice(insertionIndex, 0, {
        key: 'patternProperties',
        node: patternPropertiesObject,
      });
      if (
        additionalPropertiesIndex !== -1 &&
        additionalPropertiesIndex >= insertionIndex
      ) {
        additionalPropertiesIndex += 1;
      }
    }

    const additionalNode = createValueNode(false, syntheticOrigin);
    if (additionalPropertiesIndex !== -1) {
      entrySlots[additionalPropertiesIndex] = {
        key: 'additionalProperties',
        node: additionalNode,
      };
    } else {
      entrySlots.splice(propertyNamesSlotIndex + 2, 0, {
        key: 'additionalProperties',
        node: additionalNode,
      });
    }

    this.addNote(objectPointer, DIAGNOSTIC_CODES.PNAMES_REWRITE_APPLIED, {
      kind,
      source: patternSource,
    });

    return this.buildObjectFromSlots(entrySlots, origin);
  }

  private buildObjectFromSlots(
    entrySlots: EntrySlot[],
    origin: string
  ): CanonNode {
    return createObjectNode(
      entrySlots.map((slot) => ({
        key: slot.key,
        node: slot.node,
      })),
      origin
    );
  }

  private isAdditionalPropertiesSafeForRewrite(
    entrySlots: EntrySlot[],
    additionalPropertiesIndex: number
  ): boolean {
    if (additionalPropertiesIndex === -1) {
      return true;
    }
    const additionalSlot = entrySlots[additionalPropertiesIndex]!;
    const additionalNode = additionalSlot?.node;
    return (
      (isValueNode(additionalNode) && additionalNode.value === true) ||
      (isObjectNode(additionalNode) && additionalNode.entries.length === 0)
    );
  }

  private regexMatches(regexp: RegExp, candidate: string): boolean {
    regexp.lastIndex = 0;
    return regexp.test(candidate);
  }

  private applyDependencyGuards(
    node: CanonNode,
    pointer: string,
    ctx: GuardContext
  ): CanonNode {
    if (node.kind === 'array') {
      const items = node.items.map((item, index) =>
        this.applyDependencyGuards(item, buildIndexPointer(pointer, index), ctx)
      );
      return createArrayNode(items, node.origin);
    }

    if (node.kind !== 'object') {
      return node;
    }

    const guardFlags = this.gatherGuardFlags(node);
    const mergedCtx = this.mergeGuardContext(ctx, guardFlags);

    const processedEntries: ObjectEntries = [];
    let dependentRequiredIndex = -1;
    let dependentNode: CanonNode | undefined;

    for (const entry of node.entries) {
      const childPointer = buildPropertyPointer(pointer, entry.key);
      const processedChild = this.applyDependencyGuards(
        entry.node,
        childPointer,
        mergedCtx
      );
      processedEntries.push({ key: entry.key, node: processedChild });
      if (entry.key === 'dependentRequired') {
        dependentRequiredIndex = processedEntries.length - 1;
        dependentNode = processedChild;
      }
    }

    if (
      dependentRequiredIndex !== -1 &&
      dependentNode &&
      isObjectNode(dependentNode)
    ) {
      if (this.isGuardActive(mergedCtx)) {
        if (dependentNode.entries.length > 0) {
          this.addNote(pointer, DIAGNOSTIC_CODES.DEPENDENCY_GUARDED, {
            reason: 'UNEVALUATED_IN_SCOPE',
          });
        }
      } else {
        const guardNodes = this.buildDependencyGuardNodes(dependentNode);
        if (guardNodes.length > 0) {
          const allOfIndex = processedEntries.findIndex(
            (entry) => entry.key === 'allOf' && isArrayNode(entry.node)
          );
          if (allOfIndex !== -1) {
            const slot = processedEntries[allOfIndex];
            if (slot && isArrayNode(slot.node)) {
              const mergedItems = slot.node.items.concat(guardNodes);
              processedEntries[allOfIndex] = {
                key: 'allOf',
                node: createArrayNode(mergedItems, slot.node.origin),
              };
            }
          } else {
            processedEntries.push({
              key: 'allOf',
              node: createArrayNode(guardNodes, dependentNode.origin),
            });
          }
        }
      }
    }

    return createObjectNode(processedEntries, node.origin);
  }

  private buildDependencyGuardNodes(
    dependentNode: CanonObjectNode
  ): CanonNode[] {
    const guards: CanonNode[] = [];

    for (const entry of dependentNode.entries) {
      const depKey = entry.key;
      const depNode = entry.node;
      if (!isArrayNode(depNode)) continue;

      const depValues = this.getStringArray(depNode);
      if (!depValues) continue;

      const seen = new Set<string>();
      const uniqueDeps: string[] = [];
      for (const value of depValues) {
        if (!seen.has(value)) {
          seen.add(value);
          uniqueDeps.push(value);
        }
      }

      const existingByValue = new Map<string, CanonValueNode>();
      for (const item of depNode.items) {
        if (isValueNode(item) && typeof item.value === 'string') {
          if (!existingByValue.has(item.value)) {
            existingByValue.set(item.value, item);
          }
        }
      }

      const requiredItems: CanonNode[] = [
        createValueNode(depKey, entry.node.origin),
      ];
      for (const dep of uniqueDeps) {
        if (dep === depKey) continue;
        const existing = existingByValue.get(dep);
        if (existing) {
          requiredItems.push(cloneCanonNode(existing));
        } else {
          requiredItems.push(createValueNode(dep, entry.node.origin));
        }
      }

      if (requiredItems.length === 1) {
        continue;
      }

      const notRequiredArray = createArrayNode(
        [createValueNode(depKey, entry.node.origin)],
        entry.node.origin
      );
      const notRequiredObject = createObjectNode(
        [
          {
            key: 'required',
            node: notRequiredArray,
          },
        ],
        entry.node.origin
      );
      const notContainer = createObjectNode(
        [
          {
            key: 'not',
            node: notRequiredObject,
          },
        ],
        entry.node.origin
      );

      const requiredArray = createArrayNode(requiredItems, entry.node.origin);
      const requiredObject = createObjectNode(
        [
          {
            key: 'required',
            node: requiredArray,
          },
        ],
        entry.node.origin
      );

      const anyOfNode = createArrayNode(
        [notContainer, requiredObject],
        entry.node.origin
      );
      const guardObject = createObjectNode(
        [
          {
            key: 'anyOf',
            node: anyOfNode,
          },
        ],
        entry.node.origin
      );

      guards.push(guardObject);
    }

    return guards;
  }

  private applyPropertyNamesRewrite(
    node: CanonNode,
    pointer: string,
    ctx: GuardContext
  ): CanonNode {
    if (node.kind === 'array') {
      const items = node.items.map((item, index) =>
        this.applyPropertyNamesRewrite(
          item,
          buildIndexPointer(pointer, index),
          ctx
        )
      );
      return createArrayNode(items, node.origin);
    }

    if (node.kind !== 'object') {
      return node;
    }

    const guardFlags = this.gatherGuardFlags(node);
    const mergedCtx = this.mergeGuardContext(ctx, guardFlags);

    const entrySlots: EntrySlot[] = [];

    let propertyNamesSlotIndex = -1;
    let propertiesNode: CanonNode | undefined;
    let requiredNode: CanonNode | undefined;
    let patternPropertiesNodeIndex = -1;
    let additionalPropertiesIndex = -1;

    for (const entry of node.entries) {
      const childPointer = buildPropertyPointer(pointer, entry.key);
      const processedChild = this.applyPropertyNamesRewrite(
        entry.node,
        childPointer,
        mergedCtx
      );

      entrySlots.push({ key: entry.key, node: processedChild });

      if (entry.key === 'propertyNames') {
        propertyNamesSlotIndex = entrySlots.length - 1;
      } else if (entry.key === 'properties') {
        propertiesNode = processedChild;
      } else if (entry.key === 'required') {
        requiredNode = processedChild;
      } else if (entry.key === 'patternProperties') {
        patternPropertiesNodeIndex = entrySlots.length - 1;
      } else if (entry.key === 'additionalProperties') {
        additionalPropertiesIndex = entrySlots.length - 1;
      }
    }

    const rebuildObject = (): CanonNode =>
      this.buildObjectFromSlots(entrySlots, node.origin);

    if (propertyNamesSlotIndex === -1) {
      return rebuildObject();
    }

    const propertyNamesSlot = entrySlots[propertyNamesSlotIndex]!;
    if (propertyNamesSlot.node.kind !== 'object') {
      return rebuildObject();
    }

    const propertyNamesPointer = buildPropertyPointer(pointer, 'propertyNames');
    const objectPointer = pointer;

    if (this.isGuardActive(mergedCtx)) {
      this.recordPnamesComplex(objectPointer, 'UNEVALUATED_IN_SCOPE');
      return rebuildObject();
    }

    const enumIndex = this.findEntryIndex(propertyNamesSlot.node, 'enum');
    const patternIndex = this.findEntryIndex(propertyNamesSlot.node, 'pattern');

    if (enumIndex !== -1) {
      const enumEntry = propertyNamesSlot.node.entries[enumIndex];
      const enumNode = enumEntry?.node;
      if (!enumNode || enumNode.kind !== 'array') {
        this.recordPnamesComplex(objectPointer, 'NON_STRING_ENUM_MEMBER');
        return rebuildObject();
      }

      const enumValues = this.getStringArray(enumNode);
      if (!enumValues || enumValues.length === 0) {
        this.recordPnamesComplex(objectPointer, 'NON_STRING_ENUM_MEMBER');
        return rebuildObject();
      }

      const dedupOrdered: string[] = [];
      const seen = new Set<string>();
      for (const value of enumValues) {
        if (!seen.has(value)) {
          seen.add(value);
          dedupOrdered.push(value);
        }
      }
      const sortedValues = dedupOrdered
        .slice()
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const enumSet = new Set(sortedValues);

      const missing = new Set<string>();
      const propertyKeys = propertiesNode
        ? this.getObjectKeys(propertiesNode)
        : [];
      if (propertyKeys) {
        for (const key of propertyKeys) {
          if (!enumSet.has(key)) {
            missing.add(key);
          }
        }
      }
      if (requiredNode) {
        const requiredKeys = this.getStringArray(requiredNode);
        if (!requiredKeys) {
          this.recordPnamesComplex(objectPointer, 'REQUIRED_KEYS_NOT_COVERED');
          return rebuildObject();
        }
        for (const key of requiredKeys) {
          if (!enumSet.has(key)) {
            missing.add(key);
          }
        }
      }

      if (missing.size > 0) {
        this.recordPnamesComplex(
          objectPointer,
          'REQUIRED_KEYS_NOT_COVERED',
          Array.from(missing)
        );
        return rebuildObject();
      }

      let patternPropertiesSafe = true;
      if (patternPropertiesNodeIndex !== -1) {
        const patternSlot = entrySlots[patternPropertiesNodeIndex]!;
        const patternNode = patternSlot?.node;
        if (!isObjectNode(patternNode)) {
          patternPropertiesSafe = false;
        } else {
          for (const patternEntry of patternNode.entries) {
            const patternSource = patternEntry.key;
            const policy = analyzeRegex(patternSource, { context: 'rewrite' });
            if (policy.compileError) {
              this.recordPnamesComplex(objectPointer, 'REGEX_COMPILE_ERROR');
              for (const diag of policy.diagnostics) {
                this.addNote(objectPointer, diag.code, diag.details);
              }
              patternPropertiesSafe = false;
              break;
            }
            if (policy.capped) {
              this.recordPnamesComplex(
                objectPointer,
                'REGEX_COMPLEXITY_CAPPED'
              );
              for (const diag of policy.diagnostics) {
                if (diag.code === DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED) {
                  this.addNote(objectPointer, diag.code, diag.details);
                }
              }
              patternPropertiesSafe = false;
              break;
            }
            if (!policy.isAnchoredSafe) {
              patternPropertiesSafe = false;
              break;
            }
            const literals = extractExactLiteralAlternatives(patternSource);
            if (!literals || literals.some((lit) => !enumSet.has(lit))) {
              patternPropertiesSafe = false;
              break;
            }
          }
        }
      }
      if (!patternPropertiesSafe) {
        this.recordPnamesComplex(objectPointer, 'PATTERN_PROPERTIES_PRESENT');
        return rebuildObject();
      }

      if (
        !this.isAdditionalPropertiesSafeForRewrite(
          entrySlots,
          additionalPropertiesIndex
        )
      ) {
        this.recordPnamesComplex(objectPointer, 'ADDITIONAL_PROPERTIES_SCHEMA');
        return rebuildObject();
      }

      const patternSource = `^(?:${sortedValues
        .map((value) => escapeRegexLiteral(value))
        .join('|')})$`;

      const policy = analyzeRegex(patternSource, { context: 'rewrite' });
      if (policy.compileError) {
        this.recordPnamesComplex(objectPointer, 'REGEX_COMPILE_ERROR');
        for (const diag of policy.diagnostics) {
          this.addNote(objectPointer, diag.code, diag.details);
        }
        return rebuildObject();
      }

      if (policy.capped) {
        this.recordPnamesComplex(objectPointer, 'REGEX_COMPLEXITY_CAPPED');
        for (const diag of policy.diagnostics) {
          if (diag.code === DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED) {
            this.addNote(objectPointer, diag.code, diag.details);
          }
        }
        return rebuildObject();
      }

      return this.applySyntheticPropertyNamesPattern(
        entrySlots,
        propertyNamesSlotIndex,
        patternPropertiesNodeIndex,
        additionalPropertiesIndex,
        propertyNamesPointer,
        objectPointer,
        node.origin,
        patternSource,
        'enum'
      );
    }

    if (patternIndex !== -1) {
      const rewritten = this.tryPatternPropertyNamesRewrite(
        entrySlots,
        propertyNamesSlotIndex,
        patternPropertiesNodeIndex,
        additionalPropertiesIndex,
        propertyNamesPointer,
        objectPointer,
        propertiesNode,
        requiredNode,
        node.origin
      );
      if (rewritten) {
        return rewritten;
      }
    }

    return rebuildObject();
  }

  private annotateDynamicPresence(node: CanonNode, pointer: string): void {
    if (node.kind === 'array') {
      node.items.forEach((item, index) =>
        this.annotateDynamicPresence(item, buildIndexPointer(pointer, index))
      );
      return;
    }

    if (node.kind !== 'object') {
      return;
    }

    let hasDynamic = false;
    for (const entry of node.entries) {
      if (DYNAMIC_KEYWORDS.has(entry.key)) {
        hasDynamic = true;
      }
      const childPointer = buildPropertyPointer(pointer, entry.key);
      this.annotateDynamicPresence(entry.node, childPointer);
    }

    if (hasDynamic) {
      this.addNote(pointer, DIAGNOSTIC_CODES.DYNAMIC_PRESENT);
    }
  }

  private unifyDraftKeywords(node: CanonObjectNode, pointer: string): void {
    this.renameId(node, pointer);
    this.mergeDefinitions(node, pointer);
    this.normalizeTupleKeywords(node);
    this.rewriteNullable(node, pointer);
    this.normalizeExclusiveBounds(node, pointer);
  }

  private renameId(node: CanonObjectNode, pointer: string): void {
    // Do not rename definition entry keys such as "/definitions/id" or "/$defs/id":
    // these are schema names, not draft-04 "id" keywords.
    if (
      pointer.endsWith('/properties') ||
      pointer.endsWith('/definitions') ||
      pointer.endsWith('/$defs')
    ) {
      return;
    }
    const idIndex = this.findEntryIndex(node, 'id');
    if (idIndex === -1) return;
    const idEntry = node.entries[idIndex];
    if (!idEntry) return;
    const existingDollar = this.findEntryIndex(node, '$id');
    if (existingDollar !== -1) return;
    idEntry.key = '$id';
  }

  private mergeDefinitions(node: CanonObjectNode, pointer: string): void {
    // Do not treat property names under "properties" as schema-level definitions,
    // and do not recurse into $defs containers as if they had nested "definitions" keywords.
    if (pointer.endsWith('/properties') || pointer.endsWith('/$defs')) {
      return;
    }
    const definitionsIndex = this.findEntryIndex(node, 'definitions');
    if (definitionsIndex === -1) return;

    const definitionsEntry = node.entries[definitionsIndex];
    if (!definitionsEntry || definitionsEntry.node.kind !== 'object') {
      return;
    }

    const defsIndex = this.findEntryIndex(node, '$defs');
    if (defsIndex === -1) {
      // simple rename
      definitionsEntry.key = '$defs';
      return;
    }

    const defsEntry = node.entries[defsIndex];
    if (!defsEntry || defsEntry.node.kind !== 'object') {
      // cannot merge into non-object, keep existing structure
      return;
    }

    const existing = new Set(defsEntry.node.entries.map((e) => e.key));
    for (const child of definitionsEntry.node.entries) {
      if (!existing.has(child.key)) {
        defsEntry.node.entries.push(child);
      }
    }
    node.entries.splice(definitionsIndex, 1);
  }

  private normalizeTupleKeywords(node: CanonObjectNode): void {
    const itemsIndex = this.findEntryIndex(node, 'items');
    if (itemsIndex === -1) return;

    const itemsEntry = node.entries[itemsIndex];
    if (!itemsEntry || itemsEntry.node.kind !== 'array') return;

    // rename items -> prefixItems
    itemsEntry.key = 'prefixItems';

    const additionalIndex = this.findEntryIndex(node, 'additionalItems');
    if (additionalIndex !== -1) {
      const additionalEntry = node.entries[additionalIndex];
      if (additionalEntry) {
        additionalEntry.key = 'items';
        node.entries.splice(additionalIndex, 1, additionalEntry);
      }
    }
  }

  private rewriteNullable(node: CanonObjectNode, pointer: string): void {
    const nullableIndex = this.findEntryIndex(node, 'nullable');
    if (nullableIndex === -1) return;

    const nullableEntry = node.entries[nullableIndex];
    if (
      !nullableEntry ||
      nullableEntry.node.kind !== 'value' ||
      nullableEntry.node.value !== true
    ) {
      return;
    }

    const typeIndex = this.findEntryIndex(node, 'type');
    if (typeIndex === -1) {
      this.addNote(pointer, DIAGNOSTIC_CODES.OAS_NULLABLE_KEEP_ANNOT);
      return;
    }

    const typeEntry = node.entries[typeIndex];
    if (!typeEntry) {
      this.addNote(pointer, DIAGNOSTIC_CODES.OAS_NULLABLE_KEEP_ANNOT);
      return;
    }

    if (typeEntry.node.kind === 'value') {
      const value = typeEntry.node.value;
      if (typeof value === 'string') {
        typeEntry.node = {
          kind: 'array',
          origin: typeEntry.node.origin,
          items: [
            {
              kind: 'value',
              origin: typeEntry.node.origin,
              value,
            },
            {
              kind: 'value',
              origin: nullableEntry.node.origin,
              value: 'null',
            },
          ],
        };
        node.entries.splice(nullableIndex, 1);
        return;
      }
    } else if (typeEntry.node.kind === 'array') {
      const seen = new Set<string>();
      const items: CanonNode[] = [];
      for (const itemNode of typeEntry.node.items) {
        if (isValueNode(itemNode) && typeof itemNode.value === 'string') {
          if (seen.has(itemNode.value)) continue;
          seen.add(itemNode.value);
          items.push(itemNode);
        } else {
          items.push(itemNode);
        }
      }
      if (!seen.has('null')) {
        items.push({
          kind: 'value',
          origin: nullableEntry.node.origin,
          value: 'null',
        });
      }
      typeEntry.node.items = items;
      node.entries.splice(nullableIndex, 1);
      return;
    }

    this.addNote(pointer, DIAGNOSTIC_CODES.OAS_NULLABLE_KEEP_ANNOT);
  }

  private normalizeExclusiveBounds(
    node: CanonObjectNode,
    pointer: string
  ): void {
    this.normalizeExclusiveBound(node, pointer, 'exclusiveMinimum', 'minimum', {
      ignoredCode: DIAGNOSTIC_CODES.EXCLMIN_IGNORED_NO_MIN,
    });
    this.normalizeExclusiveBound(node, pointer, 'exclusiveMaximum', 'maximum', {
      ignoredCode: DIAGNOSTIC_CODES.EXCLMAX_IGNORED_NO_MAX,
    });
  }

  private normalizeExclusiveBound(
    node: CanonObjectNode,
    pointer: string,
    exclusiveKey: 'exclusiveMinimum' | 'exclusiveMaximum',
    baseKey: 'minimum' | 'maximum',
    opts: { ignoredCode: DiagnosticCode }
  ): void {
    const exclusiveIndex = this.findEntryIndex(node, exclusiveKey);
    if (exclusiveIndex === -1) return;

    const exclusiveEntry = node.entries[exclusiveIndex];
    if (
      !exclusiveEntry ||
      exclusiveEntry.node.kind !== 'value' ||
      typeof exclusiveEntry.node.value !== 'boolean'
    ) {
      return;
    }

    if (exclusiveEntry.node.value === false) {
      node.entries.splice(exclusiveIndex, 1);
      return;
    }

    const baseIndex = this.findEntryIndex(node, baseKey);
    if (baseIndex === -1) {
      this.addNote(
        buildPropertyPointer(pointer, exclusiveKey),
        opts.ignoredCode
      );
      node.entries.splice(exclusiveIndex, 1);
      return;
    }

    const baseEntry = node.entries[baseIndex];
    if (
      !baseEntry ||
      baseEntry.node.kind !== 'value' ||
      typeof baseEntry.node.value !== 'number'
    ) {
      this.addNote(
        buildPropertyPointer(pointer, exclusiveKey),
        opts.ignoredCode
      );
      node.entries.splice(exclusiveIndex, 1);
      return;
    }

    exclusiveEntry.node = createValueNode(
      baseEntry.node.value,
      baseEntry.node.origin
    );
    node.entries.splice(baseIndex, 1);
  }

  private findEntryIndex(node: CanonObjectNode, key: string): number {
    return node.entries.findIndex((entry) => entry.key === key);
  }

  private isLocalDefinitionsRef(value: string): boolean {
    return value.startsWith('#/definitions/');
  }

  private gatherGuardFlags(node: CanonObjectNode): {
    hasUnevaluatedProps: boolean;
    hasUnevaluatedItems: boolean;
  } {
    let hasProps = false;
    let hasItems = false;
    for (const entry of node.entries) {
      if (entry.key === 'unevaluatedProperties') {
        hasProps = true;
      } else if (entry.key === 'unevaluatedItems') {
        hasItems = true;
      }
    }
    return { hasUnevaluatedProps: hasProps, hasUnevaluatedItems: hasItems };
  }

  private mergeGuardContext(
    ctx: GuardContext,
    flags: { hasUnevaluatedProps: boolean; hasUnevaluatedItems: boolean }
  ): GuardContext {
    return {
      unevaluatedProps: ctx.unevaluatedProps || flags.hasUnevaluatedProps,
      unevaluatedItems: ctx.unevaluatedItems || flags.hasUnevaluatedItems,
    };
  }

  private isGuardActive(ctx: GuardContext): boolean {
    return ctx.unevaluatedProps || ctx.unevaluatedItems;
  }

  private nodeContainsKeywords(
    node: CanonNode | undefined,
    keywords: Set<string>
  ): boolean {
    if (!node) return false;
    if (node.kind === 'object') {
      for (const entry of node.entries) {
        if (keywords.has(entry.key)) {
          return true;
        }
        if (this.nodeContainsKeywords(entry.node, keywords)) {
          return true;
        }
      }
      return false;
    }
    if (node.kind === 'array') {
      return node.items.some((item) =>
        this.nodeContainsKeywords(item, keywords)
      );
    }
    return false;
  }

  private recordPnamesComplex(
    pointer: string,
    reason: string,
    missing?: string[]
  ): void {
    const details =
      missing && missing.length > 0
        ? { reason, missingRequired: missing.slice().sort() }
        : { reason };
    this.addNote(pointer, DIAGNOSTIC_CODES.PNAMES_COMPLEX, details);
  }

  private getStringArray(node: CanonNode): string[] | null {
    if (node.kind !== 'array') return null;
    const values: string[] = [];
    for (const item of node.items) {
      if (item.kind !== 'value' || typeof item.value !== 'string') {
        return null;
      }
      values.push(item.value);
    }
    return values;
  }

  private getObjectKeys(node: CanonNode): string[] | null {
    if (node.kind !== 'object') return null;
    return node.entries.map((entry) => entry.key);
  }

  private simplifyAllOf(
    node: CanonNode,
    pointer: string,
    ctx: GuardContext
  ): SimplifyOutcome {
    if (node.kind !== 'array') {
      return { kind: 'replace', node };
    }

    if (this.isGuardActive(ctx)) {
      this.addNote(
        pointer,
        DIAGNOSTIC_CODES.ALLOF_SIMPLIFICATION_SKIPPED_UNEVALUATED,
        {
          reason: 'unevaluatedInScope',
        }
      );
      return { kind: 'replace', node };
    }

    const retained: CanonNode[] = [];
    let falseOrigin: string | undefined;
    for (const item of node.items) {
      if (isBooleanNode(item, true)) continue;
      if (isBooleanNode(item, false)) {
        falseOrigin = item.origin;
        break;
      }
      retained.push(item);
    }

    if (falseOrigin !== undefined) {
      return {
        kind: 'collapse',
        node: createValueNode(false, node.origin),
      };
    }

    if (retained.length === 0) {
      return {
        kind: 'collapse',
        node: createValueNode(true, node.origin),
      };
    }

    if (retained.length === node.items.length) {
      return { kind: 'replace', node };
    }

    return {
      kind: 'replace',
      node: createArrayNode(retained, node.origin),
    };
  }

  private simplifyAnyOf(
    node: CanonNode,
    pointer: string,
    ctx: GuardContext
  ): SimplifyOutcome {
    if (node.kind !== 'array') {
      return { kind: 'replace', node };
    }

    if (this.isGuardActive(ctx)) {
      this.addNote(
        pointer,
        DIAGNOSTIC_CODES.ANYOF_SIMPLIFICATION_SKIPPED_UNEVALUATED,
        {
          reason: 'unevaluatedInScope',
        }
      );
      return { kind: 'replace', node };
    }

    const retained: CanonNode[] = [];
    let trueOrigin: string | undefined;
    for (const item of node.items) {
      if (isBooleanNode(item, false)) {
        continue;
      }
      if (isBooleanNode(item, true)) {
        trueOrigin = item.origin;
        continue;
      }
      retained.push(item);
    }

    if (trueOrigin !== undefined) {
      return {
        kind: 'collapse',
        node: createValueNode(true, node.origin),
      };
    }

    if (retained.length === 0) {
      return {
        kind: 'collapse',
        node: createValueNode(false, node.origin),
      };
    }

    if (retained.length === node.items.length) {
      return { kind: 'replace', node };
    }

    return {
      kind: 'replace',
      node: createArrayNode(retained, node.origin),
    };
  }

  private simplifyOneOf(
    node: CanonNode,
    pointer: string,
    ctx: GuardContext
  ): SimplifyOutcome {
    if (node.kind !== 'array') {
      return { kind: 'replace', node };
    }

    if (this.isGuardActive(ctx)) {
      this.addNote(
        pointer,
        DIAGNOSTIC_CODES.ONEOF_SIMPLIFICATION_SKIPPED_UNEVALUATED,
        {
          reason: 'unevaluatedInScope',
        }
      );
      return { kind: 'replace', node };
    }

    const retained: CanonNode[] = [];
    let hasTrue = false;
    let removedAny = false;

    for (const item of node.items) {
      if (isBooleanNode(item, false)) {
        removedAny = true;
        continue;
      }
      if (isBooleanNode(item, true)) {
        hasTrue = true;
      }
      retained.push(item);
    }

    if (hasTrue && retained.length >= 2) {
      return { kind: 'replace', node };
    }

    if (retained.length === 0) {
      return {
        kind: 'collapse',
        node: createValueNode(false, node.origin),
      };
    }

    if (retained.length === 1) {
      const single = retained[0]!;
      // Per §7 transformation-specific origin rules:
      // If oneOf [S] ⇒ S, originPtr(S_final) = "#/…/oneOf/0"
      const sOrigin = buildIndexPointer(pointer, 0);
      const inlined = cloneCanonNodeWithRootOrigin(single, sOrigin);
      return {
        kind: 'inline',
        schema: inlined,
        origin: node.origin,
      };
    }

    if (!removedAny) {
      return { kind: 'replace', node };
    }

    return {
      kind: 'replace',
      node: createArrayNode(retained, node.origin),
    };
  }

  private cloneNode(value: unknown, origin: string): CanonNode {
    if (Array.isArray(value)) {
      const items = value.map((item, index) =>
        this.cloneNode(item, `${origin}/${index}`)
      );
      return {
        kind: 'array',
        origin,
        items,
      };
    }

    if (value && typeof value === 'object') {
      const entries: CanonObjectEntry[] = [];
      for (const [key, child] of Object.entries(
        value as Record<string, unknown>
      )) {
        const childOrigin = `${origin}/${escapeJsonPointerSegment(key)}`;
        entries.push({
          key,
          node: this.cloneNode(child, childOrigin),
        });
      }
      return {
        kind: 'object',
        origin,
        entries,
      };
    }

    return {
      kind: 'value',
      origin,
      value,
    };
  }

  private materialize(
    node: CanonNode,
    pointer: string,
    ptrMap: Map<string, string>,
    revPtrMap: Map<string, string[]>
  ): unknown {
    this.mapPointer(ptrMap, revPtrMap, pointer, node.origin);

    if (node.kind === 'value') {
      return node.value;
    }

    if (node.kind === 'array') {
      return node.items.map((child, index) =>
        this.materialize(
          child,
          pointer === '' ? `/${index}` : `${pointer}/${index}`,
          ptrMap,
          revPtrMap
        )
      );
    }

    const out: Record<string, unknown> = {};
    for (const entry of node.entries) {
      const childPointer =
        pointer === ''
          ? `/${escapeJsonPointerSegment(entry.key)}`
          : `${pointer}/${escapeJsonPointerSegment(entry.key)}`;
      out[entry.key] = this.materialize(
        entry.node,
        childPointer,
        ptrMap,
        revPtrMap
      );
    }
    return out;
  }

  private mapPointer(
    ptrMap: Map<string, string>,
    revPtrMap: Map<string, string[]>,
    canonPtr: string,
    origin: string
  ): void {
    ptrMap.set(canonPtr, origin);
    const existing = revPtrMap.get(origin);
    if (existing) {
      insertSortedPointer(existing, canonPtr);
    } else {
      revPtrMap.set(origin, [canonPtr]);
    }
  }
}

interface GuardContext {
  unevaluatedProps: boolean;
  unevaluatedItems: boolean;
}

type SimplifyOutcome =
  | { kind: 'keep'; node: CanonNode }
  | { kind: 'replace'; node: CanonNode }
  | { kind: 'remove' }
  | { kind: 'collapse'; node: CanonValueNode }
  | { kind: 'inline'; schema: CanonNode; origin: string };

function buildPropertyPointer(base: string, key: string): string {
  const escaped = escapeJsonPointerSegment(key);
  return base === '' ? `/${escaped}` : `${base}/${escaped}`;
}

function buildIndexPointer(base: string, index: number): string {
  return base === '' ? `/${index}` : `${base}/${index}`;
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function unescapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function isAbsoluteUri(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
}

function resolvePointer(
  node: CanonNode,
  segments: string[]
): CanonNode | undefined {
  if (segments.length === 0) return node;
  const [head, ...rest] = segments;
  if (node.kind === 'object') {
    const entry = node.entries.find((e) => e.key === head);
    if (!entry) return undefined;
    return resolvePointer(entry.node, rest);
  }
  if (node.kind === 'array') {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0 || index >= node.items.length) {
      return undefined;
    }
    const next = node.items[index];
    if (!next) return undefined;
    return resolvePointer(next, rest);
  }
  return undefined;
}

function insertSortedPointer(list: string[], value: string): void {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const current = list[mid]!;
    if (current === value) return;
    if (current < value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  list.splice(lo, 0, value);
}

function createValueNode(value: unknown, origin: string): CanonValueNode {
  return { kind: 'value', origin, value };
}

function createArrayNode(items: CanonNode[], origin: string): CanonArrayNode {
  return { kind: 'array', origin, items };
}

function createObjectNode(
  entries: ObjectEntries,
  origin: string
): CanonObjectNode {
  return { kind: 'object', origin, entries };
}

function isValueNode(node: CanonNode | undefined): node is CanonValueNode {
  return !!node && node.kind === 'value';
}

function isArrayNode(node: CanonNode | undefined): node is CanonArrayNode {
  return !!node && node.kind === 'array';
}

function isObjectNode(node: CanonNode | undefined): node is CanonObjectNode {
  return !!node && node.kind === 'object';
}

function cloneCanonNode(node: CanonNode): CanonNode {
  switch (node.kind) {
    case 'value':
      return createValueNode(node.value, node.origin);
    case 'array':
      return createArrayNode(
        node.items.map((item) => cloneCanonNode(item)),
        node.origin
      );
    case 'object':
      return createObjectNode(
        node.entries.map((entry) => ({
          key: entry.key,
          node: cloneCanonNode(entry.node),
        })),
        node.origin
      );
  }
}

// Clone a canon node but override the origin at the root only.
function cloneCanonNodeWithRootOrigin(
  node: CanonNode,
  newOrigin: string
): CanonNode {
  switch (node.kind) {
    case 'value':
      return createValueNode(node.value, newOrigin);
    case 'array':
      return createArrayNode(
        node.items.map((item) => cloneCanonNode(item)),
        newOrigin
      );
    case 'object':
      return createObjectNode(
        node.entries.map((entry) => ({
          key: entry.key,
          node: cloneCanonNode(entry.node),
        })),
        newOrigin
      );
  }
}

function isBooleanNode(node: CanonNode, expected?: boolean): boolean {
  if (node.kind !== 'value' || typeof node.value !== 'boolean') {
    return false;
  }
  return expected === undefined ? true : node.value === expected;
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
