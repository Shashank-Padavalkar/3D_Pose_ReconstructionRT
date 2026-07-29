import { describe, expect, it } from 'vitest';
import { median } from './median';

describe('median', () => {
  it('handles odd, even, unsorted and non-finite samples', () => {
    expect(median([8, 1, 3])).toBe(3);
    expect(median([8, 1, 3, 5])).toBe(4);
    expect(median([Number.NaN, 2, Infinity, 4])).toBe(3);
    expect(median([])).toBeNull();
  });
});
