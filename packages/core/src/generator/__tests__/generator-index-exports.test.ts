import { describe, it, expect } from 'vitest';

import * as GenIndex from '../index';

describe('generator/index exports', () => {
  it('re-exports generateFromCompose symbol', () => {
    expect(typeof GenIndex.generateFromCompose).toBe('function');
  });
});
