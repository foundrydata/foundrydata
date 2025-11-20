import { describe, expect, it } from 'vitest';
import type Ajv from 'ajv';
import {
  hydrateSourceAjvFromRegistry,
  type RegistryDoc,
} from '../../src/resolver/hydrateSourceAjvFromRegistry.js';
import type { ResolverDiagnosticNote } from '../../src/resolver/options.js';

class MockAjv {
  public addedSchemas: string[] = [];
  public metaSchemas: string[] = [];

  getSchema(key: string): unknown {
    if (this.metaSchemas.includes(key)) {
      return { schema: {} };
    }
    if (this.addedSchemas.includes(key)) {
      return () => true;
    }
    return undefined;
  }

  addSchema(_schema: unknown, key?: string): void {
    this.addedSchemas.push(key ?? '');
  }

  addMetaSchema(schema: unknown): void {
    const id = (schema as Record<string, unknown>).$id;
    this.metaSchemas.push(
      typeof id === 'string' ? id : `meta-${this.metaSchemas.length}`
    );
  }
}

describe('hydrateSourceAjvFromRegistry', () => {
  it('adds registry docs once and records duplicate id skips', () => {
    const docs: RegistryDoc[] = [
      {
        uri: 'https://example.com/a.json',
        schema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'https://example.com/a.json',
          type: 'string',
        },
      },
      {
        uri: 'https://example.com/b.json',
        schema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          $id: 'https://example.com/a.json',
          type: 'number',
        },
      },
    ];
    const notes: ResolverDiagnosticNote[] = [];
    const ajv = new MockAjv();

    hydrateSourceAjvFromRegistry(ajv as unknown as Ajv, docs, {
      ignoreIncompatible: true,
      notes,
      seenSchemaIds: new Map(),
      targetDialect: '2020-12',
    });

    expect(ajv.addedSchemas).toEqual(['https://example.com/a.json']);
    const duplicateNote = notes.find(
      (n) =>
        n.code === 'RESOLVER_ADD_SCHEMA_SKIPPED_DUPLICATE_ID' &&
        (n.details as { id?: string }).id === 'https://example.com/a.json'
    );
    expect(duplicateNote).toBeDefined();
  });

  it('skips incompatible dialects with a run-level note', () => {
    const docs: RegistryDoc[] = [
      {
        uri: 'https://example.com/draft4.json',
        schema: {
          $schema: 'http://json-schema.org/draft-04/schema#',
          type: 'object',
        },
        dialect: 'draft-04',
      },
    ];
    const notes: ResolverDiagnosticNote[] = [];
    const ajv = new MockAjv();

    hydrateSourceAjvFromRegistry(ajv as unknown as Ajv, docs, {
      ignoreIncompatible: true,
      notes,
      seenSchemaIds: new Map(),
      targetDialect: '2020-12',
    });

    expect(ajv.addedSchemas).toHaveLength(0);
    expect(
      notes.some(
        (n) => n.code === 'RESOLVER_ADD_SCHEMA_SKIPPED_INCOMPATIBLE_DIALECT'
      )
    ).toBe(true);
  });
});
