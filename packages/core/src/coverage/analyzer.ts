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
}

function buildUnsatPathSet(planDiag?: ComposeDiagnostics): Set<string> {
  const unsatPaths = new Set<string>();
  if (!planDiag) return unsatPaths;

  const strongUnsatCodes = new Set<string>([
    'UNSAT_AP_FALSE_EMPTY_COVERAGE',
    'UNSAT_NUMERIC_BOUNDS',
    'UNSAT_REQUIRED_AP_FALSE',
    'UNSAT_REQUIRED_VS_PROPERTYNAMES',
    'UNSAT_DEPENDENT_REQUIRED_AP_FALSE',
    'UNSAT_MINPROPERTIES_VS_COVERAGE',
    'UNSAT_MINPROPS_PNAMES',
  ]);

  const addIfStrong = (code: string, canonPath: string): void => {
    if (!canonPath) return;
    if (strongUnsatCodes.has(code)) {
      unsatPaths.add(canonPath);
    }
  };

  for (const entry of planDiag.fatal ?? []) {
    addIfStrong(entry.code, entry.canonPath);
  }

  for (const hint of planDiag.unsatHints ?? []) {
    if (hint.provable === true) {
      addIfStrong(hint.code, hint.canonPath);
    }
  }

  return unsatPaths;
}

function isUnderUnsatPath(
  targetCanonPath: string,
  unsatPaths: Set<string>
): boolean {
  if (unsatPaths.size === 0) return false;
  for (const unsatPath of unsatPaths) {
    if (!unsatPath) continue;
    if (targetCanonPath === unsatPath) return true;
    if (
      targetCanonPath.startsWith(unsatPath) &&
      (targetCanonPath.length === unsatPath.length ||
        targetCanonPath.charAt(unsatPath.length) === '/' ||
        (unsatPath.endsWith('/') && targetCanonPath.startsWith(unsatPath)))
    ) {
      return true;
    }
  }
  return false;
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
    const requiredRaw = Array.isArray(schema.required)
      ? (schema.required as unknown[]).filter(
          (v): v is string => typeof v === 'string'
        )
      : [];
    const required = new Set<string>(requiredRaw);
    for (const [propName, propSchema] of Object.entries(propsRecord)) {
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

  const state: CoverageGraphBuildState = {
    nodes: [],
    edges: [],
    nodeIndexById: new Map(),
    targets: [],
    enabledDimensions: new Set(enabledDimensions),
    idContext,
  };

  // Root schema node at the canonical root.
  visitSchemaNode(input.canonSchema, '', undefined, state);

  const unsatPaths = buildUnsatPathSet(input.planDiag);
  if (unsatPaths.size > 0) {
    const updatedTargets: CoverageTarget[] = state.targets.map((t) => {
      const canonPath = t.canonPath || '';
      if (isUnderUnsatPath(canonPath, unsatPaths)) {
        return {
          ...t,
          status:
            t.kind === 'SCHEMA_REUSED_COVERED' ? 'deprecated' : 'unreachable',
        } as CoverageTarget;
      }
      return t;
    });
    state.targets = updatedTargets;
  }

  return {
    graph: { nodes: state.nodes, edges: state.edges },
    targets: state.targets,
  };
}
