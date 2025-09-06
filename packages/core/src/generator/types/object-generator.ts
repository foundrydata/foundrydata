/* eslint-disable max-depth */
/**
 * Object Generator
 * Generates object values with support for properties, required fields, dependencies, and property count constraints
 *
 * Core generator component - complexity and line limits are disabled
 * for cohesion and performance per CLAUDE.md guidelines
 */

/* eslint-disable max-lines, max-lines-per-function, complexity, @typescript-eslint/no-explicit-any */

import { Result, ok, err } from '../../types/result';
import { GenerationError } from '../../types/errors';
import type { Schema, ObjectSchema } from '../../types/schema';
import {
  DataGenerator,
  GeneratorContext,
  GenerationConfig,
} from '../data-generator';

// Import other generators for property generation
import { StringGenerator } from './string-generator';
import { NumberGenerator } from './number-generator';
import { IntegerGenerator } from './integer-generator';
import { BooleanGenerator } from './boolean-generator';
import { ArrayGenerator } from './array-generator';

export class ObjectGenerator extends DataGenerator {
  supports(schema: Schema): boolean {
    return (
      typeof schema === 'object' && schema !== null && schema.type === 'object'
    );
  }

  generate(
    schema: Schema,
    context: GeneratorContext,
    _config?: GenerationConfig
  ): Result<Record<string, unknown>, GenerationError> {
    if (!this.supports(schema)) {
      return err(
        new GenerationError(
          `ObjectGenerator does not support schema type: ${typeof schema === 'object' && schema !== null ? schema.type : 'unknown'}`,
          undefined,
          context.path,
          'type'
        )
      );
    }

    const objectSchema = schema as ObjectSchema;

    // Validate constraints
    const validationResult = this.validateConstraints(objectSchema, context);
    if (validationResult.isErr()) {
      return validationResult;
    }

    try {
      // Handle const values first (highest priority)
      if (objectSchema.const !== undefined) {
        if (
          typeof objectSchema.const !== 'object' ||
          objectSchema.const === null ||
          Array.isArray(objectSchema.const)
        ) {
          return err(
            new GenerationError(
              `Invalid const value for object: ${objectSchema.const}`,
              'Const value must be a valid object',
              context.path,
              'const'
            )
          );
        }
        return ok(objectSchema.const as Record<string, unknown>);
      }

      // Handle enum values
      if (objectSchema.enum) {
        return this.generateFromEnum(objectSchema.enum, context);
      }

      // Handle default values
      if (objectSchema.default !== undefined) {
        if (
          typeof objectSchema.default === 'object' &&
          objectSchema.default !== null &&
          !Array.isArray(objectSchema.default)
        ) {
          return ok(objectSchema.default as Record<string, unknown>);
        }
      }

      // Handle example values
      if (objectSchema.examples && objectSchema.examples.length > 0) {
        const fakerInstance = this.prepareFaker(context);
        const example = fakerInstance.helpers.arrayElement(
          objectSchema.examples
        );
        if (
          typeof example === 'object' &&
          example !== null &&
          !Array.isArray(example)
        ) {
          return ok(example as Record<string, unknown>);
        }
      }

      // Generate object with properties
      return this.generateObject(objectSchema, context);
    } catch (error) {
      return err(
        new GenerationError(
          `Failed to generate object: ${String(error)}`,
          'Check object constraints',
          context.path,
          'object-generation',
          { error: String(error) }
        )
      );
    }
  }

  /**
   * Validate object schema constraints
   */
  private validateConstraints(
    schema: ObjectSchema,
    context: GeneratorContext
  ): Result<void, GenerationError> {
    // Check minProperties/maxProperties constraints
    if (
      schema.minProperties !== undefined &&
      schema.maxProperties !== undefined &&
      schema.minProperties > schema.maxProperties
    ) {
      return err(
        new GenerationError(
          `Invalid constraints: minProperties (${schema.minProperties}) > maxProperties (${schema.maxProperties})`,
          'Fix the schema constraints',
          context.path,
          'constraint-conflict'
        )
      );
    }

    // Check that required properties exist in properties
    if (schema.required && schema.properties) {
      for (const prop of schema.required) {
        if (!(prop in schema.properties)) {
          return err(
            new GenerationError(
              `Required property "${prop}" is not defined in properties`,
              'All required properties must be defined in properties',
              context.path,
              'required-property'
            )
          );
        }
      }
    }

    // Check for negative property counts
    if (schema.minProperties !== undefined && schema.minProperties < 0) {
      return err(
        new GenerationError(
          `Invalid minProperties: ${schema.minProperties} (must be >= 0)`,
          'minProperties must be non-negative',
          context.path,
          'minProperties'
        )
      );
    }

    if (schema.maxProperties !== undefined && schema.maxProperties < 0) {
      return err(
        new GenerationError(
          `Invalid maxProperties: ${schema.maxProperties} (must be >= 0)`,
          'maxProperties must be non-negative',
          context.path,
          'maxProperties'
        )
      );
    }

    return ok(undefined);
  }

