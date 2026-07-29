import { describe, expect, it } from 'vitest';
import { FootGrounder } from './FootGrounding';

describe('FootGrounder', () => {
  it('puts the first valid foot on the floor and smooths later correction changes', () => {
    const grounder = new FootGrounder({ smoothingTimeSeconds: 0.1 });
    const first = grounder.ground(
      {
        leftHeel: { x: 0, y: -0.5, z: 0 },
        leftAnkle: { x: 0, y: -0.45, z: 0 },
      },
      0,
    );
    expect(first.positions.leftHeel?.y).toBeCloseTo(0, 10);

    const second = grounder.ground(
      {
        leftHeel: { x: 0, y: -0.4, z: 0 },
        leftAnkle: { x: 0, y: -0.35, z: 0 },
      },
      16,
    );
    expect(second.verticalOffset).toBeLessThan(0.5);
    expect(second.verticalOffset).toBeGreaterThan(0.4);
  });
});
