// Shared types for foundrydata packages

export interface GeneratorOptions {
  seed?: number;
  locale?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}
