import { describe, expect, it } from 'vitest';
import { normalizeAngleDeg } from '../utils/math';
import { jointAngleDeg, lineTiltDeg, quaternionYawDeg } from './angles';

describe('pose angle calculations', () => {
  it('calculates interior joint angles and returns null for degenerate input', () => {
    expect(
      jointAngleDeg({ x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }),
    ).toBeCloseTo(90, 10);
    expect(
      jointAngleDeg({ x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
    ).toBeCloseTo(180, 10);
    expect(
      jointAngleDeg({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
    ).toBeNull();
  });

  it('calculates tilt and relative quaternion yaw', () => {
    expect(lineTiltDeg({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 })).toBeCloseTo(45, 10);
    const half = Math.PI / 4;
    expect(
      quaternionYawDeg(
        { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) },
        { x: 0, y: 0, z: 0, w: 1 },
      ),
    ).toBeCloseTo(90, 10);
  });

  it('normalizes angle wraparound to a stable signed range', () => {
    expect(normalizeAngleDeg(190)).toBe(-170);
    expect(normalizeAngleDeg(-190)).toBe(170);
    expect(normalizeAngleDeg(540)).toBe(-180);
  });
});
