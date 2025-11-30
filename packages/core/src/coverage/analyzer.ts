/* eslint-disable max-lines */
/* eslint-disable max-depth */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import type { CoverageDimension, CoverageTarget } from '@foundrydata/shared';
import type { CoverageGraph, CoverageGraphNodeKind } from './index.js';
import type {
  CoverageIndex,
  ComposeDiagnostics,
} from '../transform/composition-engine.js';
import {
  computeCoverageTargetId,
  createCoverageTargetIdContext,
  type CoverageTargetIdContext,
} from './id-generator.js';
import { applyUnreachableStatusToTargets } from './coverage-analyzer-unreachable.js';
import { attachOpenApiOperationNodes } from './coverage-analyzer-openapi.js';

export interface CoverageAnalyzerInput {
  /**
   * Canonical schema produced by the Normalize stage.
   */
  canonSchema: unknown;
  /**
   * Map from canonical JSON Pointer to original schema pointer.
   */
  ptrMap: Map<string, string>;
  /**
   * CoverageIndex for AP:false objects produced by Compose.
   */
  coverageIndex: CoverageIndex;
  /**
   * Planning diagnostics (fatal, warn, UNSAT hints, run-level) from Compose.
   */
  planDiag?: ComposeDiagnostics;
  /**
   * Enabled coverage dimensions for this run. When omitted, defaults to
   * ['structure','branches','enum'] for V1.
   */
  dimensionsEnabled?: CoverageDimension[];
}

export interface CoverageAnalyzerResult {
  graph: CoverageGraph;
  targets: CoverageTarget[];
}

interface CoverageGraphBuildState {
  nodes: CoverageGraph['nodes'];
  edges: CoverageGraph['edges'];
  nodeIndexById: Map<string, number>;
  targets: CoverageTarget[];
  enabledDimensions: Set<CoverageDimension>;
  idContext: CoverageTargetIdContext;
  coverageIndex: CoverageIndex;
}

interface NodeClassification {
  kind: CoverageGraphNodeKind;
  meta?: Record<string, unknown>;
}

function appendPointer(base: string, token: string): string {
  if (token === '') return base;
  const escaped = token.replace(/~/g, '~0').replace(/\//g, '~1');
  if (base === '') return `/${escaped}`;
  return `${base}/${escaped}`;
}

function resolvePatternPropertyPointer(
  name: string,
  patternProperties: Record<string, unknown> | undefined,
  objectPtr: string
): string | undefined {
  if (!patternProperties) return undefined;
  const basePointer = appendPointer(objectPtr, 'patternProperties');
  for (const pattern of Object.keys(patternProperties)) {
    if (typeof pattern !== 'string') continue;
    try {
      const regex = new RegExp(pattern, 'u');
      if (!regex.test(name)) {
        continue;
      }
    } catch {
      continue;
    }
    return appendPointer(basePointer, pattern);
  }
  return undefined;
}

function classifyNode(canonPtr: string): NodeClassification {
  if (!canonPtr) {
    return { kind: 'schema' };
  }

  const segments = canonPtr.split('/').filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1] ?? '';
  const secondLast = segments[segments.length - 2] ?? '';

  if (secondLast === 'properties') {
    const propertyName = last.replace(/~1/g, '/').replace(/~0/g, '~');
    return {
      kind: 'property',
      meta: { propertyName },
    };
  }

  if (secondLast === 'oneOf' || secondLast === 'anyOf') {
    const index = Number.parseInt(last, 10);
    return {
      kind: 'branch',
      meta: {
        branchKind: secondLast,
        index: Number.isFinite(index) ? index : undefined,
      },
    };
  }

  if (last === 'if' || last === 'then' || last === 'else') {
    return {
      kind: 'branch',
      meta: { branchKind: last },
    };
  }

  return { kind: 'schema' };
}

