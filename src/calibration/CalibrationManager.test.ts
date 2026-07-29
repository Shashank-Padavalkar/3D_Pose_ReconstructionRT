import { afterEach, describe, expect, it } from 'vitest';
import { ALL_JOINT_NAMES, type JointName } from '../pose/landmarkNames';
import type { Vec3Data } from '../pose/poseTypes';
import { CalibrationManager } from './CalibrationManager';
import { createDefaultCalibration } from './BodyCalibration';
import {
  CALIBRATION_STORAGE_KEY,
  clearCalibration,
  loadCalibration,
  saveCalibration,
} from './calibrationStorage';

describe('CalibrationManager', () => {
  it('collects 60 confidence-qualified samples and uses robust medians', () => {
    const manager = new CalibrationManager();
    const pose = neutralPose();
    const confidences = Object.fromEntries(
      Object.keys(pose).map((name) => [name, 0.95]),
    ) as Partial<Record<JointName, number>>;

    for (let index = 0; index < 60; index += 1) {
      const scale = 1 + (index - 29.5) * 0.0002;
      const result = manager.addSample(scalePose(pose, scale), confidences, {
        normalizedPelvisCenter: { x: 0.5, y: 0.65 },
        normalizedShoulderCenter: { x: 0.5, y: 0.35 },
        pelvisOrientation: { x: 0, y: 0, z: 0, w: 1 },
        chestOrientation: { x: 0, y: 0, z: 0, w: 1 },
      });
      expect(result.accepted).toBe(true);
    }

    expect(manager.isReady).toBe(true);
    expect(manager.isComplete).toBe(false);
    const calibration = manager.finalize();
    expect(calibration.sampleCount).toBe(60);
    expect(calibration.shoulderWidth).toBeCloseTo(0.4, 6);
    expect(calibration.hipWidth).toBeCloseTo(0.3, 6);
    expect(calibration.torsoLength).toBeCloseTo(0.6, 6);
    expect(calibration.leftUpperArmLength).toBeCloseTo(calibration.rightUpperArmLength, 12);
    expect(calibration.reference.normalizedTorsoScale).toBeCloseTo(0.3, 8);
  });

  it('rejects a low-confidence sample without incrementing progress', () => {
    const manager = new CalibrationManager({ minimumSamples: 1, targetSamples: 1 });
    const result = manager.addSample(neutralPose(), {});
    // Missing confidence values are treated as valid only when a corresponding point exists.
    expect(result.accepted).toBe(true);
    manager.reset();
    const confidence = Object.fromEntries(
      Object.keys(neutralPose()).map((name) => [name, 0.1]),
    ) as Partial<Record<JointName, number>>;
    const rejected = manager.addSample(neutralPose(), confidence);
    expect(rejected).toMatchObject({
      accepted: false,
      acceptedSamples: 0,
      reason: 'low-confidence',
    });
  });
});

describe('calibration storage', () => {
  afterEach(() => localStorage.removeItem(CALIBRATION_STORAGE_KEY));

  it('round-trips valid plain calibration JSON and rejects malformed JSON', () => {
    const profile = createDefaultCalibration();
    expect(saveCalibration(profile)).toBe(true);
    expect(loadCalibration()).toEqual(profile);
    expect(clearCalibration()).toBe(true);
    expect(loadCalibration()).toBeNull();

    localStorage.setItem(CALIBRATION_STORAGE_KEY, '{not json');
    expect(loadCalibration()).toBeNull();
  });
});

function neutralPose(): Partial<Record<JointName, Vec3Data>> {
  return {
    leftShoulder: { x: -0.2, y: 0.6, z: 0 },
    rightShoulder: { x: 0.2, y: 0.6, z: 0 },
    leftElbow: { x: -0.5, y: 0.45, z: 0 },
    rightElbow: { x: 0.5, y: 0.45, z: 0 },
    leftWrist: { x: -0.75, y: 0.3, z: 0 },
    rightWrist: { x: 0.75, y: 0.3, z: 0 },
    leftHip: { x: -0.15, y: 0, z: 0 },
    rightHip: { x: 0.15, y: 0, z: 0 },
    leftKnee: { x: -0.15, y: -0.45, z: 0 },
    rightKnee: { x: 0.15, y: -0.45, z: 0 },
    leftAnkle: { x: -0.15, y: -0.9, z: 0 },
    rightAnkle: { x: 0.15, y: -0.9, z: 0 },
    leftHeel: { x: -0.15, y: -0.94, z: -0.05 },
    rightHeel: { x: 0.15, y: -0.94, z: -0.05 },
    leftFootIndex: { x: -0.15, y: -0.94, z: 0.2 },
    rightFootIndex: { x: 0.15, y: -0.94, z: 0.2 },
    nose: { x: 0, y: 0.94, z: 0.1 },
    leftEar: { x: -0.08, y: 0.9, z: 0 },
    rightEar: { x: 0.08, y: 0.9, z: 0 },
  };
}

function scalePose(
  pose: Partial<Record<JointName, Vec3Data>>,
  amount: number,
): Partial<Record<JointName, Vec3Data>> {
  const scaled: Partial<Record<JointName, Vec3Data>> = {};
  for (const name of ALL_JOINT_NAMES) {
    const point = pose[name];
    if (point) {
      scaled[name] = { x: point.x * amount, y: point.y * amount, z: point.z * amount };
    }
  }
  return scaled;
}
