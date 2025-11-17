import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_CODES } from '../../src/diag/codes.js';
import { normalizeSchema } from '../unit/test-helpers.js';
import asyncapiEmbedded from '../fixtures/asyncapi-3.0-embedded.json';

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

describe('SchemaNormalizer – AsyncAPI embedded metaschemas', () => {
  it('rewrites #/definitions/... within each $id scope and preserves origins', () => {
    const result = normalizeSchema(asyncapiEmbedded);
    const canonical = result.schema as any;

    // Draft-07 metaschema subtree
    const draft7Id = 'http://json-schema.org/draft-07/schema';
    const draft7 = canonical.$defs?.[draft7Id];
    expect(draft7).toBeDefined();
    expect(draft7.properties?.maxLength?.$ref).toBe(
      '#/$defs/nonNegativeInteger'
    );

    const draft7KeyEscaped = escapeJsonPointerSegment(draft7Id);
    const draft7CanonPtr = `/$defs/${draft7KeyEscaped}/properties/maxLength/$ref`;
    const draft7OriginPtr = `/definitions/${draft7KeyEscaped}/properties/maxLength/$ref`;
    expect(result.ptrMap.get(draft7CanonPtr)).toBe(draft7OriginPtr);

    // OpenAPI lift metaschema subtree
    const openapiId =
      'http://asyncapi.com/definitions/3.0.0/openapiSchema_3_0.json';
    const openapi = canonical.$defs?.[openapiId];
    expect(openapi).toBeDefined();
    expect(openapi.oneOf?.[1]?.$ref).toBe('#/$defs/Reference');

    const openapiKeyEscaped = escapeJsonPointerSegment(openapiId);
    const openapiCanonPtr = `/$defs/${openapiKeyEscaped}/oneOf/1/$ref`;
    const openapiOriginPtr = `/definitions/${openapiKeyEscaped}/oneOf/1/$ref`;
    expect(result.ptrMap.get(openapiCanonPtr)).toBe(openapiOriginPtr);

    // No scoped DEFS_TARGET_MISSING notes for embedded metaschemas
    const defsMissing = result.notes.filter(
      (n) => n.code === DIAGNOSTIC_CODES.DEFS_TARGET_MISSING
    );
    expect(defsMissing.length).toBe(0);
  });
});
