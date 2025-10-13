// REFONLY::{"anchors":["spec://§7#contract","spec://§22#packages-core"],"summary":"Bidirectional JSON Pointer mapping utilities for canonical→original traces"}

export type CanonicalPointer = string;
export type OriginalPointer = string;

export interface PtrMapping {
  ptrMap: Map<CanonicalPointer, OriginalPointer>;
  revPtrMap: Map<OriginalPointer, CanonicalPointer[]>;
}

export function createPtrMapping(
  initial?: Iterable<[CanonicalPointer, OriginalPointer]>
): PtrMapping {
  const mapping: PtrMapping = {
    ptrMap: new Map(),
    revPtrMap: new Map(),
  };
  if (initial) {
    for (const [canonPath, origPath] of initial) {
      mapCanonToOrig(mapping, canonPath, origPath);
    }
  }
  return mapping;
}

export function mapCanonToOrig(
  mapping: PtrMapping,
  canonPath: CanonicalPointer,
  origPath: OriginalPointer
): void {
  assertJsonPointer(canonPath, 'canonPath');
  assertJsonPointer(origPath, 'origPath');

  const { ptrMap, revPtrMap } = mapping;

  const previous = ptrMap.get(canonPath);
  if (previous === origPath) return;

  if (previous !== undefined) {
    const priorList = revPtrMap.get(previous);
    if (priorList) {
      removeValue(priorList, canonPath);
      if (priorList.length === 0) {
        revPtrMap.delete(previous);
      }
    }
  }

  ptrMap.set(canonPath, origPath);

  const list = revPtrMap.get(origPath);
  if (list) {
    insertSorted(list, canonPath);
  } else {
    revPtrMap.set(origPath, [canonPath]);
  }
}

export function mapOrigToCanon(
  mapping: PtrMapping,
  origPath: OriginalPointer
): readonly CanonicalPointer[] | undefined {
  assertJsonPointer(origPath, 'origPath');
  const list = mapping.revPtrMap.get(origPath);
  return list ? list.slice() : undefined;
}

export function toOriginalByWalk(
  canonPath: CanonicalPointer,
  mapCanonToOrigMap: Map<CanonicalPointer, OriginalPointer>
): OriginalPointer | undefined {
  let pointer = canonPath;
  while (true) {
    if (mapCanonToOrigMap.has(pointer)) {
      return mapCanonToOrigMap.get(pointer)!;
    }
    const idx = pointer.lastIndexOf('/');
    if (idx <= 0) return undefined;
    pointer = pointer.slice(0, idx);
  }
}

function assertJsonPointer(
  value: string,
  label: 'canonPath' | 'origPath'
): void {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string`);
  }
  if (value === '') return;
  if (!value.startsWith('/')) {
    throw new Error(`${label} must be '' or start with '/'`);
  }
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '~') {
      const next = value[i + 1];
      if (next !== '0' && next !== '1') {
        throw new Error(`${label} contains invalid escape in JSON Pointer`);
      }
      i++;
    }
  }
}

function removeValue(list: string[], value: string): void {
  const index = list.indexOf(value);
  if (index >= 0) {
    list.splice(index, 1);
  }
}

function insertSorted(list: string[], value: string): void {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const current = list[mid];
    if (current === value) return;
    if (current < value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  list.splice(lo, 0, value);
}
