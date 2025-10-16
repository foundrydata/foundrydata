/**
 * Parser module exports
 */

export type { SchemaParser } from './schema-parser.js';
export { ParserRegistry, hasProperty } from './schema-parser.js';
export { JSONSchemaParser } from './json-schema-parser.js';
export {
  ReferenceResolver,
  CircularDependencyDetector,
  type ReferenceResolverOptions,
  type ResolutionContext,
  type ResolvedReference,
} from './reference-resolver.js';

import { ParserRegistry } from './schema-parser.js';
import { JSONSchemaParser } from './json-schema-parser.js';

/**
 * Create a default parser registry with built-in parsers
 */
export function createDefaultParserRegistry(): ParserRegistry {
  const registry = new ParserRegistry();
  registry.register(new JSONSchemaParser());
  return registry;
}
