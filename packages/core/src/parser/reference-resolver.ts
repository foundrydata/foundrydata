/* eslint-disable max-lines */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
/**
 * JSON Schema Reference Resolver
 * Handles $ref, $recursiveRef, $dynamicRef with cycle detection
 */

import type { Schema, BaseSchema } from '../types/schema';
import { SchemaError } from '../types/errors';
import { Result, ok, err } from '../types/result';

/**
 * Reference resolution options
 */
export interface ReferenceResolverOptions {
  /** Maximum depth for reference resolution (default: 10) */
  maxDepth?: number;
  /** How to handle circular references */
  circularHandling?: 'error' | 'ignore' | 'lazy';
  /** Enable caching for performance */
  enableCache?: boolean;
  /** External schema loader function */
  loadExternalSchema?: (uri: string) => Promise<Schema | undefined>;
}

/**
 * Reference resolution context
 */
export interface ResolutionContext {
  /** Current schema being resolved */
  schema: Schema;
  /** Base URI for relative references */
  baseUri?: string;
  /** Current resolution depth */
  depth: number;
  /** Path of references being resolved (for cycle detection) */
  refPath: Set<string>;
  /** Resolved schemas cache */
  cache: Map<string, Schema>;
  /** Per-object resolved schema cache for performance */
  schemaCache?: WeakMap<object, Schema>;
  /** Schema store for definitions */
  schemaStore: Map<string, Schema>;
  /** Stack of recursive anchors (draft 2019-09) */
  recursiveAnchors?: Schema[];
  /** Dynamic anchor scope stack (draft 2020-12) */
  dynamicScope?: Array<Map<string, Schema>>;
}

/**
 * Resolved reference result
 */
export interface ResolvedReference {
  /** The resolved schema */
  schema: Schema;
  /** Whether this is a circular reference */
  circular: boolean;
  /** The final URI after resolution */
  resolvedUri?: string;
}

/**
 * JSON Schema Reference Resolver
 * Implements $ref resolution with cycle detection and caching
 */
export class ReferenceResolver {
  private readonly options: Required<ReferenceResolverOptions>;
  private readonly schemaStore: Map<string, Schema>;

  constructor(options: ReferenceResolverOptions = {}) {
    this.options = {
      maxDepth: options.maxDepth ?? 10,
      circularHandling: options.circularHandling ?? 'error',
      enableCache: options.enableCache ?? true,
      loadExternalSchema: options.loadExternalSchema ?? (async () => undefined),
    };
    this.schemaStore = new Map();
  }

  /**
   * Register a schema in the store
   */
  addSchema(schema: Schema, id?: string): void {
    if (typeof schema === 'object' && schema !== null) {
      const schemaId = id || (schema as BaseSchema).$id;
      if (schemaId) {
        this.schemaStore.set(schemaId, schema);
      }
    }
  }

  /**
   * Resolve all references in a schema
   */
  async resolve(schema: Schema): Promise<Result<Schema, SchemaError>> {
    const context: ResolutionContext = {
      schema,
      baseUri: this.getBaseUri(schema),
      depth: 0,
      refPath: new Set(),
      cache: new Map(),
      schemaStore: this.schemaStore,
      recursiveAnchors: [],
      dynamicScope: [],
      schemaCache: this.options.enableCache
        ? new WeakMap<object, Schema>()
        : undefined,
    };

    try {
      const resolved = await this.resolveSchema(schema, context);
      return ok(resolved);
    } catch (error) {
      if (error instanceof SchemaError) {
        return err(error);
      }
      return err(
        new SchemaError(
          error instanceof Error ? error.message : String(error),
          '#',
          'Failed to resolve schema references'
        )
      );
    }
  }

