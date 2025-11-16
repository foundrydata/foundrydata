import { describe, expect, it } from 'vitest';
import {
  createPtrMapping,
  mapCanonToOrig,
  mapOrigToCanon,
  toOriginalByWalk,
} from '../ptr-map';

describe('ptr-map utilities', () => {
  it('records bidirectional mappings with deterministic ordering', () => {
    const mapping = createPtrMapping();

    mapCanonToOrig(mapping, '/z', '/orig/z');
    mapCanonToOrig(mapping, '/a', '/orig/shared');
    mapCanonToOrig(mapping, '/c', '/orig/shared');
    mapCanonToOrig(mapping, '/b', '/orig/shared');

    expect(mapping.ptrMap.get('/a')).toBe('/orig/shared');
    expect(mapping.ptrMap.get('/z')).toBe('/orig/z');

    const reverse = mapOrigToCanon(mapping, '/orig/shared');
    expect(reverse).toEqual(['/a', '/b', '/c']);
  });

  it('supports initial mappings when creating the container', () => {
    const mapping = createPtrMapping([
      ['', ''],
      ['/properties/name', '/properties/name'],
    ]);

    expect(mapping.ptrMap.size).toBe(2);
    expect(mapping.ptrMap.get('')).toBe('');
    expect(mapping.ptrMap.get('/properties/name')).toBe('/properties/name');

    const reverse = mapOrigToCanon(mapping, '/properties/name');
    expect(reverse).toEqual(['/properties/name']);
  });

  it('updates reverse map when remapping canonical pointers', () => {
    const mapping = createPtrMapping();

    mapCanonToOrig(mapping, '/anyOf/0', '/orig/a');
    mapCanonToOrig(mapping, '/anyOf/1', '/orig/b');

    mapCanonToOrig(mapping, '/anyOf/0', '/orig/c');

    expect(mapOrigToCanon(mapping, '/orig/a')).toBeUndefined();
    expect(mapOrigToCanon(mapping, '/orig/c')).toEqual(['/anyOf/0']);
  });

  it('returns defensive copies from reverse lookups', () => {
    const mapping = createPtrMapping();
    mapCanonToOrig(mapping, '/foo', '/shared');
    mapCanonToOrig(mapping, '/bar', '/shared');

    const first = mapOrigToCanon(mapping, '/shared');
    expect(first).toEqual(['/bar', '/foo']);

    if (first) {
      (first as string[]).push('/mutated');
    }

    const second = mapOrigToCanon(mapping, '/shared');
    expect(second).toEqual(['/bar', '/foo']);
  });

  it('performs longest-prefix resolution for synthetic nodes', () => {
    const mapping = createPtrMapping([
      ['', ''],
      ['/properties/user', '/properties/user'],
    ]);

    mapCanonToOrig(
      mapping,
      '/properties/user/properties/id',
      '/properties/user/properties/id'
    );

    expect(
      toOriginalByWalk('/properties/user/oneOf/0/properties/id', mapping.ptrMap)
    ).toBe('/properties/user');

    expect(
      toOriginalByWalk('/properties/user/properties/id/type', mapping.ptrMap)
    ).toBe('/properties/user/properties/id');

    expect(toOriginalByWalk('/missing/path', mapping.ptrMap)).toBeUndefined();
  });

  it('rejects invalid JSON pointer shapes', () => {
    const mapping = createPtrMapping();
    expect(() => mapCanonToOrig(mapping, 'not-a-pointer', '/orig/a')).toThrow(
      /canonPath/
    );
    expect(() => mapCanonToOrig(mapping, '/canon', 'orig')).toThrow(/origPath/);
    expect(() => mapCanonToOrig(mapping, '/canon/~x', '/orig/~1')).toThrow(
      /canonPath/
    );
  });
});