function ensureNode(
  state: CoverageGraphBuildState,
  canonPtr: string
): { id: string; index: number } {
  const id = canonPtr === '' ? '#' : `#${canonPtr}`;
  const existingIndex = state.nodeIndexById.get(id);
  if (existingIndex !== undefined) {
    return { id, index: existingIndex };
  }

  const classification = classifyNode(canonPtr);
  const node = {
    id,
    kind: classification.kind,
    // Canonical JSON Pointer (root = '#')
    canonPath: canonPtr === '' ? '#' : `#${canonPtr}`,
    ...(classification.meta ? { meta: classification.meta } : {}),
  };
  const index = state.nodes.length;
  state.nodes.push(node);
  state.nodeIndexById.set(id, index);
  return { id, index };
}

function addStructuralEdge(
  state: CoverageGraphBuildState,
  fromId: string,
  toId: string
): void {
  if (fromId === toId) return;
  state.edges.push({
    from: fromId,
    to: toId,
    kind: 'structural',
  });
}

function visitSchemaNode(
  node: unknown,
  canonPtr: string,
  parentPtr: string | undefined,
  state: CoverageGraphBuildState
): void {
  if (!node || typeof node !== 'object') return;

  const self = ensureNode(state, canonPtr);
  if (parentPtr !== undefined) {
    const parent = ensureNode(state, parentPtr);
    addStructuralEdge(state, parent.id, self.id);
  }

  const schema = node as Record<string, unknown>;
  const requiredRaw = Array.isArray(schema.required)
    ? (schema.required as unknown[]).filter(
        (v): v is string => typeof v === 'string'
      )
    : [];
  const required = new Set<string>(requiredRaw);
  const patternPropertiesRecord =
    schema.patternProperties && typeof schema.patternProperties === 'object'
      ? (schema.patternProperties as Record<string, unknown>)
      : undefined;
  const declaredPropertyNames = new Set<string>();

  // Structural dimension: SCHEMA_NODE for every canonical schema node.
  if (state.enabledDimensions.has('structure')) {
    const canonPath = canonPtr === '' ? '#' : `#${canonPtr}`;
    const targetBase: CoverageTarget = {
      id: '',
      dimension: 'structure',
      kind: 'SCHEMA_NODE',
      canonPath,
    };
    const id = computeCoverageTargetId(targetBase, state.idContext);
    state.targets.push({ ...targetBase, id });
  }

  // Properties
  const properties = schema.properties;
  if (properties && typeof properties === 'object') {
    const propsRecord = properties as Record<string, unknown>;
    const basePtr = appendPointer(canonPtr, 'properties');
    for (const [propName, propSchema] of Object.entries(propsRecord)) {
      declaredPropertyNames.add(propName);
      const childPtr = appendPointer(basePtr, propName);
      if (state.enabledDimensions.has('structure')) {
        const propCanonPath = `#${childPtr}`;
        if (!required.has(propName)) {
          const propertyTargetBase: CoverageTarget = {
            id: '',
            dimension: 'structure',
            kind: 'PROPERTY_PRESENT',
            canonPath: propCanonPath,
            params: { propertyName: propName },
          };
          const tId = computeCoverageTargetId(
            propertyTargetBase,
            state.idContext
          );
          state.targets.push({ ...propertyTargetBase, id: tId });
        }
      }
      visitSchemaNode(propSchema, childPtr, canonPtr, state);
    }
  }

  if (
    state.enabledDimensions.has('structure') &&
    schema.additionalProperties === false
  ) {
    const coverageEntry = state.coverageIndex.get(canonPtr);
    const enumeratedNames = coverageEntry?.enumerate?.();
    if (
      coverageEntry &&
      Array.isArray(enumeratedNames) &&
      enumeratedNames.length > 0
    ) {
      const additionalPropsPtr = appendPointer(
        canonPtr,
        'additionalProperties'
      );
      const seenAdditionalNames = new Set<string>();
      for (const name of enumeratedNames) {
        if (typeof name !== 'string') continue;
        if (required.has(name) || declaredPropertyNames.has(name)) continue;
        if (seenAdditionalNames.has(name)) continue;
        if (!coverageEntry.has(name)) continue;
        const pointer =
          resolvePatternPropertyPointer(
            name,
            patternPropertiesRecord,
            canonPtr
          ) ?? additionalPropsPtr;
        const propertyCanonPath = pointer === '' ? '#' : `#${pointer}`;
        const propertyTargetBase: CoverageTarget = {
          id: '',
          dimension: 'structure',
          kind: 'PROPERTY_PRESENT',
          canonPath: propertyCanonPath,
          params: { propertyName: name },
        };
        const tId = computeCoverageTargetId(
          propertyTargetBase,
          state.idContext
        );
        state.targets.push({ ...propertyTargetBase, id: tId });
        seenAdditionalNames.add(name);
      }
    }
  }

  // oneOf / anyOf branches
  const anyOf = Array.isArray(schema.anyOf)
    ? (schema.anyOf as unknown[])
    : undefined;
  if (anyOf && anyOf.length > 0) {
    const anyOfPtr = appendPointer(canonPtr, 'anyOf');
    anyOf.forEach((branch, index) => {
      const branchPtr = appendPointer(anyOfPtr, String(index));
      if (state.enabledDimensions.has('branches')) {
        const branchCanonPath = `#${branchPtr}`;
        const branchTargetBase: CoverageTarget = {
          id: '',
          dimension: 'branches',
          kind: 'ANYOF_BRANCH',
          canonPath: branchCanonPath,
          params: { index },
        };
        const tId = computeCoverageTargetId(branchTargetBase, state.idContext);
        state.targets.push({ ...branchTargetBase, id: tId });
      }
      visitSchemaNode(branch, branchPtr, canonPtr, state);
    });
  }

  const oneOf = Array.isArray(schema.oneOf)
    ? (schema.oneOf as unknown[])
    : undefined;
  if (oneOf && oneOf.length > 0) {
    const oneOfPtr = appendPointer(canonPtr, 'oneOf');
    oneOf.forEach((branch, index) => {
      const branchPtr = appendPointer(oneOfPtr, String(index));
      if (state.enabledDimensions.has('branches')) {
        const branchCanonPath = `#${branchPtr}`;
        const branchTargetBase: CoverageTarget = {
          id: '',
          dimension: 'branches',
          kind: 'ONEOF_BRANCH',
          canonPath: branchCanonPath,
          params: { index },
        };
        const tId = computeCoverageTargetId(branchTargetBase, state.idContext);
        state.targets.push({ ...branchTargetBase, id: tId });
      }
      visitSchemaNode(branch, branchPtr, canonPtr, state);
    });
  }

  // Conditional branches
  if (schema.if && typeof schema.if === 'object') {
    if (state.enabledDimensions.has('branches')) {
      const baseCanonPath = canonPtr === '' ? '#' : `#${canonPtr}`;
      if (schema.then && typeof schema.then === 'object') {
        const thenTargetBase: CoverageTarget = {
          id: '',
          dimension: 'branches',
          kind: 'CONDITIONAL_PATH',
          canonPath: baseCanonPath,
          params: { pathKind: 'if+then' },
        };
        const tId = computeCoverageTargetId(thenTargetBase, state.idContext);
        state.targets.push({ ...thenTargetBase, id: tId });
      }
      if (schema.else && typeof schema.else === 'object') {
        const elseTargetBase: CoverageTarget = {
          id: '',
          dimension: 'branches',
          kind: 'CONDITIONAL_PATH',
          canonPath: baseCanonPath,
          params: { pathKind: 'if+else' },
        };
        const tId = computeCoverageTargetId(elseTargetBase, state.idContext);
        state.targets.push({ ...elseTargetBase, id: tId });
      }
    }
    visitSchemaNode(schema.if, appendPointer(canonPtr, 'if'), canonPtr, state);
  }
  if (schema.then && typeof schema.then === 'object') {
    visitSchemaNode(
      schema.then,
      appendPointer(canonPtr, 'then'),
      canonPtr,
      state
    );
  }
  if (schema.else && typeof schema.else === 'object') {
    visitSchemaNode(
      schema.else,
      appendPointer(canonPtr, 'else'),
      canonPtr,
      state
    );
  }

  // Selected structural children that introduce additional schema nodes
  if (schema.items && typeof schema.items === 'object') {
    visitSchemaNode(
      schema.items,
      appendPointer(canonPtr, 'items'),
      canonPtr,
      state
    );
  }

  if (schema.prefixItems && Array.isArray(schema.prefixItems)) {
    const prefixPtr = appendPointer(canonPtr, 'prefixItems');
    (schema.prefixItems as unknown[]).forEach((item, index) => {
      visitSchemaNode(
        item,
        appendPointer(prefixPtr, String(index)),
        canonPtr,
        state
      );
    });
  }

  if (schema.contains && typeof schema.contains === 'object') {
    visitSchemaNode(
      schema.contains,
      appendPointer(canonPtr, 'contains'),
      canonPtr,
      state
    );
  }

  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === 'object'
  ) {
    visitSchemaNode(
      schema.additionalProperties,
      appendPointer(canonPtr, 'additionalProperties'),
      canonPtr,
      state
    );
  }

  if (
    schema.unevaluatedProperties &&
    typeof schema.unevaluatedProperties === 'object'
  ) {
    visitSchemaNode(
      schema.unevaluatedProperties,
      appendPointer(canonPtr, 'unevaluatedProperties'),
      canonPtr,
      state
    );
  }

  if (schema.unevaluatedItems && typeof schema.unevaluatedItems === 'object') {
    visitSchemaNode(
      schema.unevaluatedItems,
      appendPointer(canonPtr, 'unevaluatedItems'),
      canonPtr,
      state
    );
  }

  if (schema.propertyNames && typeof schema.propertyNames === 'object') {
    visitSchemaNode(
      schema.propertyNames,
      appendPointer(canonPtr, 'propertyNames'),
      canonPtr,
      state
    );
  }

  // Enum targets (dimension: 'enum')
  if (state.enabledDimensions.has('enum') && Array.isArray(schema.enum)) {
    const values = schema.enum as unknown[];
    const canonPath = canonPtr === '' ? '#' : `#${canonPtr}`;
    values.forEach((value, enumIndex) => {
      const enumTargetBase: CoverageTarget = {
        id: '',
        dimension: 'enum',
        kind: 'ENUM_VALUE_HIT',
        canonPath,
        params: { enumIndex, value },
      };
      const tId = computeCoverageTargetId(enumTargetBase, state.idContext);
      state.targets.push({ ...enumTargetBase, id: tId });
    });
  }

  // Boundaries targets (dimension: 'boundaries')
  if (state.enabledDimensions.has('boundaries')) {
    const canonPath = canonPtr === '' ? '#' : `#${canonPtr}`;

    // Numeric boundaries
    const hasNumericHint =
      typeof schema.minimum === 'number' ||
      typeof schema.maximum === 'number' ||
      typeof schema.exclusiveMinimum === 'number' ||
      typeof schema.exclusiveMaximum === 'number';
    if (hasNumericHint) {
      const minimum =
        typeof schema.minimum === 'number' ? schema.minimum : undefined;
      const maximum =
        typeof schema.maximum === 'number' ? schema.maximum : undefined;
      const exclusiveMinimum =
        typeof schema.exclusiveMinimum === 'number'
          ? schema.exclusiveMinimum
          : undefined;
      const exclusiveMaximum =
        typeof schema.exclusiveMaximum === 'number'
          ? schema.exclusiveMaximum
          : undefined;

      if (minimum !== undefined) {
        const targetBase: CoverageTarget = {
          id: '',
          dimension: 'boundaries',
          kind: 'NUMERIC_MIN_HIT',
          canonPath,
          params: { boundaryKind: 'minimum', boundaryValue: minimum },
        };
        const tId = computeCoverageTargetId(targetBase, state.idContext);
        state.targets.push({ ...targetBase, id: tId });
      }
      if (exclusiveMinimum !== undefined) {
        const targetBase: CoverageTarget = {
          id: '',
          dimension: 'boundaries',
          kind: 'NUMERIC_MIN_HIT',
          canonPath,
          params: {
            boundaryKind: 'exclusiveMinimum',
            boundaryValue: exclusiveMinimum,
          },
        };
        const tId = computeCoverageTargetId(targetBase, state.idContext);
        state.targets.push({ ...targetBase, id: tId });
      }
      if (maximum !== undefined) {
        const targetBase: CoverageTarget = {
          id: '',
          dimension: 'boundaries',
          kind: 'NUMERIC_MAX_HIT',
          canonPath,
          params: { boundaryKind: 'maximum', boundaryValue: maximum },
        };
        const tId = computeCoverageTargetId(targetBase, state.idContext);
        state.targets.push({ ...targetBase, id: tId });
      }
      if (exclusiveMaximum !== undefined) {
        const targetBase: CoverageTarget = {
          id: '',
          dimension: 'boundaries',
          kind: 'NUMERIC_MAX_HIT',
          canonPath,
          params: {
            boundaryKind: 'exclusiveMaximum',
            boundaryValue: exclusiveMaximum,
          },
        };
        const tId = computeCoverageTargetId(targetBase, state.idContext);
        state.targets.push({ ...targetBase, id: tId });
      }
    }

    // String length boundaries
    const minLength =
      typeof schema.minLength === 'number' ? schema.minLength : undefined;
    const maxLength =
      typeof schema.maxLength === 'number' ? schema.maxLength : undefined;
    if (minLength !== undefined) {
      const targetBase: CoverageTarget = {
        id: '',
        dimension: 'boundaries',
        kind: 'STRING_MIN_LENGTH_HIT',
        canonPath,
        params: { boundaryKind: 'minLength', boundaryValue: minLength },
      };
      const tId = computeCoverageTargetId(targetBase, state.idContext);
      state.targets.push({ ...targetBase, id: tId });
    }
    if (maxLength !== undefined) {
      const targetBase: CoverageTarget = {
        id: '',
        dimension: 'boundaries',
        kind: 'STRING_MAX_LENGTH_HIT',
        canonPath,
        params: { boundaryKind: 'maxLength', boundaryValue: maxLength },
      };
      const tId = computeCoverageTargetId(targetBase, state.idContext);
      state.targets.push({ ...targetBase, id: tId });
    }

    // Array length boundaries
    const minItems =
      typeof schema.minItems === 'number' ? schema.minItems : undefined;
    const maxItems =
      typeof schema.maxItems === 'number' ? schema.maxItems : undefined;
    if (minItems !== undefined) {
      const targetBase: CoverageTarget = {
        id: '',
        dimension: 'boundaries',
        kind: 'ARRAY_MIN_ITEMS_HIT',
        canonPath,
        params: { boundaryKind: 'minItems', boundaryValue: minItems },
      };
      const tId = computeCoverageTargetId(targetBase, state.idContext);
      state.targets.push({ ...targetBase, id: tId });
    }
    if (maxItems !== undefined) {
      const targetBase: CoverageTarget = {
        id: '',
        dimension: 'boundaries',
        kind: 'ARRAY_MAX_ITEMS_HIT',
        canonPath,
        params: { boundaryKind: 'maxItems', boundaryValue: maxItems },
      };
      const tId = computeCoverageTargetId(targetBase, state.idContext);
      state.targets.push({ ...targetBase, id: tId });
    }
  }
}

export function analyzeCoverage(
  input: CoverageAnalyzerInput
): CoverageAnalyzerResult {
  const enabledDimensions: CoverageDimension[] = input.dimensionsEnabled ?? [
    'structure',
    'branches',
    'enum',
  ];
  const idContext = createCoverageTargetIdContext({
    engineVersion: '0.0.0',
  });

  const enabledSet = new Set(enabledDimensions);

  const state: CoverageGraphBuildState = {
    nodes: [],
    edges: [],
    nodeIndexById: new Map(),
    targets: [],
    enabledDimensions: enabledSet,
    idContext,
    coverageIndex: input.coverageIndex,
  };

  // Root schema node at the canonical root.
  visitSchemaNode(input.canonSchema, '', undefined, state);

  attachOpenApiOperationNodes({
    rootSchema: input.canonSchema,
    graph: { nodes: state.nodes, edges: state.edges },
    targets: state.targets,
    enabledDimensions: enabledSet,
    idContext,
  });

  const updatedTargets = applyUnreachableStatusToTargets(
    state.targets,
    input.planDiag
  );

  return {
    graph: { nodes: state.nodes, edges: state.edges },
    targets: updatedTargets,
  };
}