  /**
   * Resolve a single $ref
   */
  async resolveRef(
    ref: string,
    context: ResolutionContext
  ): Promise<ResolvedReference> {
    // Normalize cache key with base URI scope to avoid cross-document collisions
    const cacheKey = `${context.baseUri ?? 'local'}|${ref}`;

    // Check for circular reference
    if (context.refPath.has(ref)) {
      if (this.options.circularHandling === 'error') {
        throw new SchemaError(
          `Circular reference detected: ${ref}`,
          ref,
          'Break the circular dependency or use lazy resolution'
        );
      }
      return { schema: context.schema, circular: true };
    }

    // Check cache
    if (this.options.enableCache && context.cache.has(cacheKey)) {
      const cached = context.cache.get(cacheKey);
      if (cached) {
        return { schema: cached as Schema, circular: false };
      }
    }

    // Check depth limit
    if (context.depth >= this.options.maxDepth) {
      throw new SchemaError(
        `Maximum reference depth (${this.options.maxDepth}) exceeded`,
        ref,
        'Increase maxDepth option or reduce schema nesting'
      );
    }

    // Parse the reference
    const { uri, pointer } = this.parseReference(ref);

    // Special-case self-reference to the current document root ('#') as circular
    // This preserves the original $ref when circularHandling is 'ignore' or 'lazy'
    if (!uri && (pointer === '#' || pointer === '')) {
      if (this.options.circularHandling === 'error') {
        throw new SchemaError(
          `Circular reference detected: ${ref}`,
          ref,
          'Break the circular dependency or use lazy/ignore mode'
        );
      }
      return { schema: context.schema, circular: true };
    }

    // Resolve the base schema
    let baseSchema: Schema | undefined;
    if (uri) {
      const absoluteUri = this.resolveUri(uri, context.baseUri);
      baseSchema = await this.loadSchema(absoluteUri, context);
    } else {
      baseSchema = context.schema;
    }

    if (!baseSchema) {
      throw new SchemaError(
        `Cannot resolve reference: ${ref}`,
        ref,
        'Ensure the referenced schema exists'
      );
    }

    // Apply JSON Pointer if present
    let resolvedSchema = baseSchema as Schema;
    if (pointer) {
      resolvedSchema = this.resolveJsonPointer(baseSchema as Schema, pointer);
    }

    // Now recursively resolve the found schema with updated context
    // Add current ref to path to detect cycles
    const newContext: ResolutionContext = {
      ...context,
      depth: context.depth + 1,
      refPath: new Set(context.refPath).add(ref),
    };

    const fullyResolved = await this.resolveSchema(resolvedSchema, newContext);

    // Cache the result
    if (this.options.enableCache) {
      context.cache.set(cacheKey, fullyResolved);
    }

    return { schema: fullyResolved, circular: false, resolvedUri: uri };
  }

  /**
   * Resolve JSON Pointer (RFC 6901)
   */
  private resolveJsonPointer(schema: Schema, pointer: string): Schema {
    if (!pointer || pointer === '#') {
      return schema;
    }

    // Remove leading # if present
    const cleanPointer = pointer.startsWith('#') ? pointer.slice(1) : pointer;

    // Empty pointer refers to the whole document
    if (!cleanPointer || cleanPointer === '/') {
      return schema;
    }

    // Split into tokens and decode
    const tokens = cleanPointer
      .split('/')
      .slice(1) // Remove empty first element
      .map((token) => this.decodePointerToken(token));

    // Navigate through the schema
    let current: unknown = schema;
    for (const token of tokens) {
      if (typeof current !== 'object' || current === null) {
        throw new SchemaError(
          `Invalid JSON Pointer reference: ${pointer}`,
          pointer,
          'Ensure the pointer path exists in the schema'
        );
      }
      const obj = current as Record<string, unknown>;
      current = obj[token as keyof typeof obj];
      if (current === undefined) {
        throw new SchemaError(
          `JSON Pointer reference not found: ${pointer}`,
          pointer,
          `Property "${token}" does not exist`
        );
      }
    }

    return current as Schema;
  }

  /**
   * Decode a JSON Pointer token
   */
  private decodePointerToken(token: string): string {
    return token.replace(/~1/g, '/').replace(/~0/g, '~');
  }

  /**
   * Parse a reference into URI and pointer parts
   */
  private parseReference(ref: string): { uri?: string; pointer?: string } {
    const hashIndex = ref.indexOf('#');

    if (hashIndex === -1) {
      // No fragment, entire string is URI
      return { uri: ref };
    }

    if (hashIndex === 0) {
      // Fragment only (local reference)
      return { pointer: ref };
    }

    // Both URI and fragment
    return {
      uri: ref.slice(0, hashIndex),
      pointer: ref.slice(hashIndex),
    };
  }

