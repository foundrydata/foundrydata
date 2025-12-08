export interface GValidVisitContext {
  hasUnevaluatedGuard: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSimpleObjectType(node: Record<string, unknown>): boolean {
  const type = node.type;
  return !type || type === 'object';
}

function hasDisallowedComposition(node: Record<string, unknown>): boolean {
  return Boolean(node.anyOf || node.oneOf || node.not || node.if);
}

function hasLocalUnevaluated(node: Record<string, unknown>): boolean {
  return (
    node.unevaluatedProperties !== undefined ||
    node.unevaluatedItems !== undefined
  );
}

function hasUnevaluatedGuard(
  schema: Record<string, unknown> | undefined
): boolean {
  if (!schema) return false;
  const queue: Record<string, unknown>[] = [schema];
  const seen = new Set<Record<string, unknown>>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    if (
      current.unevaluatedProperties === false ||
      current.unevaluatedItems === false
    ) {
      return true;
    }
    const allOf = Array.isArray(current.allOf)
      ? (current.allOf as unknown[])
      : undefined;
    if (!allOf) continue;
    for (const entry of allOf) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        queue.push(entry as Record<string, unknown>);
      }
    }
  }
  return false;
}

function isSimpleObjectBranch(
  branch: Record<string, unknown>,
  ctx: GValidVisitContext
): boolean {
  if (!isSimpleObjectType(branch)) return false;
  if (branch.additionalProperties === false) return false;
  if (hasLocalUnevaluated(branch)) return false;
  if (hasDisallowedComposition(branch)) return false;
  if (ctx.hasUnevaluatedGuard || hasUnevaluatedGuard(branch)) return false;
  const props =
    branch.properties && typeof branch.properties === 'object'
      ? (branch.properties as Record<string, unknown>)
      : undefined;
  return Boolean(props && Object.keys(props).length > 0);
}

interface IfBranches {
  ifSchema: Record<string, unknown>;
  thenSchema: Record<string, unknown>;
  elseSchema?: Record<string, unknown>;
}

function extractIfBranches(
  schema: Record<string, unknown>
): IfBranches | undefined {
  const ifSchema =
    schema.if && typeof schema.if === 'object'
      ? (schema.if as Record<string, unknown>)
      : undefined;
  const thenSchema =
    schema.then && typeof schema.then === 'object'
      ? (schema.then as Record<string, unknown>)
      : undefined;
  const elseSchema =
    schema.else && typeof schema.else === 'object'
      ? (schema.else as Record<string, unknown>)
      : undefined;
  if (!ifSchema || !thenSchema) return undefined;
  return { ifSchema, thenSchema, elseSchema };
}

interface GuardPropertySchema {
  const?: unknown;
  enum?: unknown[];
  [key: string]: unknown;
}

function hasAllowedIfGuardShape(schema: Record<string, unknown>): boolean {
  if (schema.anyOf || schema.oneOf || schema.not || schema.if) {
    return false;
  }
  return true;
}

function getGuardPropertySchema(
  schema: Record<string, unknown>
): GuardPropertySchema | undefined {
  const props =
    schema.properties && typeof schema.properties === 'object'
      ? (schema.properties as Record<string, unknown>)
      : {};
  const names = Object.keys(props);
  if (names.length !== 1) return undefined;
  const name = names[0]!;
  const sub = props[name] as GuardPropertySchema | undefined;
  if (!sub || typeof sub !== 'object' || Array.isArray(sub)) {
    return undefined;
  }
  return sub;
}

function hasDeterministicGuardValues(sub: GuardPropertySchema): boolean {
  const enumValues = Array.isArray(sub.enum) ? sub.enum : undefined;
  const hasConst = Object.prototype.hasOwnProperty.call(sub, 'const');
  if (!hasConst && (!enumValues || enumValues.length === 0)) {
    return false;
  }
  if (enumValues && enumValues.length > 8) {
    return false;
  }
  return true;
}

function isDeterministicIfClause(schema: Record<string, unknown>): boolean {
  if (!hasAllowedIfGuardShape(schema)) {
    return false;
  }
  const sub = getGuardPropertySchema(schema);
  if (!sub || typeof sub !== 'object' || Array.isArray(sub)) return false;
  return hasDeterministicGuardValues(sub);
}

