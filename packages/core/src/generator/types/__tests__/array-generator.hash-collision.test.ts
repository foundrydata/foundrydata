import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ArraySchema } from '../../../types/schema';

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('ArrayGenerator structural hash collisions', () => {
  it('retains distinct values that deliberately collide', async () => {
    const structHashModule = await import('../../../util/struct-hash');
    const mockStructuralHash = vi
      .spyOn(structHashModule, 'structuralHash')
      .mockImplementation(() => ({ digest: 'digest', canonical: 'canon' }));
    const mockBucketsEqual = vi
      .spyOn(structHashModule, 'bucketsEqual')
      .mockReturnValue(false);

    const { ArrayGenerator } = await import('../array-generator');
    const generator = new ArrayGenerator();
    const schema: ArraySchema = { type: 'array', uniqueItems: true };

    const value = [{ a: 1 }, { a: 2 }];
    const isValid = generator.validate(value, schema);

    expect(isValid).toBe(true);

    expect(mockStructuralHash).toHaveBeenCalledTimes(2);
    expect(mockBucketsEqual).toHaveBeenCalledTimes(1);
    const [bucketArg] = mockBucketsEqual.mock.calls[0] ?? [];
    expect(Array.isArray(bucketArg)).toBe(true);
    if (Array.isArray(bucketArg)) {
      expect(bucketArg).toHaveLength(2);
    }
  });
});
