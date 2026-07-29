import { describe, expect, it } from 'vitest';
import { computeDerivedJoints } from './derivedJoints';

describe('derived joints', () => {
  it('uses specified midpoint and torso interpolation factors', () => {
    const result = computeDerivedJoints(
      {
        leftHip: { x: -1, y: 0, z: 0 },
        rightHip: { x: 1, y: 0, z: 0 },
        leftShoulder: { x: -2, y: 10, z: 0 },
        rightShoulder: { x: 2, y: 10, z: 0 },
      },
      { leftHip: 1, rightHip: 1, leftShoulder: 1, rightShoulder: 1 },
    );
    expect(result.positions.pelvisCenter).toEqual({ x: 0, y: 0, z: 0 });
    expect(result.positions.shoulderCenter).toEqual({ x: 0, y: 10, z: 0 });
    expect(result.positions.spineMid).toEqual({ x: 0, y: 5, z: 0 });
    expect(result.positions.chestCenter?.x).toBe(0);
    expect(result.positions.chestCenter?.y).toBeCloseTo(7.2, 10);
    expect(result.positions.chestCenter?.z).toBe(0);
  });

  it('does not create a derived point from insufficient confident sources', () => {
    const result = computeDerivedJoints(
      {
        leftHip: { x: -1, y: 0, z: 0 },
        rightHip: { x: 1, y: 0, z: 0 },
        nose: { x: 0, y: 2, z: 0 },
      },
      { leftHip: 0.9, rightHip: 0.2, nose: 1 },
    );
    expect(result.positions.pelvisCenter).toBeUndefined();
    expect(result.positions.headCenter).toBeUndefined();
  });
});
