/**
 * Parser module exports
 */

export type { SchemaParser } from './schema-parser';
export { ParserRegistry, hasProperty } from './schema-parser';
export { JSONSchemaParser } from './json-schema-parser';

import { ParserRegistry } from './schema-parser';
import { JSONSchemaParser } from './json-schema-parser';

/**
 * Create a default parser registry with built-in parsers
 */
export function createDefaultParserRegistry(): ParserRegistry {
  const registry = new ParserRegistry();
  registry.register(new JSONSchemaParser());
  return registry;
}
