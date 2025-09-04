/**
 * Tests for JSON Schema Reference Resolver
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ReferenceResolver,
  CircularDependencyDetector,
} from '../reference-resolver.js';
import type { Schema } from '../../types/schema.js';

describe('ReferenceResolver', () => {
  let resolver: ReferenceResolver;

  beforeEach(() => {
    resolver = new ReferenceResolver();
  });

  describe('basic $ref resolution', () => {
    it('should resolve simple internal reference', async () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          user: { $ref: '#/definitions/User' },
        },
        definitions: {
          User: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'integer' },
            },
          },
        },
      };

      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const resolved = result.value as any;
        expect(resolved.properties.user.type).toBe('object');
        expect(resolved.properties.user.properties.name.type).toBe('string');
      }
    });

    it('should resolve reference with JSON Pointer', async () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          firstName: { $ref: '#/definitions/Name/properties/first' },
        },
        definitions: {
          Name: {
            type: 'object',
            properties: {
              first: { type: 'string', minLength: 1 },
              last: { type: 'string', minLength: 1 },
            },
          },
        },
      };

      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const resolved = result.value as any;
        expect(resolved.properties.firstName.type).toBe('string');
        expect(resolved.properties.firstName.minLength).toBe(1);
      }
    });

    it('should resolve nested references', async () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          employee: { $ref: '#/definitions/Employee' },
        },
        definitions: {
          Employee: {
            type: 'object',
            properties: {
              person: { $ref: '#/definitions/Person' },
              employeeId: { type: 'string' },
            },
          },
          Person: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'integer' },
            },
          },
        },
      };

      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const resolved = result.value as any;
        expect(
          resolved.properties.employee.properties.person.properties.name.type
        ).toBe('string');
      }
    });

    it('should handle $defs (JSON Schema 2020-12)', async () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          user: { $ref: '#/$defs/User' },
        },
        $defs: {
          User: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
        },
      };

      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const resolved = result.value as any;
        expect(resolved.properties.user.type).toBe('object');
        expect(resolved.properties.user.properties.name.type).toBe('string');
      }
    });
  });

  describe('JSON Pointer resolution', () => {
    it('should decode escaped characters in JSON Pointer', async () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          test: { $ref: '#/definitions/foo~1bar~0baz' },
        },
        definitions: {
          'foo/bar~baz': {
            type: 'string',
            pattern: '^test$',
          },
        },
      };

      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const resolved = result.value as any;
        expect(resolved.properties.test.type).toBe('string');
        expect(resolved.properties.test.pattern).toBe('^test$');
      }
    });

    it('should handle array index in JSON Pointer', async () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          secondItem: { $ref: '#/definitions/items/1' },
        },
        definitions: {
          items: [
            { type: 'string' },
            { type: 'number', minimum: 0 },
            { type: 'boolean' },
          ],
        },
      };

      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const resolved = result.value as any;
        expect(resolved.properties.secondItem.type).toBe('number');
        expect(resolved.properties.secondItem.minimum).toBe(0);
      }
    });

    it('should error on invalid JSON Pointer reference', async () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          invalid: { $ref: '#/definitions/NonExistent' },
        },
        definitions: {
          User: { type: 'object' },
        },
      };

      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(false);

      if (!result.isOk()) {
        expect(result.error.message).toContain('not found');
      }
    });
  });

  describe('circular reference handling', () => {
    it('should detect direct self-reference', async () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          self: { $ref: '#' },
        },
      };

      const resolverWithError = new ReferenceResolver({
        circularHandling: 'error',
      });
      const result = await resolverWithError.resolve(schema);
      expect(result.isOk()).toBe(false);

      if (!result.isOk()) {
        expect(result.error.message).toContain('Circular reference');
      }
    });

    it('should handle circular references when set to ignore', async () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          self: { $ref: '#' },
        },
      };

      const resolverWithIgnore = new ReferenceResolver({
        circularHandling: 'ignore',
      });
      const result = await resolverWithIgnore.resolve(schema);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const resolved = result.value as any;
        expect(resolved.properties.self.$ref).toBe('#');
      }
    });

    it('should detect mutual circular references', async () => {
      const schema: Schema = {
        type: 'object',
        definitions: {
          A: {
            type: 'object',
            properties: {
              b: { $ref: '#/definitions/B' },
            },
          },
          B: {
            type: 'object',
            properties: {
              a: { $ref: '#/definitions/A' },
            },
          },
        },
      };

      const resolverWithError = new ReferenceResolver({
        circularHandling: 'error',
      });
      const result = await resolverWithError.resolve(schema);

      // Should succeed because the top-level schema doesn't directly reference the circular parts
      expect(result.isOk()).toBe(true);
    });
  });

  describe('depth limiting', () => {
    it('should respect maximum depth limit', async () => {
      const createDeepSchema = (depth: number): Schema => {
        const schema: any = {
          type: 'object',
          properties: {},
          definitions: {},
        };

        for (let i = 0; i < depth; i++) {
          schema.definitions[`Level${i}`] = {
            type: 'object',
            properties: {
              next:
                i < depth - 1
                  ? { $ref: `#/definitions/Level${i + 1}` }
                  : { type: 'string' },
            },
          };
        }

        schema.properties.root = { $ref: '#/definitions/Level0' };
        return schema;
      };

      const deepSchema = createDeepSchema(15);
      const resolverWithLimit = new ReferenceResolver({ maxDepth: 10 });
      const result = await resolverWithLimit.resolve(deepSchema);

      expect(result.isOk()).toBe(false);
      if (!result.isOk()) {
        expect(result.error.message).toContain('Maximum reference depth');
      }
    });

    it('should enforce depth limit for $recursiveRef chains', async () => {
      // Build a schema with a $recursiveAnchor and a chain of $recursiveRef pointers
      const depth = 12;
      const chain: any[] = [];
      for (let i = 0; i < depth; i++) {
        if (i < depth - 1) {
          chain[i] = {
            type: 'object',
            properties: {
              next: { $recursiveRef: `#/chain/${i + 1}` },
            },
          };
        } else {
          chain[i] = { type: 'string' };
        }
      }

      const schema: Schema = {
        type: 'object',
        properties: {
          root: {
            $recursiveAnchor: true,
            type: 'object',
            chain,
            properties: {
              start: { $recursiveRef: '#/chain/0' },
            },
          },
        },
      } as any;

      const resolver = new ReferenceResolver({
        maxDepth: 5,
        circularHandling: 'error',
      });
      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(false);
      if (!result.isOk()) {
        expect(result.error.message).toContain('Maximum reference depth');
      }
    });

    it('should enforce depth limit for $dynamicRef chains', async () => {
      // Build a schema with a $dynamicAnchor and a chain navigated via $dynamicRef with unique pointers
      const depth = 12;
      const chain: any[] = [];
      for (let i = 0; i < depth; i++) {
        chain[i] = { type: 'object' };
      }

      const schema: Schema = {
        type: 'object',
        properties: {
          outer: {
            $dynamicAnchor: 'layer',
            type: 'object',
            chain,
            properties: {
              // Start points to first element in the chain under the same dynamic anchor
              start: { $dynamicRef: '#layer/chain/0' },
              // Each element is an object with a next property referencing the next index via unique pointer
              // We'll fill these after object creation using mutation to keep code concise in test
            },
          },
        },
      } as any;

      // Attach next pointers using $dynamicRef with incrementing pointers
      for (let i = 0; i < depth - 1; i++) {
        (schema as any).properties.outer.chain[i].properties = {
          next: { $dynamicRef: `#layer/chain/${i + 1}` },
        };
      }
      // Terminal element stays as simple object (no $dynamicRef), to ensure the chain would end

      const resolver = new ReferenceResolver({
        maxDepth: 5,
        circularHandling: 'error',
      });
      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(false);
      if (!result.isOk()) {
        expect(result.error.message).toContain('Maximum reference depth');
      }
    });
  });

  describe('schema store', () => {
    it('should resolve references from schema store', async () => {
      const userSchema: Schema = {
        $id: 'https://example.com/user.json',
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      };

      resolver.addSchema(userSchema);

      const mainSchema: Schema = {
        type: 'object',
        properties: {
          author: { $ref: 'https://example.com/user.json' },
        },
      };

      const result = await resolver.resolve(mainSchema);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const resolved = result.value as any;
        expect(resolved.properties.author.type).toBe('object');
        expect(resolved.properties.author.properties.email.format).toBe(
          'email'
        );
      }
    });
  });

  describe('draft 2019-09 - $recursiveRef', () => {
    it('$recursiveRef resolution with nested $recursiveAnchor', async () => {
      const resolver = new ReferenceResolver({ circularHandling: 'ignore' });

      const nodeSchema: Schema = {
        $recursiveAnchor: true,
        type: 'object',
        properties: {
          value: { type: 'string' },
          next: { $recursiveRef: '#' },
        },
      };

      const schema: Schema = {
        type: 'object',
        properties: {
          root: nodeSchema,
        },
      };

      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resolved = result.value as any;
        // next should preserve $recursiveRef under ignore mode to avoid infinite expansion
        expect(resolved.properties.root.properties.next.$recursiveRef).toBe(
          '#'
        );
      }
    });
  });

  describe('draft 2020-12 - $dynamicRef/$dynamicAnchor', () => {
    it('$dynamicRef resolves to nearest dynamic scope', async () => {
      const resolver = new ReferenceResolver({ circularHandling: 'ignore' });

      const schema: Schema = {
        type: 'object',
        properties: {
          outer: {
            $dynamicAnchor: 'current',
            type: 'object',
            properties: {
              useCurrent: { $dynamicRef: '#current' },
            },
          },
        },
      };

      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resolved = result.value as any;
        // In ignore mode, preserve the $dynamicRef to break the cycle
        expect(
          resolved.properties.outer.properties.useCurrent.$dynamicRef
        ).toBe('#current');
      }
    });

    it('$dynamicRef falls back to static $anchor when no dynamic match', async () => {
      const resolver = new ReferenceResolver({ circularHandling: 'ignore' });

      const schema: Schema = {
        type: 'object',
        properties: {
          // Place a static anchor in the document
          target: {
            $anchor: 'Top',
            type: 'object',
            properties: { z: { type: 'string' } },
          },
          useTop: { $dynamicRef: '#Top' },
        },
      };

      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resolved = result.value as any;
        expect(resolved.properties.useTop.type).toBe('object');
        expect(resolved.properties.useTop.properties.z.type).toBe('string');
      }
    });
  });

  describe('relative references with $id base', () => {
    it('resolves relative $ref against $id (external document)', async () => {
      const userSchema: Schema = {
        $id: 'https://example.com/schemas/user.json',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const resolver = new ReferenceResolver({
        loadExternalSchema: async (uri: string) => {
          if (uri === 'https://example.com/schemas/user.json')
            return userSchema;
          return undefined;
        },
      });

      const schema: Schema = {
        $id: 'https://example.com/schemas/main.json',
        type: 'object',
        properties: {
          user: { $ref: './user.json' },
        },
      };

      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resolved = result.value as any;
        expect(resolved.properties.user.type).toBe('object');
        expect(resolved.properties.user.properties.name.type).toBe('string');
      }
    });

    it('resolves relative $ref with fragment against $id', async () => {
      const defsSchema: Schema = {
        $id: 'https://example.com/schemas/defs.json',
        $defs: {
          Address: {
            type: 'object',
            properties: { city: { type: 'string' } },
          },
        },
      };

      const resolver = new ReferenceResolver({
        loadExternalSchema: async (uri: string) => {
          if (uri === 'https://example.com/schemas/defs.json')
            return defsSchema;
          return undefined;
        },
      });

      const schema: Schema = {
        $id: 'https://example.com/schemas/main.json',
        type: 'object',
        properties: {
          addr: { $ref: './defs.json#/$defs/Address' },
        },
      };

      const result = await resolver.resolve(schema);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const resolved = result.value as any;
        expect(resolved.properties.addr.type).toBe('object');
        expect(resolved.properties.addr.properties.city.type).toBe('string');
      }
    });
  });
});

describe('CircularDependencyDetector', () => {
  let detector: CircularDependencyDetector;

  beforeEach(() => {
    detector = new CircularDependencyDetector();
  });

  it('should detect no cycles in simple schema', () => {
    const schema: Schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
    };

    const cycles = detector.detectCycles(schema);
    expect(cycles).toHaveLength(0);
  });

  it('should detect direct self-reference cycle', () => {
    const schema: Schema = {
      type: 'object',
      properties: {
        self: { $ref: '#' },
      },
    };

    const cycles = detector.detectCycles(schema);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('should detect cycles in definitions', () => {
    const schema: Schema = {
      type: 'object',
      definitions: {
        Node: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            next: { $ref: '#/definitions/Node' },
          },
        },
      },
      properties: {
        list: { $ref: '#/definitions/Node' },
      },
    };

    const cycles = detector.detectCycles(schema);
    // Should detect the cycle in Node definition
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('should detect mutual references', () => {
    const schema: Schema = {
      type: 'object',
      definitions: {
        Parent: {
          type: 'object',
          properties: {
            child: { $ref: '#/definitions/Child' },
          },
        },
        Child: {
          type: 'object',
          properties: {
            parent: { $ref: '#/definitions/Parent' },
          },
        },
      },
    };

    const cycles = detector.detectCycles(schema);
    expect(cycles.length).toBeGreaterThan(0);
  });
});