  /**
   * Generate object from enum values
   */
  private generateFromEnum(
    enumValues: any[],
    context: GeneratorContext
  ): Result<Record<string, unknown>, GenerationError> {
    if (enumValues.length === 0) {
      return err(
        new GenerationError(
          'Enum array is empty',
          'Provide at least one enum value',
          context.path,
          'enum'
        )
      );
    }

    const fakerInstance = this.prepareFaker(context);
    const selectedValue = fakerInstance.helpers.arrayElement(enumValues);

    if (
      typeof selectedValue !== 'object' ||
      selectedValue === null ||
      Array.isArray(selectedValue)
    ) {
      return err(
        new GenerationError(
          `Non-object value in enum: ${selectedValue}`,
          'All enum values must be valid objects',
          context.path,
          'enum'
        )
      );
    }

    return ok(selectedValue as Record<string, unknown>);
  }

  /**
   * Generate object with properties
   */
  private generateObject(
    schema: ObjectSchema,
    context: GeneratorContext
  ): Result<Record<string, unknown>, GenerationError> {
    const result: Record<string, unknown> = {};
    const properties = schema.properties || {};
    const required = schema.required || [];
    const minProperties = schema.minProperties || 0;
    const maxProperties =
      schema.maxProperties ?? (Object.keys(properties).length || 100);

    // Check recursion depth
    if (context.currentDepth >= context.maxDepth) {
      // Return minimal object when max depth reached
      return ok({});
    }

    // Generate required properties first
    for (const prop of required) {
      if (properties[prop]) {
        const propResult = this.generatePropertyValue(
          properties[prop],
          prop,
          context
        );
        if (propResult.isErr()) {
          return propResult as Result<never, GenerationError>;
        }
        result[prop] = propResult.value;
      }
    }

    // Get optional properties (not in required)
    const optionalProps = Object.keys(properties).filter(
      (p) => !required.includes(p)
    );

    // Calculate how many more properties we need
    const currentCount = Object.keys(result).length;
    const minNeeded = Math.max(0, minProperties - currentCount);
    const maxAllowed = Math.max(0, maxProperties - currentCount);

    // Determine how many optional properties to add
    const fakerInstance = this.prepareFaker(context);
    const optionalToAdd = Math.min(
      optionalProps.length,
      minNeeded +
        (minNeeded < maxAllowed
          ? fakerInstance.number.int({ min: 0, max: maxAllowed - minNeeded })
          : 0)
    );

    // Shuffle and select optional properties
    const shuffledOptional = fakerInstance.helpers.shuffle(optionalProps);
    for (let i = 0; i < optionalToAdd; i++) {
      const prop = shuffledOptional[i];
      if (prop && properties[prop]) {
        const propResult = this.generatePropertyValue(
          properties[prop],
          prop,
          context
        );
        if (propResult.isErr()) {
          return propResult as Result<never, GenerationError>;
        }
        result[prop] = propResult.value;
      }
    }

    // Handle dependencies/dependentRequired
    const dependencies = schema.dependencies || schema.dependentRequired;
    if (dependencies) {
      for (const [prop, deps] of Object.entries(dependencies)) {
        if (prop in result) {
          // Property exists, add dependent properties
          if (Array.isArray(deps)) {
            // dependentRequired style (array of property names)
            for (const dep of deps) {
              if (!(dep in result) && properties[dep]) {
                const depResult = this.generatePropertyValue(
                  properties[dep],
                  dep,
                  context
                );
                if (depResult.isErr()) {
                  return depResult as Result<never, GenerationError>;
                }
                result[dep] = depResult.value;
              }
            }
          } else if (typeof deps === 'object') {
            // dependentSchemas style (schema object)
            // For MVP, we skip complex dependent schemas
            continue;
          }
        }
      }
    }

    // Handle additionalProperties if needed (for edge cases)
    if (
      context.scenario === 'edge' &&
      schema.additionalProperties !== false &&
      (schema as any).unevaluatedProperties !== false
    ) {
      const currentPropCount = Object.keys(result).length;
      if (currentPropCount < maxProperties) {
        // Add some additional properties for edge testing
        const additionalCount = Math.min(
          fakerInstance.number.int({ min: 0, max: 2 }),
          maxProperties - currentPropCount
        );

        for (let i = 0; i < additionalCount; i++) {
          const propName = `additionalProp${i}`;
          if (!(propName in result)) {
            // Generate value based on additionalProperties schema
            if (typeof schema.additionalProperties === 'object') {
              const propResult = this.generatePropertyValue(
                schema.additionalProperties,
                propName,
                context
              );
              if (propResult.isOk()) {
                result[propName] = propResult.value;
              }
            } else {
              // additionalProperties: true - generate random value
              result[propName] = fakerInstance.string.alpha(10);
            }
          }
        }
      }
    }

    return ok(result);
  }

