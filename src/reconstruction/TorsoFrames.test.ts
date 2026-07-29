import { describe, expect, it } from 'vitest';
import { ensureQuaternionContinuity, quaternionDot } from '../filters/QuaternionSmoother';
import { dot, length } from '../utils/math';
import { calculateChestFrame, calculatePelvisFrame } from './TorsoFrames';

describe('torso coordinate frames', () => {
  const joints = {
    leftHip: { x: -0.7, y: 0, z: -0.1 },
    rightHip: { x: 0.7, y: 0.1, z: 0.1 },
    pelvisCenter: { x: 0, y: 0.05, z: 0 },
    leftShoulder: { x: -0.9, y: 1.7, z: 0.25 },
    rightShoulder: { x: 0.9, y: 1.8, z: 0.35 },
    shoulderCenter: { x: 0, y: 1.75, z: 0.3 },
  };

  it.each([
    ['pelvis', calculatePelvisFrame],
    ['chest', calculateChestFrame],
  ] as const)('creates an orthonormal right-handed %s frame', (_name, calculate) => {
    const frame = calculate(joints);
    expect(frame).not.toBeNull();
    expect(length(frame!.xAxis)).toBeCloseTo(1, 10);
    expect(length(frame!.yAxis)).toBeCloseTo(1, 10);
    expect(length(frame!.zAxis)).toBeCloseTo(1, 10);
    expect(dot(frame!.xAxis, frame!.yAxis)).toBeCloseTo(0, 10);
    expect(dot(frame!.xAxis, frame!.zAxis)).toBeCloseTo(0, 10);
    expect(dot(frame!.yAxis, frame!.zAxis)).toBeCloseTo(0, 10);
    const quaternion = frame!.quaternion;
    expect(Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w)).toBeCloseTo(1, 10);
  });

  it('preserves the previous valid frame for degenerate inputs', () => {
    const previous = calculatePelvisFrame(joints)!;
    const degenerate = calculatePelvisFrame(
      {
        leftHip: { x: 0, y: 0, z: 0 },
        rightHip: { x: 0, y: 0, z: 0 },
        pelvisCenter: { x: 0, y: 0, z: 0 },
        shoulderCenter: { x: 0, y: 0, z: 0 },
      },
      previous,
    );
    expect(degenerate).toEqual(previous);
  });

  it('negates equivalent quaternion signs to maintain interpolation continuity', () => {
    const previous = { x: 0.1, y: 0.2, z: 0.3, w: 0.9 };
    const opposite = { x: -0.1, y: -0.2, z: -0.3, w: -0.9 };
    const continuous = ensureQuaternionContinuity(previous, opposite);
    expect(quaternionDot(previous, continuous)).toBeGreaterThan(0);
    expect(continuous).toEqual(previous);
  });
});
