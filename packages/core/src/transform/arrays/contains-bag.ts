/* eslint-disable complexity */
export interface ContainsNeed {
  schema: unknown;
  min?: number;
  max?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function collectContainsNeeds(
  schema: Record<string, unknown>
): ContainsNeed[] {
  const needs: ContainsNeed[] = [];
  const direct = makeContainsNeed(schema);
  if (direct) {
    needs.push(direct);
  }
  const allOf = Array.isArray(schema.allOf) ? schema.allOf : undefined;
  if (allOf) {
    for (const branch of allOf) {
      if (isRecord(branch)) {
        needs.push(...collectContainsNeeds(branch));
      }
    }
  }
  return needs;
}

export function applyContainsSubsumption(
  needs: ContainsNeed[]
): ContainsNeed[] {
  if (needs.length <= 1) {
    return needs;
  }

  const keep = needs.map(() => true);
  for (let i = 0; i < needs.length; i += 1) {
    if (!keep[i]) continue;
    const narrow = needs[i]!;
    for (let j = 0; j < needs.length; j += 1) {
      if (i === j || !keep[j]) continue;
      const broad = needs[j]!;
      if (canSubsumeNeed(narrow, broad)) {
        keep[j] = false;
      }
    }
  }
  return needs.filter((_, index) => keep[index]);
}

function canSubsumeNeed(narrow: ContainsNeed, broad: ContainsNeed): boolean {
  if (broad.max !== undefined) {
    return false;
  }
  if (narrow.max !== undefined) {
    return false;
  }
  const narrowMin =
    typeof narrow.min === 'number' && Number.isFinite(narrow.min)
      ? narrow.min
      : 1;
  const broadMin =
    typeof broad.min === 'number' && Number.isFinite(broad.min) ? broad.min : 1;
  if (narrowMin <= broadMin) {
    return false;
  }
  return isSchemaSubset(narrow.schema, broad.schema);
}

function makeContainsNeed(
  schema: Record<string, unknown>
): ContainsNeed | undefined {
  if (!('contains' in schema)) return undefined;
  const containsSchema = schema.contains;
  if (containsSchema === undefined) return undefined;
  const minValue =
    typeof schema.minContains === 'number' ? schema.minContains : undefined;
  const maxValue =
    typeof schema.maxContains === 'number' ? schema.maxContains : undefined;
  const need: ContainsNeed = {
    schema: containsSchema,
    min: minValue ?? 1,
  };
  if (maxValue !== undefined) {
    need.max = maxValue;
  }
  return need;
}

export function computeEffectiveMaxItems(schema: unknown): number | undefined {
  if (!isRecord(schema)) return undefined;
  let candidate: number | undefined;
  if (typeof schema.maxItems === 'number' && Number.isFinite(schema.maxItems)) {
    candidate = schema.maxItems;
  }
  const tupleCap = inferTupleMaxLen(schema);
  if (tupleCap !== undefined) {
    candidate =
      candidate === undefined ? tupleCap : Math.min(candidate, tupleCap);
  }
  const allOf = Array.isArray(schema.allOf) ? schema.allOf : undefined;
  if (allOf) {
    for (const branch of allOf) {
      const branchMax = computeEffectiveMaxItems(branch);
      if (branchMax !== undefined) {
        candidate =
          candidate === undefined ? branchMax : Math.min(candidate, branchMax);
      }
    }
  }
  return candidate;
}

function inferTupleMaxLen(schema: Record<string, unknown>): number | undefined {
  if (schema.items === false) {
    if (Array.isArray(schema.prefixItems)) {
      return (schema.prefixItems as unknown[]).length;
    }
    return 0;
  }
  return undefined;
}

export function areNeedsPairwiseDisjoint(
  needs: Array<{ schema: unknown }>
): boolean {
  for (let i = 0; i < needs.length; i += 1) {
    for (let j = i + 1; j < needs.length; j += 1) {
      const left = needs[i]!;
      const right = needs[j]!;
      if (!areSchemasDisjoint(left.schema, right.schema)) {
        return false;
      }
    }
  }
  return true;
}

function areSchemasDisjoint(a: unknown, b: unknown): boolean {
  if (!isRecord(a) || !isRecord(b)) return false;

  const constA = getConstValue(a);
  const constB = getConstValue(b);
  if (constA !== undefined && constB !== undefined) {
    return stableStringify(constA) !== stableStringify(constB);
  }

  if (constA !== undefined) {
    const enumB = getEnumSet(b);
    if (enumB && !enumB.has(stableStringify(constA))) {
      return true;
    }
  }

  if (constB !== undefined) {
    const enumA = getEnumSet(a);
    if (enumA && !enumA.has(stableStringify(constB))) {
      return true;
    }
  }

  const enumA = getEnumSet(a);
  const enumB = getEnumSet(b);
  if (enumA && enumB) {
    for (const value of enumA) {
      if (enumB.has(value)) {
        return false;
      }
    }
    return true;
  }

  const typesA = getTypeSet(a);
  const typesB = getTypeSet(b);
  if (typesA && typesB) {
    return typeSetsDisjoint(typesA, typesB);
  }

  return false;
}

function getConstValue(schema: Record<string, unknown>): unknown | undefined {
  return schema.const;
}

function getEnumSet(schema: Record<string, unknown>): Set<string> | undefined {
  if (!Array.isArray(schema.enum)) return undefined;
  const set = new Set<string>();
  for (const entry of schema.enum as unknown[]) {
    set.add(stableStringify(entry));
  }
  return set;
}

function getTypeSet(schema: Record<string, unknown>): Set<string> | undefined {
  const typeValue = schema.type;
  if (typeof typeValue === 'string') {
    return new Set([typeValue]);
  }
  if (Array.isArray(typeValue)) {
    const set = new Set<string>();
    for (const entry of typeValue) {
      if (typeof entry === 'string') {
        set.add(entry);
      }
    }
    return set.size > 0 ? set : undefined;
  }
  return undefined;
}

function typesOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  if (a === 'integer' && b === 'number') return true;
  if (a === 'number' && b === 'integer') return true;
  return false;
}