  /**
   * Load a schema by URI
   */
  private async loadSchema(
    uri: string,
    _context: ResolutionContext
  ): Promise<Schema | undefined> {
    // Check schema store first
    if (this.schemaStore.has(uri)) {
      return this.schemaStore.get(uri);
    }

    // Try to load external schema
    if (this.options.loadExternalSchema) {
      const external = await this.options.loadExternalSchema(uri);
      if (external) {
        this.addSchema(external, uri);
        return external;
      }
    }

    return undefined;
  }

  /**
   * Get base URI from schema
   */
  private getBaseUri(schema: Schema): string | undefined {
    if (typeof schema === 'object' && schema !== null) {
      return (schema as BaseSchema).$id;
    }
    return undefined;
  }

  /**
   * Resolve a URI against a base URI if provided.
   * Falls back to the original string if it cannot be resolved.
   */
  private resolveUri(uri: string, base?: string): string {
    try {
      // Absolute URIs pass through
      return new URL(uri, base).toString();
    } catch {
      return uri;
    }
  }

  /**
   * Recursively resolve all references in a schema
   */
  private async resolveSchema(
    schema: Schema,
    context: ResolutionContext
  ): Promise<Schema> {
    // Handle boolean schemas
    if (typeof schema === 'boolean') {
      return schema;
    }

    // Object-level memoization using WeakMap
    if (
      this.options.enableCache &&
      context.schemaCache &&
      typeof schema === 'object' &&
      schema !== null
    ) {
      const cached = context.schemaCache.get(schema as object);
      if (cached) return cached;
    }

    // Update base URI scope if the current schema defines a new $id
    const currentId = this.getBaseUri(schema);
    const contextWithBase: ResolutionContext = currentId
      ? { ...context, baseUri: this.resolveUri(currentId, context.baseUri) }
      : context;

    // Update recursive/dynamic anchor scopes
    let childContext: ResolutionContext = contextWithBase;
    const baseSchema = schema as BaseSchema;
    if (baseSchema.$recursiveAnchor) {
      const newAnchors = [...(context.recursiveAnchors ?? []), schema];
      childContext = { ...childContext, recursiveAnchors: newAnchors };
    }
    if (baseSchema.$dynamicAnchor) {
      const name = baseSchema.$dynamicAnchor;
      const frames = [...(context.dynamicScope ?? [])];
      const top =
        frames.length > 0
          ? new Map(frames[frames.length - 1])
          : new Map<string, Schema>();
      top.set(name, schema);
      frames.push(top);
      childContext = { ...childContext, dynamicScope: frames };
    }

    // Check for $ref
    if (baseSchema.$dynamicRef) {
      let resolved: ResolvedReference;
      try {
        resolved = await this.resolveDynamicRef(
          baseSchema.$dynamicRef,
          childContext
        );
      } catch (error) {
        if (
          error instanceof SchemaError &&
          error.message.includes('Circular reference') &&
          this.options.circularHandling === 'ignore'
        ) {
          return schema;
        }
        throw error;
      }
      if (
        resolved.circular &&
        (this.options.circularHandling === 'ignore' ||
          this.options.circularHandling === 'lazy')
      ) {
        return schema;
      }
      const { $dynamicRef: _dref, ...other } = baseSchema as BaseSchema &
        Record<string, unknown>;
      if (
        Object.keys(other).length > 0 &&
        typeof resolved.schema === 'object' &&
        resolved.schema !== null
      ) {
        const merged = {
          ...(resolved.schema as Record<string, unknown>),
          ...other,
        } as Schema;
        if (this.options.enableCache && context.schemaCache)
          context.schemaCache.set(schema as object, merged);
        return merged;
      }
      if (this.options.enableCache && context.schemaCache)
        context.schemaCache.set(schema as object, resolved.schema);
      return resolved.schema;
    }

    if (baseSchema.$recursiveRef) {
      let resolved: ResolvedReference;
      try {
        resolved = await this.resolveRecursiveRef(
          baseSchema.$recursiveRef,
          childContext
        );
      } catch (error) {
        if (
          error instanceof SchemaError &&
          error.message.includes('Circular reference') &&
          this.options.circularHandling === 'ignore'
        ) {
          return schema;
        }
        throw error;
      }
      if (
        resolved.circular &&
        (this.options.circularHandling === 'ignore' ||
          this.options.circularHandling === 'lazy')
      ) {
        return schema;
      }
      const { $recursiveRef: _rref, ...other } = baseSchema as BaseSchema &
        Record<string, unknown>;
      if (
        Object.keys(other).length > 0 &&
        typeof resolved.schema === 'object' &&
        resolved.schema !== null
      ) {
        const merged = {
          ...(resolved.schema as Record<string, unknown>),
          ...other,
        } as Schema;
        if (this.options.enableCache && context.schemaCache)
          context.schemaCache.set(schema as object, merged);
        return merged;
      }
      if (this.options.enableCache && context.schemaCache)
        context.schemaCache.set(schema as object, resolved.schema);
      return resolved.schema;
    }

    if (schema.$ref) {
      // Try to resolve the reference
      let resolved: ResolvedReference;
      try {
        resolved = await this.resolveRef(schema.$ref, childContext);
      } catch (error) {
        // If we get a circular reference error and we're ignoring, keep the $ref
        if (
          error instanceof SchemaError &&
          error.message.includes('Circular reference') &&
          this.options.circularHandling === 'ignore'
        ) {
          return schema;
        }
        throw error;
      }

      // If circular and ignoring, return original schema with $ref
      if (
        resolved.circular &&
        (this.options.circularHandling === 'ignore' ||
          this.options.circularHandling === 'lazy')
      ) {
        return schema;
      }

      // Merge resolved schema with any additional properties
      const { $ref: _ref, ...otherProps } = schema;
      if (
        Object.keys(otherProps).length > 0 &&
        typeof resolved.schema === 'object' &&
        resolved.schema !== null
      ) {
        const merged = { ...resolved.schema, ...otherProps };
        if (this.options.enableCache && context.schemaCache)
          context.schemaCache.set(schema as object, merged);
        return merged;
      }
      if (this.options.enableCache && context.schemaCache)
        context.schemaCache.set(schema as object, resolved.schema);
      return resolved.schema;
    }

    // Recursively resolve nested schemas
    const resolved: BaseSchema & Record<string, unknown> = {
      ...(schema as BaseSchema),
    };

    // Don't resolve schemas inside definitions - they will be resolved when referenced
    // Just copy them as-is to avoid infinite recursion
    if ((schema as BaseSchema).definitions) {
      resolved.definitions = (schema as BaseSchema).definitions;
    }
    if ((schema as BaseSchema).$defs) {
      resolved.$defs = (schema as BaseSchema).$defs;
    }

    // Resolve in properties
    const sRec = schema as unknown as Record<string, unknown>;
    if (
      'properties' in sRec &&
      sRec.properties &&
      typeof sRec.properties === 'object'
    ) {
      resolved.properties = await this.resolveSchemaMap(
        sRec.properties as Record<string, Schema>,
        childContext
      );
    }

    // Resolve in array items
    if ('items' in schema && schema.items) {
      if (Array.isArray(schema.items)) {
        resolved.items = await Promise.all(
          schema.items.map((item) => this.resolveSchema(item, childContext))
        );
      } else {
        resolved.items = await this.resolveSchema(schema.items, childContext);
      }
    }

    // Resolve in additionalProperties
    if (
      'additionalProperties' in schema &&
      typeof schema.additionalProperties === 'object' &&
      schema.additionalProperties !== null
    ) {
      resolved.additionalProperties = await this.resolveSchema(
        schema.additionalProperties,
        childContext
      );
    }

    // Resolve in composition keywords
    if (schema.allOf) {
      resolved.allOf = await Promise.all(
        schema.allOf.map((s) => this.resolveSchema(s, childContext))
      );
    }
    if (schema.anyOf) {
      resolved.anyOf = await Promise.all(
        schema.anyOf.map((s) => this.resolveSchema(s, childContext))
      );
    }
    if (schema.oneOf) {
      resolved.oneOf = await Promise.all(
        schema.oneOf.map((s) => this.resolveSchema(s, childContext))
      );
    }
    if (schema.not) {
      resolved.not = await this.resolveSchema(schema.not, childContext);
    }

    // Resolve in conditional keywords
    if (schema.if) {
      resolved.if = await this.resolveSchema(schema.if, childContext);
    }
    if (schema.then) {
      resolved.then = await this.resolveSchema(schema.then, childContext);
    }
    if (schema.else) {
      resolved.else = await this.resolveSchema(schema.else, childContext);
    }

    if (this.options.enableCache && context.schemaCache)
      context.schemaCache.set(schema as object, resolved);
    return resolved;
  }