  /**
   * Generate value for a property
   */
  private generatePropertyValue(
    propertySchema: Schema,
    propertyName: string,
    context: GeneratorContext
  ): Result<unknown, GenerationError> {
    // Create new context with updated path and depth
    const propertyContext: GeneratorContext = {
      ...context,
      path: `${context.path}.${propertyName}`,
      currentDepth: context.currentDepth + 1,
    };

    // Handle boolean schemas (true/false)
    if (propertySchema === true) {
      // true means any value is allowed
      return ok(null);
    }
    if (propertySchema === false) {
      // false means no value is allowed
      return err(
        new GenerationError(
          `Property "${propertyName}" has false schema (no value allowed)`,
          'Schema false prohibits any value',
          propertyContext.path,
          'false-schema'
        )
      );
    }

    // Determine which generator to use based on property schema type
    if (
      typeof propertySchema === 'object' &&
      propertySchema !== null &&
      'type' in propertySchema
    ) {
      if (propertySchema.type === 'string') {
        const generator = new StringGenerator();
        return generator.generate(propertySchema, propertyContext);
      } else if (propertySchema.type === 'number') {
        const generator = new NumberGenerator();
        return generator.generate(propertySchema, propertyContext);
      } else if (propertySchema.type === 'integer') {
        const generator = new IntegerGenerator();
        return generator.generate(propertySchema, propertyContext);
      } else if (propertySchema.type === 'boolean') {
        const generator = new BooleanGenerator();
        return generator.generate(propertySchema, propertyContext);
      } else if (propertySchema.type === 'array') {
        const generator = new ArrayGenerator();
        return generator.generate(propertySchema, propertyContext);
      } else if (propertySchema.type === 'object') {
        // Recursive object generation
        return this.generate(propertySchema, propertyContext);
      }
    }

    // Default to null for unknown types or schemas without type
    return ok(null);
  }

  validate(value: any, schema: Schema): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    if (!this.supports(schema)) {
      return false;
    }

    const objectSchema = schema as ObjectSchema;

    // Check required properties
    if (objectSchema.required) {
      for (const prop of objectSchema.required) {
        if (!(prop in value)) {
          return false;
        }
      }
    }

    // Check property count constraints
    const propCount = Object.keys(value).length;

    if (
      objectSchema.minProperties !== undefined &&
      propCount < objectSchema.minProperties
    ) {
      return false;
    }

    if (
      objectSchema.maxProperties !== undefined &&
      propCount > objectSchema.maxProperties
    ) {
      return false;
    }

    // Check enum constraint
    if (objectSchema.enum) {
      return objectSchema.enum.some(
        (enumValue) => JSON.stringify(enumValue) === JSON.stringify(value)
      );
    }

    // Check const constraint
    if (objectSchema.const !== undefined) {
      return JSON.stringify(objectSchema.const) === JSON.stringify(value);
    }

    // Validate individual properties if schema defines them
    if (objectSchema.properties) {
      for (const [prop, propSchema] of Object.entries(
        objectSchema.properties
      )) {
        if (prop in value) {
          // We would need to validate each property value against its schema
          // For now, just check basic type matching
          const propValue = value[prop];
          if (propSchema === false) return false; // false schema allows no value
          if (propSchema === true) continue; // true schema allows any value
          if (
            typeof propSchema === 'object' &&
            propSchema !== null &&
            'type' in propSchema
          ) {
            if (propSchema.type === 'string' && typeof propValue !== 'string')
              return false;
            if (propSchema.type === 'number' && typeof propValue !== 'number')
              return false;
            if (propSchema.type === 'integer' && !Number.isInteger(propValue))
              return false;
            if (propSchema.type === 'boolean' && typeof propValue !== 'boolean')
              return false;
            if (propSchema.type === 'array' && !Array.isArray(propValue))
              return false;
            if (
              propSchema.type === 'object' &&
              (typeof propValue !== 'object' ||
                propValue === null ||
                Array.isArray(propValue))
            )
              return false;
          }
        }
      }
    }

    // Check additionalProperties constraint
    if (
      objectSchema.additionalProperties === false &&
      objectSchema.properties
    ) {
      const definedProps = Object.keys(objectSchema.properties);
      const valueProps = Object.keys(value);
      for (const prop of valueProps) {
        if (!definedProps.includes(prop)) {
          return false;
        }
      }
    }

