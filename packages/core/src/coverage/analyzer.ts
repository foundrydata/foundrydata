/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import type { CoverageTarget } from '@foundrydata/shared';
import type { CoverageGraph, CoverageGraphNodeKind } from './index.js';
import type {
  CoverageIndex,
  ComposeDiagnostics,
} from '../transform/composition-engine.js';

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
}

export interface CoverageAnalyzerResult {
  graph: CoverageGraph;
  targets: CoverageTarget[];
}

interface CoverageGraphBuildState {
  nodes: CoverageGraph['nodes'];
  edges: CoverageGraph['edges'];
  nodeIndexById: Map<string, number>;
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
  const key = `${fromId}→${toId}:structural`;
  if (!state.nodeIndexById.has(key)) {
    state.edges.push({
      from: fromId,
      to: toId,
      kind: 'structural',
    });
  }
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

  // Properties
  const properties = schema.properties;
  if (properties && typeof properties === 'object') {
    const propsRecord = properties as Record<string, unknown>;
    const basePtr = appendPointer(canonPtr, 'properties');
    for (const [propName, propSchema] of Object.entries(propsRecord)) {
      const childPtr = appendPointer(basePtr, propName);
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
      visitSchemaNode(branch, branchPtr, canonPtr, state);
    });
  }

  // Conditional branches
  if (schema.if && typeof schema.if === 'object') {
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
}

export function analyzeCoverage(
  input: CoverageAnalyzerInput
): CoverageAnalyzerResult {
  const state: CoverageGraphBuildState = {
    nodes: [],
    edges: [],
    nodeIndexById: new Map(),
  };

  // Root schema node at the canonical root.
  visitSchemaNode(input.canonSchema, '', undefined, state);

  return {
    graph: { nodes: state.nodes, edges: state.edges },
    targets: [],
  };
}