  /**
   * Resolve a $recursiveRef using the nearest $recursiveAnchor in scope.
   */
  private async resolveRecursiveRef(
    ref: string,
    context: ResolutionContext
  ): Promise<ResolvedReference> {
    // Check depth limit
    if (context.depth >= this.options.maxDepth) {
      throw new SchemaError(
        `Maximum reference depth (${this.options.maxDepth}) exceeded`,
        ref,
        'Increase maxDepth option or reduce schema nesting'
      );
    }
    const { uri, pointer } = this.parseReference(ref);

    // Determine base schema: nearest recursive anchor or fall back to document root
    const base: Schema =
      context.recursiveAnchors && context.recursiveAnchors.length > 0
        ? (context.recursiveAnchors[
            context.recursiveAnchors.length - 1
          ] as Schema)
        : (context.schema as Schema);

    // Cycle check by synthetic key
    const refKey = `$recursiveRef|${context.baseUri ?? 'local'}|${ref}`;
    if (context.refPath.has(refKey)) {
      if (this.options.circularHandling === 'error') {
        throw new SchemaError(
          `Circular reference detected: ${ref}`,
          ref,
          'Break the circular dependency or use lazy resolution'
        );
      }
      return { schema: base, circular: true };
    }

    // If referring to current recursive anchor (no URI, pointer to '#'), treat as circular in ignore/lazy
    if (!uri && (!pointer || pointer === '#')) {
      if (this.options.circularHandling === 'error') {
        throw new SchemaError(
          `Circular reference detected: ${ref}`,
          ref,
          'Break the circular dependency or use lazy/ignore'
        );
      }
      return { schema: base, circular: true };
    }

    // External URI in $recursiveRef: resolve like $ref with baseUri
    let baseSchema: Schema | undefined = base;
    if (uri) {
      const absoluteUri = this.resolveUri(uri, context.baseUri);
      baseSchema = await this.loadSchema(absoluteUri, context);
      if (!baseSchema) {
        throw new SchemaError(
          `Cannot resolve recursive reference: ${ref}`,
          '$recursiveRef',
          'External schema not found'
        );
      }
    }

    let resolvedSchema = baseSchema as Schema;
    if (pointer) {
      resolvedSchema = this.resolveJsonPointer(baseSchema as Schema, pointer);
    }

    const newContext: ResolutionContext = {
      ...context,
      depth: context.depth + 1,
      refPath: new Set(context.refPath).add(refKey),
    };

    const fullyResolved = await this.resolveSchema(resolvedSchema, newContext);
    return { schema: fullyResolved, circular: false };
  }