export function isSimpleConditionalCandidate(
  schema: Record<string, unknown>,
  ctx: GValidVisitContext
): boolean {
  if (!hasSimpleConditionalRootShape(schema, ctx)) return false;

  const branches = extractIfBranches(schema);
  if (!branches) return false;
  if (!isDeterministicIfClause(branches.ifSchema)) return false;

  const thenCtx: GValidVisitContext = {
    hasUnevaluatedGuard:
      ctx.hasUnevaluatedGuard || hasUnevaluatedGuard(branches.thenSchema),
  };
  if (!isSimpleObjectBranch(branches.thenSchema, thenCtx)) return false;

  if (branches.elseSchema) {
    const elseCtx: GValidVisitContext = {
      hasUnevaluatedGuard:
        ctx.hasUnevaluatedGuard || hasUnevaluatedGuard(branches.elseSchema),
    };
    if (!isSimpleObjectBranch(branches.elseSchema, elseCtx)) return false;
  }

  return true;
}

function hasSimpleConditionalRootShape(
  schema: Record<string, unknown>,
  ctx: GValidVisitContext
): boolean {
  if (ctx.hasUnevaluatedGuard) return false;
  if (!isSimpleObjectType(schema)) return false;
  // At the root of a conditional motif we allow a single if/then/else;
  // only anyOf/oneOf/not are considered disallowed composition here.
  if (schema.anyOf || schema.oneOf || schema.not) return false;
  if (schema.additionalProperties === false) return false;
  if (hasLocalUnevaluated(schema)) return false;
  return true;
}

function hasDiscriminatedUnionShape(
  schema: Record<string, unknown>,
  ctx: GValidVisitContext
): boolean {
  if (ctx.hasUnevaluatedGuard) return false;
  if (!Array.isArray(schema.oneOf) || schema.oneOf.length === 0) {
    return false;
  }
  if (!isSimpleObjectType(schema)) return false;
  if (schema.anyOf || schema.not || schema.if) return false;
  return true;
}

function collectSimpleBranches(
  schema: Record<string, unknown>,
  ctx: GValidVisitContext
): Record<string, unknown>[] {
  const rawBranches = Array.isArray(schema.oneOf)
    ? (schema.oneOf as unknown[])
    : [];
  const branches: Record<string, unknown>[] = [];
  for (const value of rawBranches) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const branch = value as Record<string, unknown>;
    if (!isSimpleObjectBranch(branch, ctx)) {
      return [];
    }
    branches.push(branch);
  }
  return branches;
}

function inferDiscriminatorProperty(
  branches: Record<string, unknown>[]
): string | undefined {
  const first = branches[0];
  if (!first || !isRecord(first.properties)) return undefined;
  const firstProps = first.properties as Record<string, unknown>;
  const candidateNames = Object.keys(firstProps).filter((name) => {
    const raw = firstProps[name];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const sub = raw as GuardPropertySchema;
    const hasConst = Object.prototype.hasOwnProperty.call(sub, 'const');
    const enumValues = Array.isArray(sub.enum) ? sub.enum : undefined;
    return hasConst || (enumValues && enumValues.length > 0);
  });
  if (candidateNames.length !== 1) return undefined;
  return candidateNames[0];
}

function discriminatorValuesAreDistinct(
  branches: Record<string, unknown>[],
  discName: string
): boolean {
  const seenValues = new Set<string>();
  for (const branch of branches) {
    const props =
      branch.properties && typeof branch.properties === 'object'
        ? (branch.properties as Record<string, unknown>)
        : {};
    const raw = props[discName];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const sub = raw as GuardPropertySchema;
    const values = Array.isArray(sub.enum)
      ? sub.enum
      : Object.prototype.hasOwnProperty.call(sub, 'const')
        ? [sub.const]
        : undefined;
    if (!values || values.length === 0) return false;
    const first = values[0];
    const key = JSON.stringify(first);
    if (seenValues.has(key)) return false;
    seenValues.add(key);
  }
  return true;
}

export function isDiscriminatedUnionCandidate(
  schema: Record<string, unknown>,
  ctx: GValidVisitContext
): boolean {
  if (!hasDiscriminatedUnionShape(schema, ctx)) return false;
  const branches = collectSimpleBranches(schema, ctx);
  if (branches.length === 0) return false;
  const discName = inferDiscriminatorProperty(branches);
  if (!discName) return false;
  return discriminatorValuesAreDistinct(branches, discName);
}
