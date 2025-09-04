import { describe, it, expect } from 'vitest';
import { ReferenceResolver } from '../reference-resolver.js';
import type { Schema } from '../../types/schema.js';

describe('Circular Ignore Test', () => {
  it('should preserve $ref when ignoring circular references', async () => {
    const resolver = new ReferenceResolver({ circularHandling: 'ignore' });

    const schema: Schema = {
      type: 'object',
      properties: {
        self: { $ref: '#' },
      },
    };

    console.log('Original schema:', JSON.stringify(schema, null, 2));

    const result = await resolver.resolve(schema);

    console.log('Result isOk:', result.isOk());
    if (result.isOk()) {
      console.log('Resolved schema:', JSON.stringify(result.value, null, 2));
      const resolved = result.value as any;

      // The $ref should be preserved when ignoring circular references
      console.log('properties.self:', resolved.properties?.self);
      console.log('properties.self.$ref:', resolved.properties?.self?.$ref);

      expect(resolved.properties).toBeDefined();
      expect(resolved.properties.self).toBeDefined();
      expect(resolved.properties.self.$ref).toBe('#');
    } else {
      console.log('Error:', result.error);
      throw result.error;
    }
  });
});