  /**
   * Resolve a $dynamicRef using the dynamic anchor scope.
   */
  private async resolveDynamicRef(
    ref: string,
    context: ResolutionContext
  ): Promise<ResolvedReference> {
    // Check depth limit
    if (context.depth >= this.options.maxDepth) {
      throw new SchemaError(
        `Maximum reference depth (${this.options.maxDepth}) exceeded`,
        ref,
        'Increase maxDepth option or reduce schema nesting'
      );
    }
    const { uri, pointer } = this.parseReference(ref);
    const refKey = `$dynamicRef|${context.baseUri ?? 'local'}|${ref}`;
    if (context.refPath.has(refKey)) {
      if (this.options.circularHandling === 'error') {
        throw new SchemaError(
          `Circular reference detected: ${ref}`,
          ref,
          'Break the circular dependency or use lazy resolution'
        );
      }
      return { schema: context.schema, circular: true };
    }

    // External doc: fall back to normal $ref semantics
    if (uri && uri.length > 0) {
      return this.resolveRef(ref, context);
    }

    // Interpret fragment. If it starts with '/', it's a plain JSON pointer with no dynamic name.
    const frag = pointer?.startsWith('#') ? pointer.slice(1) : (pointer ?? '');
    let baseSchema: Schema | undefined;
    let remainingPointer: string | undefined;
    let fromDynamicAnchor = false;

    if (!frag || frag.startsWith('/')) {
      // No dynamic anchor name; resolve against root document
      baseSchema = context.schema;
      remainingPointer = pointer;
    } else {
      const parts = frag.split('/');
      const name: string = (parts[0] ?? '') as string;
      remainingPointer =
        parts.length > 1 ? `#/${parts.slice(1).join('/')}` : undefined;

      // Lookup dynamic anchor from innermost to outermost
      const frames = context.dynamicScope ?? [];
      for (let i = frames.length - 1; i >= 0; i--) {
        const frame = frames[i]!;
        const hit = frame.get(name as string);
        if (hit) {
          baseSchema = hit;
          fromDynamicAnchor = true;
          break;
        }
      }

      // Fallback to static $anchor search in the document
      if (!baseSchema) {
        baseSchema =
          this.findStaticAnchor(context.schema, name as string) ??
          context.schema;
      }
    }

    // If resolving to a dynamic anchor in current scope with no further pointer, treat as circular in ignore/lazy
    if (fromDynamicAnchor && !remainingPointer) {
      if (this.options.circularHandling === 'error') {
        throw new SchemaError(
          `Circular reference detected: ${ref}`,
          ref,
          'Break the circular dependency or use lazy/ignore'
        );
      }
      return { schema: baseSchema as Schema, circular: true };
    }

    if (!baseSchema) {
      throw new SchemaError(
        `Cannot resolve dynamic reference: ${ref}`,
        '$dynamicRef',
        'No dynamic or static anchor found'
      );
    }

    let resolvedSchema = baseSchema as Schema;
    if (remainingPointer) {
      resolvedSchema = this.resolveJsonPointer(
        baseSchema as Schema,
        remainingPointer
      );
    }

    const newContext: ResolutionContext = {
      ...context,
      depth: context.depth + 1,
      refPath: new Set(context.refPath).add(refKey),
    };

    const fullyResolved = await this.resolveSchema(resolvedSchema, newContext);
    return { schema: fullyResolved, circular: false };
  }

