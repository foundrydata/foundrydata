import type { GeneratorOptions } from '@foundrydata/shared';

export class Generator {
  private readonly options: GeneratorOptions;

  constructor(options: GeneratorOptions = {}) {
    this.options = options;
  }

  public generate(): unknown {
    // TODO: Implement schema-based generation using this.options
    return null;
  }

  public getOptions(): GeneratorOptions {
    return this.options;
  }
}
