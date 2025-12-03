import { describe, expect, it } from 'vitest';
import {
  GValidMotif,
  makeGValidMotif,
  makeGValidNone,
} from '../g-valid-classifier.js';

describe('GValid motif types and API', () => {
  it('creates a non-G_valid entry with motif "none"', () => {
    const info = makeGValidNone('#');

    expect(info.canonPath).toBe('#');
    expect(info.motif).toBe(GValidMotif.None);
    expect(info.isGValid).toBe(false);
  });

  it('creates baseline G_valid entries for simple motifs', () => {
    const objectInfo = makeGValidMotif(
      '#/properties/item',
      GValidMotif.SimpleObjectRequired
    );
    const arrayInfo = makeGValidMotif(
      '#/items',
      GValidMotif.ArrayItemsContainsSimple
    );

    expect(objectInfo.isGValid).toBe(true);
    expect(objectInfo.motif).toBe(GValidMotif.SimpleObjectRequired);
    expect(arrayInfo.isGValid).toBe(true);
    expect(arrayInfo.motif).toBe(GValidMotif.ArrayItemsContainsSimple);
  });
});