  /**
   * Find a schema with a static $anchor name within a document (DFS, no $ref following).
   */
  private findStaticAnchor(
    schema: Schema,
    name: string,
    visited = new Set<object>()
  ): Schema | undefined {
    if (typeof schema !== 'object' || schema === null) return undefined;
    if (visited.has(schema)) return undefined;
    visited.add(schema);

    const s = schema as BaseSchema & Record<string, unknown>;
    if (s.$anchor === name) return schema;

    // Traverse known schema-bearing keywords
    const visit = (sub: unknown): Schema | undefined => {
      if (typeof sub === 'object' && sub !== null) {
        return this.findStaticAnchor(sub as Schema, name, visited);
      }
      return undefined;
    };

    if (s.properties && typeof s.properties === 'object') {
      for (const v of Object.values(s.properties)) {
        const res = visit(v);
        if (res) return res;
      }
    }
    if (s.definitions && typeof s.definitions === 'object') {
      for (const v of Object.values(s.definitions)) {
        const res = visit(v);
        if (res) return res;
      }
    }
    if (s.$defs && typeof s.$defs === 'object') {
      for (const v of Object.values(s.$defs)) {
        const res = visit(v);
        if (res) return res;
      }
    }
    if (s.items) {
      if (Array.isArray(s.items)) {
        for (const it of s.items) {
          const res = visit(it);
          if (res) return res;
        }
      } else {
        const res = visit(s.items);
        if (res) return res;
      }
    }
    if (Array.isArray(s.allOf)) {
      for (const v of s.allOf) {
        const res = visit(v);
        if (res) return res;
      }
    }
    if (Array.isArray(s.anyOf)) {
      for (const v of s.anyOf) {
        const res = visit(v);
        if (res) return res;
      }
    }
    if (Array.isArray(s.oneOf)) {
      for (const v of s.oneOf) {
        const res = visit(v);
        if (res) return res;
      }
    }
    if (s.not) {
      const res = visit(s.not);
      if (res) return res;
    }
    if (s.additionalProperties && typeof s.additionalProperties === 'object') {
      const res = visit(s.additionalProperties);
      if (res) return res;
    }

    return undefined;
  }

