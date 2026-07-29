import { describe, expect, it } from 'vitest';
import { confidenceLevel, gateConfidence, landmarkConfidence } from './confidence';

describe('confidence gating', () => {
  it('uses the conservative minimum of visibility and presence', () => {
    expect(landmarkConfidence({ visibility: 0.9, presence: 0.55 })).toBe(0.55);
    expect(
      landmarkConfidence({ visibility: 0.7 } as { visibility: number; presence: number }),
    ).toBe(0.7);
  });

  it('separates normal, strongly-smoothed and predicted observations', () => {
    expect(confidenceLevel(0.65)).toBe('high');
    expect(gateConfidence(0.64)).toBe('smooth');
    expect(gateConfidence(0.4)).toBe('smooth');
    expect(gateConfidence(0.399)).toBe('predict');
    expect(gateConfidence(Number.NaN)).toBe('predict');
  });
});