function typeSetsDisjoint(setA: Set<string>, setB: Set<string>): boolean {
  for (const ta of setA) {
    for (const tb of setB) {
      if (typesOverlap(ta, tb)) {
        return false;
      }
    }
  }
  return true;
}

function typeSetSubset(setA: Set<string>, setB: Set<string>): boolean {
  for (const ta of setA) {
    if (setB.has(ta)) continue;
    if (ta === 'integer' && setB.has('number')) continue;
    return false;
  }
  return true;
}

export function isSchemaSubset(a: unknown, b: unknown): boolean {
  if (!isRecord(a) || !isRecord(b)) return false;

  const constA = getConstValue(a);
  const constB = getConstValue(b);
  if (
    constA !== undefined &&
    constB !== undefined &&
    stableStringify(constA) === stableStringify(constB)
  ) {
    return true;
  }

  if (constA !== undefined) {
    const enumB = getEnumSet(b);
    if (enumB && enumB.has(stableStringify(constA))) {
      return true;
    }
  }

  const enumA = getEnumSet(a);
  const enumB = getEnumSet(b);
  if (enumA && enumB) {
    let subset = true;
    for (const value of enumA) {
      if (!enumB.has(value)) {
        subset = false;
        break;
      }
    }
    if (subset) return true;
  }

  const typesA = getTypeSet(a);
  const typesB = getTypeSet(b);
  if (typesA && typesB && typeSetSubset(typesA, typesB)) {
    return true;
  }

  const allOfA = Array.isArray(a.allOf) ? (a.allOf as unknown[]) : undefined;
  if (allOfA) {
    return allOfA.every((entry) => isSchemaSubset(entry, b));
  }

  return false;
}

function normalizeForStableStringify(
  value: unknown,
  seen: WeakSet<object>
): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value as object)) {
    return undefined;
  }
  seen.add(value as object);
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) =>
      normalizeForStableStringify(item, seen)
    );
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b)
  );
  const normalized: Record<string, unknown> = {};
  for (const [key, val] of entries) {
    normalized[key] = normalizeForStableStringify(val, seen);
  }
  return normalized;
}

function stableStringify(value: unknown): string {
  const normalized = normalizeForStableStringify(value, new WeakSet());
  return JSON.stringify(normalized);
}
