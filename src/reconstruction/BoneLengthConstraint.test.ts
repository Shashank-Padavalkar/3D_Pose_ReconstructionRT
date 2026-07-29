import { describe, expect, it } from 'vitest';
import { createDefaultCalibration } from '../calibration/BodyCalibration';
import type { JointName } from '../pose/landmarkNames';
import type { Vec3Data } from '../pose/poseTypes';
import { distance } from '../utils/math';
import { applyBoneLengthConstraints } from './BoneLengthConstraint';

describe('fixed bone-length constraints', () => {
  it('keeps every calibrated segment within 3% under deterministic positional noise', () => {
    const calibration = createDefaultCalibration();
    Object.assign(calibration, {
      shoulderWidth: 0.4,
      hipWidth: 0.3,
      torsoLength: 0.6,
      neckLength: 0.25,
      leftUpperArmLength: 0.32,
      rightUpperArmLength: 0.32,
      leftForearmLength: 0.27,
      rightForearmLength: 0.27,
      leftThighLength: 0.45,
      rightThighLength: 0.45,
      leftShinLength: 0.43,
      rightShinLength: 0.43,
      leftFootLength: 0.24,
      rightFootLength: 0.24,
    });
    const constrained = applyBoneLengthConstraints(noisySkeleton(), calibration);

    expectLength(constrained, 'leftHip', 'rightHip', calibration.hipWidth);
    expectLength(constrained, 'leftShoulder', 'rightShoulder', calibration.shoulderWidth);
    expectLength(constrained, 'pelvisCenter', 'shoulderCenter', calibration.torsoLength);
    expectLength(constrained, 'neckCenter', 'headCenter', calibration.neckLength);
    expectLength(constrained, 'leftShoulder', 'leftElbow', calibration.leftUpperArmLength);
    expectLength(constrained, 'leftElbow', 'leftWrist', calibration.leftForearmLength);
    expectLength(constrained, 'rightShoulder', 'rightElbow', calibration.rightUpperArmLength);
    expectLength(constrained, 'rightElbow', 'rightWrist', calibration.rightForearmLength);
    expectLength(constrained, 'leftHip', 'leftKnee', calibration.leftThighLength);
    expectLength(constrained, 'leftKnee', 'leftAnkle', calibration.leftShinLength);
    expectLength(constrained, 'rightHip', 'rightKnee', calibration.rightThighLength);
    expectLength(constrained, 'rightKnee', 'rightAnkle', calibration.rightShinLength);
    expectLength(constrained, 'leftHeel', 'leftFootIndex', calibration.leftFootLength);
    expectLength(constrained, 'rightHeel', 'rightFootIndex', calibration.rightFootLength);
  });
});

function expectLength(
  positions: Partial<Record<JointName, Vec3Data>>,
  from: JointName,
  to: JointName,
  expected: number,
): void {
  expect(positions[from]).toBeDefined();
  expect(positions[to]).toBeDefined();
  const actual = distance(positions[from]!, positions[to]!);
  expect(Math.abs(actual - expected) / expected).toBeLessThan(0.03);
}

function noisySkeleton(): Partial<Record<JointName, Vec3Data>> {
  return {
    pelvisCenter: { x: 0.015, y: -0.01, z: 0.008 },
    leftHip: { x: -0.19, y: 0.02, z: -0.01 },
    rightHip: { x: 0.17, y: -0.015, z: 0.015 },
    shoulderCenter: { x: -0.02, y: 0.67, z: 0.04 },
    leftShoulder: { x: -0.26, y: 0.64, z: 0.01 },
    rightShoulder: { x: 0.24, y: 0.69, z: 0.07 },
    leftElbow: { x: -0.61, y: 0.46, z: -0.03 },
    rightElbow: { x: 0.58, y: 0.43, z: 0.08 },
    leftWrist: { x: -0.91, y: 0.31, z: -0.01 },
    rightWrist: { x: 0.9, y: 0.34, z: 0.05 },
    leftHandCenter: { x: -0.98, y: 0.28, z: 0.02 },
    rightHandCenter: { x: 0.98, y: 0.3, z: 0.04 },
    headCenter: { x: 0.01, y: 1.02, z: 0.06 },
    leftKnee: { x: -0.18, y: -0.52, z: 0.05 },
    rightKnee: { x: 0.2, y: -0.48, z: -0.04 },
    leftAnkle: { x: -0.17, y: -1.04, z: 0.02 },
    rightAnkle: { x: 0.19, y: -1.01, z: -0.02 },
    leftHeel: { x: -0.17, y: -1.08, z: -0.08 },
    rightHeel: { x: 0.19, y: -1.06, z: -0.1 },
    leftFootIndex: { x: -0.16, y: -1.07, z: 0.25 },
    rightFootIndex: { x: 0.18, y: -1.05, z: 0.28 },
  };
}