    // Check dependencies
    const dependencies =
      objectSchema.dependencies || objectSchema.dependentRequired;
    if (dependencies) {
      for (const [prop, deps] of Object.entries(dependencies)) {
        if (prop in value && Array.isArray(deps)) {
          for (const dep of deps) {
            if (!(dep in value)) {
              return false;
            }
          }
        }
      }
    }

    return true;
  }

  getExamples(schema: Schema): Record<string, unknown>[] {
    if (!this.supports(schema)) {
      return [];
    }

    const objectSchema = schema as ObjectSchema;

    // Return enum values if available
    if (objectSchema.enum) {
      return objectSchema.enum
        .filter((v) => typeof v === 'object' && v !== null && !Array.isArray(v))
        .map((v) => v as Record<string, unknown>);
    }

    // Return const value if available
    if (objectSchema.const !== undefined) {
      if (
        typeof objectSchema.const === 'object' &&
        objectSchema.const !== null &&
        !Array.isArray(objectSchema.const)
      ) {
        return [objectSchema.const as Record<string, unknown>];
      }
    }

    // Return schema examples if available
    if (objectSchema.examples && objectSchema.examples.length > 0) {
      return objectSchema.examples
        .filter((v) => typeof v === 'object' && v !== null && !Array.isArray(v))
        .map((v) => v as Record<string, unknown>);
    }

    // Generate basic examples
    const examples: Record<string, unknown>[] = [];

    // Empty object (if allowed by constraints)
    const minProps = objectSchema.minProperties || 0;
    if (
      minProps === 0 &&
      (!objectSchema.required || objectSchema.required.length === 0)
    ) {
      examples.push({});
    }

    // Object with only required properties
    if (
      objectSchema.required &&
      objectSchema.required.length > 0 &&
      objectSchema.properties
    ) {
      const requiredOnly: Record<string, unknown> = {};
      for (const prop of objectSchema.required) {
        if (objectSchema.properties[prop]) {
          const propSchema = objectSchema.properties[prop] as Schema;
          // Generate simple example value based on type
          if (typeof propSchema === 'boolean') {
            if (propSchema === true) requiredOnly[prop] = null;
            // Skip false schemas
          } else if (
            typeof propSchema === 'object' &&
            propSchema !== null &&
            'type' in propSchema
          ) {
            if (propSchema.type === 'string') requiredOnly[prop] = 'example';
            else if (propSchema.type === 'number') requiredOnly[prop] = 42;
            else if (propSchema.type === 'integer') requiredOnly[prop] = 1;
            else if (propSchema.type === 'boolean') requiredOnly[prop] = true;
            else if (propSchema.type === 'array') requiredOnly[prop] = [];
            else if (propSchema.type === 'object') requiredOnly[prop] = {};
            else requiredOnly[prop] = null;
          } else {
            requiredOnly[prop] = null;
          }
        }
      }
      examples.push(requiredOnly);
    }

    // Object with all properties (if different from required only)
    if (
      objectSchema.properties &&
      Object.keys(objectSchema.properties).length > 0
    ) {
      const allProps: Record<string, unknown> = {};
      for (const [prop, propSchemaRaw] of Object.entries(
        objectSchema.properties
      )) {
        const propSchema = propSchemaRaw as Schema;
        // Generate simple example value based on type
        if (typeof propSchema === 'boolean') {
          if (propSchema === true) allProps[prop] = null;
          // Skip false schemas
        } else if (
          typeof propSchema === 'object' &&
          propSchema !== null &&
          'type' in propSchema
        ) {
          if (propSchema.type === 'string') allProps[prop] = 'example';
          else if (propSchema.type === 'number') allProps[prop] = 42;
          else if (propSchema.type === 'integer') allProps[prop] = 1;
          else if (propSchema.type === 'boolean') allProps[prop] = true;
          else if (propSchema.type === 'array') allProps[prop] = [];
          else if (propSchema.type === 'object') allProps[prop] = {};
          else allProps[prop] = null;
        } else {
          allProps[prop] = null;
        }
      }

      // Only add if different from requiredOnly and respects maxProperties
      const maxProps = objectSchema.maxProperties ?? Infinity;
      if (Object.keys(allProps).length <= maxProps) {
        examples.push(allProps);
      }
    }

    return examples.length > 0 ? examples : [{}];
  }

  getPriority(): number {
    return 10; // Standard priority for object generation
  }

  /**
   * Generate multiple object values
   */
  generateMultiple(
    schema: Schema,
    context: GeneratorContext,
    count: number
  ): Result<unknown[], GenerationError> {
    const results: unknown[] = [];

    for (let i = 0; i < count; i++) {
      const result = this.generate(schema, context);
      if (result.isErr()) {
        return result;
      }
      results.push(result.unwrap());
    }

    return ok(results);
  }

  /**
   * Clear any internal caches
   */
  static clearCache(): void {
    // Cache clearing logic will be implemented when cache is added
  }
}
