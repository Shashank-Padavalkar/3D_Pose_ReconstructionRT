import { describe, expect, it } from 'vitest';
import { LowPassFilter } from './LowPassFilter';
import { OneEuroFilter } from './OneEuroFilter';

describe('OneEuroFilter', () => {
  it('reduces deterministic stationary noise variance', () => {
    const filter = new OneEuroFilter({ minCutoff: 1, beta: 0.06, derivativeCutoff: 1 });
    const raw: number[] = [];
    const filtered: number[] = [];
    for (let index = 0; index < 240; index += 1) {
      const sample = Math.sin(index * 2.37) * 0.035 + Math.sin(index * 0.71) * 0.015;
      raw.push(sample);
      filtered.push(filter.filter(sample, index * (1000 / 60)));
    }
    expect(variance(filtered.slice(20))).toBeLessThan(variance(raw.slice(20)) * 0.45);
  });

  it('follows sustained movement instead of remaining permanently delayed', () => {
    const filter = new OneEuroFilter({ minCutoff: 1, beta: 0.35 });
    for (let index = 0; index < 30; index += 1) filter.filter(0, index * 16);
    let output = 0;
    for (let index = 1; index <= 60; index += 1) {
      output = filter.filter(index / 60, (index + 30) * 16);
    }
    expect(output).toBeGreaterThan(0.85);
    expect(output).toBeLessThanOrEqual(1);
  });

  it('initializes a low-pass filter without inventing a zero transient', () => {
    const filter = new LowPassFilter();
    expect(filter.filter(4, 0.1)).toBe(4);
    expect(filter.filter(6, 0.5)).toBe(5);
  });
});

function variance(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}