  /**
   * Resolve a map of schemas
   */
  private async resolveSchemaMap(
    map: Record<string, Schema>,
    context: ResolutionContext
  ): Promise<Record<string, Schema>> {
    const resolved: Record<string, Schema> = {};
    for (const [key, value] of Object.entries(map)) {
      resolved[key] = await this.resolveSchema(value, context);
    }
    return resolved;
  }
}

/**
 * Circular dependency detector
 */
export class CircularDependencyDetector {
  private visitedNodes: Set<string> = new Set();
  private recursionStack: Set<string> = new Set();
  private cycles: string[][] = [];

  /**
   * Detect cycles in a schema
   */
  detectCycles(schema: Schema): string[][] {
    this.visitedNodes.clear();
    this.recursionStack.clear();
    this.cycles = [];

    this.dfs(schema, '#');
    return this.cycles;
  }

  /**
   * Depth-first search for cycle detection
   */
  private dfs(schema: Schema, path: string): boolean {
    if (typeof schema !== 'object' || schema === null) {
      return false;
    }

    // Check if we're already in the recursion stack
    if (this.recursionStack.has(path)) {
      // Found a cycle
      const cycle = Array.from(this.recursionStack);
      const cycleStart = cycle.indexOf(path);
      this.cycles.push(cycle.slice(cycleStart));
      return true;
    }

    // Check if already visited
    if (this.visitedNodes.has(path)) {
      return false;
    }

    // Mark as visited and add to recursion stack
    this.visitedNodes.add(path);
    this.recursionStack.add(path);

    // Check $ref
    if ((schema as BaseSchema).$ref) {
      const refPath = this.resolveRefPath(path, (schema as BaseSchema).$ref!);
      this.dfs(schema, refPath);
    }

    // Check nested schemas
    this.checkNestedSchemas(schema as unknown as Record<string, unknown>, path);

    // Remove from recursion stack
    this.recursionStack.delete(path);
    return false;
  }

  /**
   * Check nested schemas for cycles
   */
  private checkNestedSchemas(
    schema: Record<string, unknown>,
    basePath: string
  ): void {
    // Check properties
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [key, value] of Object.entries(
        schema.properties as Record<string, unknown>
      )) {
        this.dfs(value as Schema, `${basePath}/properties/${key}`);
      }
    }

    // Check definitions
    if (schema.definitions && typeof schema.definitions === 'object') {
      for (const [key, value] of Object.entries(
        schema.definitions as Record<string, unknown>
      )) {
        this.dfs(value as Schema, `${basePath}/definitions/${key}`);
      }
    }

    // Check $defs
    if (schema.$defs && typeof schema.$defs === 'object') {
      for (const [key, value] of Object.entries(
        schema.$defs as Record<string, unknown>
      )) {
        this.dfs(value as Schema, `${basePath}/$defs/${key}`);
      }
    }

    // Check array items
    if (schema.items) {
      if (Array.isArray(schema.items)) {
        schema.items.forEach((item: Schema, index: number) => {
          this.dfs(item, `${basePath}/items/${index}`);
        });
      } else {
        this.dfs(schema.items as Schema, `${basePath}/items`);
      }
    }

    // Check composition keywords
    if (schema.allOf && Array.isArray(schema.allOf)) {
      (schema.allOf as Schema[]).forEach((s: Schema, i: number) => {
        this.dfs(s, `${basePath}/allOf/${i}`);
      });
    }
    if (schema.anyOf && Array.isArray(schema.anyOf)) {
      (schema.anyOf as Schema[]).forEach((s: Schema, i: number) => {
        this.dfs(s, `${basePath}/anyOf/${i}`);
      });
    }
    if (schema.oneOf && Array.isArray(schema.oneOf)) {
      (schema.oneOf as Schema[]).forEach((s: Schema, i: number) => {
        this.dfs(s, `${basePath}/oneOf/${i}`);
      });
    }
  }

  /**
   * Resolve a reference path relative to current path
   */
  private resolveRefPath(currentPath: string, ref: string): string {
    if (ref.startsWith('#')) {
      return ref;
    }
    // For relative references, combine with current path
    const basePath = currentPath.split('/').slice(0, -1).join('/');
    return `${basePath}/${ref}`;
  }
}
